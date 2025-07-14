import * as vscode from "vscode";
import * as path from "path";
import { simpleGit, SimpleGit } from "simple-git";
import { GitStatsWebView, ChartData } from "./webviewPanel";
import { CustomQuery } from "./savedConfigsProvider";

export class GitStatsCommands {
  private git: SimpleGit | undefined;
  private authors: string[] = [];

  constructor() {
    this.initGit();
  }

  private async initGit() {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (workspaceFolders && workspaceFolders.length > 0) {
      const rootPath = workspaceFolders[0].uri.fsPath;
      this.git = simpleGit(rootPath);

      try {
        const isRepo = await this.git.checkIsRepo();
        if (!isRepo) {
          vscode.window.showErrorMessage(
            "The current workspace is not a git repository."
          );
          this.git = undefined;
        } else {
          // Get all authors for filtering
          await this.loadAuthors();
        }
      } catch (error) {
        vscode.window.showErrorMessage("Error initializing git: " + error);
        this.git = undefined;
      }
    } else {
      vscode.window.showErrorMessage("No workspace folder open.");
    }
  }

  private async loadAuthors() {
    if (!this.git) {
      return;
    }

    try {
      const result = await this.git.raw(["shortlog", "-sne", "--all"]);
      this.authors = result
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => {
          const match = line.match(/^\s*\d+\s+(.+?)\s+<(.+?)>$/);
          if (match) {
            return match[1]; // Extract name only
          }
          return "";
        })
        .filter((author) => author !== "");
    } catch (error) {
      console.error("Error loading authors:", error);
    }
  }

  private getDateFilterArgs(filter: any) {
    const args = [];

    if (filter.dateAfter) {
      args.push("--after=" + filter.dateAfter);
    } else {
      // Default to 1 month ago if no dateAfter is provided
      const dateOneMonthAgo = new Date();
      dateOneMonthAgo.setMonth(dateOneMonthAgo.getMonth() - 1);
      args.push("--after=" + dateOneMonthAgo.toISOString().split("T")[0]);
    }

    if (filter.dateBefore) {
      args.push("--before=" + filter.dateBefore);
    } else {
      // Default to today if no dateBefore is provided
      const dateToday = new Date();
      args.push("--before=" + dateToday.toISOString().split("T")[0]);
    }

    if (filter.author && filter.author !== "") {
      args.push("--author=" + filter.author);
    }

    return args;
  }

  private async executeCommand(
    statsCommand: string,
    title: string,
    command: (filter: any) => Promise<{
      content: string;
      chartData?: ChartData;
      insights?: string[];
    }>,
    filter: any = {}
  ): Promise<void> {
    if (!this.git) {
      await this.initGit();
      if (!this.git) {
        return;
      }
    }

    try {
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Generating ${title}...`,
          cancellable: false,
        },
        async (progress) => {
          progress.report({ increment: 0 });

          const result = await command(filter);

          // Get the webview panel and update content
          const webviewPanel = GitStatsWebView.createOrShow(
            vscode.Uri.file(vscode.workspace.workspaceFolders![0].uri.fsPath),
            title
          );
          webviewPanel.updateContent(
            statsCommand,
            title,
            result.content,
            this.authors,
            filter,
            result.chartData,
            result.insights
          );

          progress.report({ increment: 100 });
        }
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Error getting ${title}: ${error}`);
    }
  }

  // Generate insights based on git stats
  private async generateInsights(filter?: any): Promise<string[]> {
    const insights: string[] = [];

    try {
      // Most active day of week
      const weekdayStats = await this.git!.raw([
        "log",
        '--format="%ad"',
        "--date=format:%u",
        "--all",
        ...(filter ? this.getDateFilterArgs(filter) : []),
      ]);

      const weekdayCounts: Record<string, number> = {
        "1": 0,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
        "6": 0,
        "7": 0,
      };
      weekdayStats
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => line.replace(/"/g, ""))
        .forEach((day) => {
          if (weekdayCounts[day] !== undefined) {
            weekdayCounts[day]++;
          }
        });

      const weekdays = [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ];
      let mostActiveDay = "1";
      let maxCommits = 0;

      for (const [day, count] of Object.entries(weekdayCounts)) {
        if (count > maxCommits) {
          mostActiveDay = day;
          maxCommits = count;
        }
      }

      insights.push(
        `Most active day is ${
          weekdays[parseInt(mostActiveDay) - 1]
        } with ${maxCommits} commits.`
      );

      // Most active author
      const authorStats = await this.git!.raw(["shortlog", "-sn", "--all"]);
      const authorMatch = authorStats
        .split("\n")[0]
        ?.match(/^\s*(\d+)\s+(.+)$/);
      if (authorMatch) {
        insights.push(
          `Most active contributor is ${authorMatch[2]} with ${authorMatch[1]} commits.`
        );
      }

      // Repository age
      const firstCommitDate = await this.git!.raw([
        "log",
        "--reverse",
        '--format="%ad"',
        "--date=short",
        "--all",
      ]);
      const firstCommit = firstCommitDate.split("\n")[0]?.replace(/"/g, "");
      if (firstCommit) {
        const firstDate = new Date(firstCommit);
        const now = new Date();
        const ageInDays = Math.floor(
          (now.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        const ageInYears = (ageInDays / 365).toFixed(1);
        insights.push(
          `Repository is ${ageInDays} days old (${ageInYears} years).`
        );
      }

      // Code churn
      const churnStats = await this.git!.raw([
        "log",
        '--format=""',
        "--numstat",
      ]);
      const lines = churnStats
        .split("\n")
        .filter((line) => line.match(/^\d+\s+\d+\s+/));

      let totalInsertions = 0;
      let totalDeletions = 0;

      lines.forEach((line) => {
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          totalInsertions += parseInt(parts[0], 10) || 0;
          totalDeletions += parseInt(parts[1], 10) || 0;
        }
      });

      insights.push(
        `Total lines added: ${totalInsertions}, total lines deleted: ${totalDeletions}, ratio: ${(
          totalInsertions / (totalDeletions || 1)
        ).toFixed(2)}`
      );

      // Hot files (most changed)
      const filesStats = await this.git!.raw([
        "log",
        "--name-only",
        //'--pretty=""',
        "--all",
      ]);
      const files = filesStats.split("\n").filter((file) => file.trim() !== "");

      const fileCounts: Record<string, number> = {};
      files.forEach((file) => {
        if (!fileCounts[file]) {
          fileCounts[file] = 0;
        }
        fileCounts[file]++;
      });

      const sortedFiles = Object.entries(fileCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      if (sortedFiles.length > 0) {
        insights.push(
          `Hot files: ${sortedFiles
            .map(([file, count]) => `${file} (${count} changes)`)
            .join(", ")}`
        );
      }
    } catch (error) {
      console.error("Error generating insights:", error);
    }

    return insights;
  }

  // Execute a custom git query
  async executeCustomQuery(query: CustomQuery): Promise<void> {
    if (!this.git) {
      await this.initGit();
      if (!this.git) {
        return;
      }
    }

    try {
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Executing "${query.name}"...`,
          cancellable: false,
        },
        async (progress) => {
          progress.report({ increment: 0 });

          const queryParts = query.query.split(" ");
          const result = await this.git!.raw(queryParts);

          // Format the output in a table if possible
          let formattedResult = result;
          if (result.includes("|")) {
            const lines = result
              .split("\n")
              .filter((line) => line.trim() !== "");
            if (lines.length > 0) {
              const headers = lines[0].split("|").map((h) => h.trim());
              formattedResult = headers.join(" | ") + "\n";
              formattedResult += headers.map(() => "---").join(" | ") + "\n";

              for (let i = 1; i < lines.length; i++) {
                formattedResult +=
                  lines[i]
                    .split("|")
                    .map((c) => c.trim())
                    .join(" | ") + "\n";
              }
            }
          }

          // Get the webview panel and update content
          const webviewPanel = GitStatsWebView.createOrShow(
            vscode.Uri.file(vscode.workspace.workspaceFolders![0].uri.fsPath),
            `Custom Query: ${query.name}`
          );
          webviewPanel.updateContent(
            "gitQuickStats.executeCustomQuery",
            `Custom Query: ${query.name}`,
            formattedResult,
            this.authors,
            {}
          );

          progress.report({ increment: 100 });
        }
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Error executing custom query: ${error}`);
    }
  }

  // Compare stats between branches or time periods
  async showComparison(filter: any = {}): Promise<void> {
    if (!this.git) {
      await this.initGit();
      if (!this.git) {
        return;
      }
    }

    try {
      // Ask user what to compare
      const comparisonType = await vscode.window.showQuickPick(
        ["Branches", "Time Periods"],
        { placeHolder: "Select comparison type" }
      );

      if (!comparisonType) {
        return;
      }

      let sourceName = "";
      let targetName = "";
      let sourceFilter = {};
      let targetFilter = {};

      if (comparisonType === "Branches") {
        // Get list of branches
        const branchResult = await this.git!.branch();
        const branches = branchResult.all;

        const sourceBranch = await vscode.window.showQuickPick(branches, {
          placeHolder: "Select source branch",
        });

        if (!sourceBranch) {
          return;
        }

        const targetBranch = await vscode.window.showQuickPick(
          branches.filter((b) => b !== sourceBranch),
          { placeHolder: "Select target branch" }
        );

        if (!targetBranch) {
          return;
        }

        sourceName = sourceBranch;
        targetName = targetBranch;

        sourceFilter = { branch: sourceBranch };
        targetFilter = { branch: targetBranch };
      } else {
        // Time periods
        const periods = [
          { label: "Last week", value: { days: 7 } },
          { label: "Last month", value: { days: 30 } },
          { label: "Last 3 months", value: { days: 90 } },
          { label: "Last 6 months", value: { days: 180 } },
          { label: "Last year", value: { days: 365 } },
          { label: "Custom period", value: "custom" },
        ];

        const sourcePeriod = await vscode.window.showQuickPick(periods, {
          placeHolder: "Select source time period",
        });

        if (!sourcePeriod) {
          return;
        }

        const targetPeriod = await vscode.window.showQuickPick(
          periods.filter((p) => p.label !== sourcePeriod.label),
          { placeHolder: "Select target time period" }
        );

        if (!targetPeriod) {
          return;
        }

        sourceName = sourcePeriod.label;
        targetName = targetPeriod.label;

        // Calculate date ranges
        sourceFilter = this.calculateDateRange(sourcePeriod.value);
        targetFilter = this.calculateDateRange(targetPeriod.value);
      }

      // Ask what stats to compare
      const statType = await vscode.window.showQuickPick(
        ["Commits by Author", "Commits by Day", "Code Changes"],
        { placeHolder: "Select stat type to compare" }
      );

      if (!statType) {
        return;
      }

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Comparing ${sourceName} vs ${targetName}...`,
          cancellable: false,
        },
        async (progress) => {
          progress.report({ increment: 0 });

          let sourceContent = "";
          let targetContent = "";

          // Generate the appropriate stats based on selection
          if (statType === "Commits by Author") {
            sourceContent = await this.getCommitsByAuthorRaw(sourceFilter);
            targetContent = await this.getCommitsByAuthorRaw(targetFilter);
          } else if (statType === "Commits by Day") {
            sourceContent = await this.getCommitsByWeekdayRaw(sourceFilter);
            targetContent = await this.getCommitsByWeekdayRaw(targetFilter);
          } else {
            sourceContent = await this.getCodeChangesRaw(sourceFilter);
            targetContent = await this.getCodeChangesRaw(targetFilter);
          }

          const comparisonData = {
            source: {
              title: sourceName,
              content: sourceContent,
            },
            target: {
              title: targetName,
              content: targetContent,
            },
          };

          // Get the webview panel and update content with comparison view
          const webviewPanel = GitStatsWebView.createOrShow(
            vscode.Uri.file(vscode.workspace.workspaceFolders![0].uri.fsPath),
            `Comparing ${sourceName} vs ${targetName}`
          );
          webviewPanel.updateContent(
            "gitQuickStats.showComparison",
            `Comparing ${sourceName} vs ${targetName}`,
            "",
            this.authors,
            {},
            null,
            null,
            true,
            comparisonData
          );

          progress.report({ increment: 100 });
        }
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Error comparing stats: ${error}`);
    }
  }

  private calculateDateRange(periodValue: any): any {
    if (periodValue === "custom") {
      // For custom, we would show a date picker, but for now let's use default values
      return {};
    }

    const now = new Date();
    const dateBefore = now.toISOString().split("T")[0];

    const dateAfter = new Date(now);
    dateAfter.setDate(dateAfter.getDate() - periodValue.days);

    return {
      dateAfter: dateAfter.toISOString().split("T")[0],
      dateBefore: dateBefore,
    };
  }

  private async getCommitsByAuthorRaw(filter: any): Promise<string> {
    const filterArgs = this.getDateFilterArgs(filter);
    let args = ["shortlog", "-sn", "--no-merges"];

    if (filter.branch) {
      args.push(filter.branch);
    }

    args = args.concat(filterArgs);
    const result = await this.git!.raw(args);

    // Format for better display
    const lines = result.split("\n").filter((line) => line.trim() !== "");

    let output = "Author | Commits\n";
    output += "-------|--------\n";

    for (const line of lines) {
      const match = line.match(/^\s*(\d+)\s+(.+)$/);
      if (match) {
        const commits = match[1];
        const author = match[2];
        output += `${author} | ${commits}\n`;
      }
    }

    return output;
  }

  private async getCommitsByWeekdayRaw(filter: any): Promise<string> {
    const filterArgs = this.getDateFilterArgs(filter);
    let args = ["log", '--format="%H|%ad"', "--date=format-local:%u", "--all"];

    if (filter.branch) {
      args.pop(); // Remove --all
      args.push(filter.branch);
    }

    args = args.concat(filterArgs);

    const result = await this.git!.raw(args);

    // Process the data to get weekday frequency
    const weekdays = result
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => {
        const parts = line.split("|");
        if (parts.length >= 2) {
          return parts[1].replace(/"/g, "");
        }
        return "";
      })
      .filter((weekday) => weekday !== "");

    const weekdayNames = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ];
    const weekdayCounts: Record<string, number> = {};

    // Initialize counts
    for (let i = 1; i <= 7; i++) {
      weekdayCounts[i.toString()] = 0;
    }

    weekdays.forEach((weekday) => {
      if (weekdayCounts[weekday] !== undefined) {
        weekdayCounts[weekday]++;
      }
    });

    let output = "Weekday | Commits\n";
    output += "--------|--------\n";

    for (let i = 1; i <= 7; i++) {
      const dayName = weekdayNames[i - 1];
      output += `${dayName} | ${weekdayCounts[i.toString()]}\n`;
    }

    return output;
  }

  private async getCodeChangesRaw(filter: any): Promise<string> {
    const filterArgs = this.getDateFilterArgs(filter);
    let args = ["log", "--numstat", "--format=%H"];

    if (filter.branch) {
      args.push(filter.branch);
    } else {
      args.push("--all");
    }

    args = args.concat(filterArgs);

    const result = await this.git!.raw(args);

    const lines = result.split("\n");
    let totalInsertions = 0;
    let totalDeletions = 0;
    let totalFiles = 0;

    for (const line of lines) {
      const match = line.match(/^(\d+)\s+(\d+)\s+(.+)$/);
      if (match) {
        totalInsertions += parseInt(match[1], 10);
        totalDeletions += parseInt(match[2], 10);
        totalFiles++;
      }
    }

    let output = "Metric | Value\n";
    output += "-------|------\n";
    output += `Files Changed | ${totalFiles}\n`;
    output += `Lines Added | ${totalInsertions}\n`;
    output += `Lines Deleted | ${totalDeletions}\n`;
    output += `Total Changes | ${totalInsertions + totalDeletions}\n`;

    return output;
  }

  // Show Git Insights
  async showInsights(filter: any = {}): Promise<void> {
    await this.executeCommand(
      "gitQuickStats.showInsights",
      "Git Insights",
      async (filter) => {
        const insights = await this.generateInsights(filter);

        // Get some basic stats to display
        const statsResult = await this.git!.raw(["shortlog", "-sn", "--all"]);
        const commitCount = await this.git!.raw([
          "rev-list",
          "--count",
          "--all",
        ]);
        const branchCount = (await this.git!.branch()).all.length;

        let content = "Metric | Value\n";
        content += "-------|------\n";
        content += `Total Commits | ${commitCount.trim()}\n`;
        content += `Total Branches | ${branchCount}\n`;
        content += `Total Contributors | ${
          statsResult.split("\n").filter((line) => line.trim() !== "").length
        }\n`;

        // Prepare chart data for commit activity over time
        const chartData = await this.prepareCommitActivityChart(filter);

        return {
          content,
          chartData,
          insights,
        };
      },
      filter
    );
  }

  private async prepareCommitActivityChart(filter: any): Promise<ChartData> {
    // Get commits by month for last year
    const dateNow = new Date();
    const dateOneYearAgo = new Date();
    dateOneYearAgo.setFullYear(dateOneYearAgo.getFullYear() - 1);

    const args = [
      "log",
      `--after=${dateOneYearAgo.toISOString().split("T")[0]}`,
      '--format="%ad"',
      "--date=format:%Y-%m",
      "--all",
    ];

    const result = await this.git!.raw(args);

    const months = result
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => line.replace(/"/g, ""));

    const monthCounts: Record<string, number> = {};

    // Initialize all months to 0
    for (let i = 0; i < 12; i++) {
      const date = new Date(dateOneYearAgo);
      date.setMonth(dateOneYearAgo.getMonth() + i);
      const monthKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;
      monthCounts[monthKey] = 0;
    }

    // Count commits per month
    months.forEach((month) => {
      if (monthCounts[month] !== undefined) {
        monthCounts[month]++;
      }
    });

    // Prepare chart data
    const sortedMonths = Object.keys(monthCounts).sort();
    const labels = sortedMonths.map((month) => {
      const [year, monthNum] = month.split("-");
      const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      return `${monthNames[parseInt(monthNum) - 1]} ${year}`;
    });

    const values = sortedMonths.map((month) => monthCounts[month]);

    return {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Commits per Month",
            data: values,
            backgroundColor: "rgba(75, 192, 192, 0.2)",
            borderColor: "rgba(75, 192, 192, 1)",
            borderWidth: 1,
          },
        ],
      },
    };
  }

  // Detailed Git Stats
  async showDetailedStats(filter: any = {}): Promise<void> {
    await this.executeCommand(
      "gitQuickStats.showDetailedStats",
      "Detailed Git Stats",
      async (filter) => {
        const filterArgs = this.getDateFilterArgs(filter);
        const args = [
          "log",
          '--format="commit: %H%nDate: %aI%nAuthor: %an <%ae>%nMessage: %s%n"',
          "--numstat",
        ].concat(filterArgs);

        const result = await this.git!.raw(args);

        // Format for better display
        const commits = result
          .split("\n\n")
          .filter((commit) => commit.trim() !== "");

        let content =
          "Commit | Date | Author | Message | Files Changed | Insertions | Deletions\n";
        content +=
          "------|------|--------|---------|---------------|-----------|----------\n";

        for (const commit of commits) {
          const lines = commit.split("\n");
          let hash = "",
            date = "",
            author = "",
            message = "";
          let filesChanged = 0,
            insertions = 0,
            deletions = 0;

          for (const line of lines) {
            if (line.startsWith("commit: ")) {
              hash = line.substring(8).trim();
            } else if (line.startsWith("Date: ")) {
              date = line.substring(6).trim();
            } else if (line.startsWith("Author: ")) {
              author = line.substring(8).trim();
            } else if (line.startsWith("Message: ")) {
              message = line.substring(9).trim();
            } else {
              // Parse file stats
              const statMatch = line.match(/^(\d+)\s+(\d+)\s+.+$/);
              if (statMatch) {
                filesChanged++;
                insertions += parseInt(statMatch[1], 10);
                deletions += parseInt(statMatch[2], 10);
              }
            }
          }

          content += `${hash.substring(
            0,
            7
          )} | ${date} | ${author} | ${message} | ${filesChanged} | ${insertions} | ${deletions}\n`;
        }

        // Generate insights
        const insights = await this.generateInsights(filter);

        // Prepare chart data for file types modified
        const fileTypesData = await this.prepareFileTypesChart(filter);

        return {
          content,
          chartData: fileTypesData,
          insights,
        };
      },
      filter
    );
  }

  private async prepareFileTypesChart(filter: any): Promise<ChartData> {
    const filterArgs = this.getDateFilterArgs(filter);
    const args = ["log", "--name-only" /*, '--format=""'*/].concat(filterArgs);

    const result = await this.git!.raw(args);

    const files = result.split("\n").filter((file) => file.trim() !== "");
    const fileTypes: Record<string, number> = {};

    files.forEach((file) => {
      const extension = file.includes(".")
        ? file.split(".").pop()!.toLowerCase()
        : "none";
      if (!fileTypes[extension]) {
        fileTypes[extension] = 0;
      }
      fileTypes[extension]++;
    });

    // Sort by frequency and take top 10
    const sortedTypes = Object.entries(fileTypes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    return {
      type: "pie",
      data: {
        labels: sortedTypes.map(([type]) =>
          type === "none" ? "(no extension)" : `.${type}`
        ),
        datasets: [
          {
            label: "File Types",
            data: sortedTypes.map(([, count]) => count),
            backgroundColor: [
              "rgba(255, 99, 132, 0.6)",
              "rgba(54, 162, 235, 0.6)",
              "rgba(255, 206, 86, 0.6)",
              "rgba(75, 192, 192, 0.6)",
              "rgba(153, 102, 255, 0.6)",
              "rgba(255, 159, 64, 0.6)",
              "rgba(199, 199, 199, 0.6)",
              "rgba(83, 102, 255, 0.6)",
              "rgba(40, 159, 64, 0.6)",
              "rgba(210, 199, 199, 0.6)",
            ],
          },
        ],
      },
    };
  }

  // Show Commits by Author
  async showCommitsByAuthor(filter: any = {}): Promise<void> {
    await this.executeCommand(
      "gitQuickStats.showCommitsByAuthor",
      "Commits by Author",
      async (filter) => {
        const filterArgs = this.getDateFilterArgs(filter);
        const args = ["shortlog", "-sn", "--no-merges"].concat(filterArgs);
        const result = await this.git!.raw(args);

        // Format for better display
        const lines = result.split("\n").filter((line) => line.trim() !== "");

        let content = "Author | Commits\n";
        content += "-------|--------\n";

        const chartData: ChartData = {
          type: "bar",
          data: {
            labels: [],
            datasets: [
              {
                label: "Commits by Author",
                data: [],
                backgroundColor: "rgba(54, 162, 235, 0.6)",
                borderColor: "rgba(54, 162, 235, 1)",
                borderWidth: 1,
              },
            ],
          },
        };

        for (const line of lines) {
          const match = line.match(/^\s*(\d+)\s+(.+)$/);
          if (match) {
            const commits = match[1];
            const author = match[2];
            content += `${author} | ${commits}\n`;

            // Add to chart data
            chartData.data.labels.push(author);
            chartData.data.datasets[0].data.push(parseInt(commits, 10));
          }
        }

        // Limit to top 10 authors for chart readability
        if (chartData.data.labels.length > 10) {
          chartData.data.labels = chartData.data.labels.slice(0, 10);
          chartData.data.datasets[0].data =
            chartData.data.datasets[0].data.slice(0, 10);
        }

        // Generate insights
        const insights = await this.generateInsights(filter);

        return {
          content,
          chartData,
          insights,
        };
      },
      filter
    );
  }

  // Show Commits by Hour of Day
  async showCommitsByHourDay(filter: any = {}): Promise<void> {
    await this.executeCommand(
      "gitQuickStats.showCommitsByHourDay",
      "Commits by Hour of Day",
      async (filter) => {
        const filterArgs = this.getDateFilterArgs(filter);
        const args = [
          "log",
          '--format="%H|%ad"',
          "--date=format-local:%H",
          "--all",
        ].concat(filterArgs);

        const result = await this.git!.raw(args);

        // Process the data to get hour frequency
        const hours = result
          .split("\n")
          .filter((line) => line.trim() !== "")
          .map((line) => {
            const parts = line.split("|");
            if (parts.length >= 2) {
              return parts[1].replace(/"/g, "");
            }
            return "";
          })
          .filter((hour) => hour !== "");

        const hourCounts: Record<string, number> = {};

        for (let i = 0; i < 24; i++) {
          const hour = i.toString().padStart(2, "0");
          hourCounts[hour] = 0;
        }

        hours.forEach((hour) => {
          if (hourCounts[hour] !== undefined) {
            hourCounts[hour]++;
          }
        });

        let content = "Hour of Day | Commits\n";
        content += "------------|--------\n";

        for (let i = 0; i < 24; i++) {
          const hour = i.toString().padStart(2, "0");
          content += `${hour}:00 - ${hour}:59 | ${hourCounts[hour]}\n`;
        }

        // Create chart data
        const chartData: ChartData = {
          type: "bar",
          data: {
            labels: Array.from(
              { length: 24 },
              (_, i) => `${i.toString().padStart(2, "0")}:00`
            ),
            datasets: [
              {
                label: "Commits by Hour of Day",
                data: Array.from(
                  { length: 24 },
                  (_, i) => hourCounts[i.toString().padStart(2, "0")]
                ),
                backgroundColor: "rgba(75, 192, 192, 0.2)",
                borderColor: "rgba(75, 192, 192, 1)",
                borderWidth: 2,
              },
            ],
          },
        };

        // Generate productivity insights
        const productiveHours: string[] = [];
        let maxCommits = 0;

        Object.entries(hourCounts).forEach(([hour, count]) => {
          if (count > maxCommits) {
            maxCommits = count;
            productiveHours.length = 0;
            productiveHours.push(hour);
          } else if (count === maxCommits) {
            productiveHours.push(hour);
          }
        });

        const insights = [
          `Most productive hour${
            productiveHours.length > 1 ? "s are" : " is"
          } ${productiveHours
            .map((h) => `${h}:00-${h}:59`)
            .join(", ")} with ${maxCommits} commits.`,
        ];

        return {
          content,
          chartData,
          insights,
        };
      },
      filter
    );
  }

  async showCommitsByMonth(filter: any = {}): Promise<void> {
    await this.executeCommand(
      "gitQuickStats.showCommitsByMonth",
      "Commits by Month",
      async (filter) => {
        const filterArgs = this.getDateFilterArgs(filter);
        const args = [
          "log",
          '--format="%H|%ad"',
          "--date=format-local:%Y-%m",
          "--all",
        ].concat(filterArgs);

        const result = await this.git!.raw(args);

        // Process the data to get month frequency
        const months = result
          .split("\n")
          .filter((line) => line.trim() !== "")
          .map((line) => {
            const parts = line.split("|");
            if (parts.length >= 2) {
              return parts[1].replace(/"/g, "");
            }
            return "";
          })
          .filter((month) => month !== "");

        const monthCounts: Record<string, number> = {};

        months.forEach((month) => {
          if (!monthCounts[month]) {
            monthCounts[month] = 0;
          }
          monthCounts[month]++;
        });

        let content = "Month | Commits\n";
        content += "-------|--------\n";

        Object.entries(monthCounts).forEach(([month, count]) => {
          content += `${month} | ${count}\n`;
        });

        // Create chart data
        const chartData: ChartData = {
          type: "bar",
          data: {
            labels: Object.keys(monthCounts),
            datasets: [
              {
                label: "Commits by Month",
                data: Object.values(monthCounts),
                backgroundColor: "rgba(153, 102, 255, 0.2)",
                borderColor: "rgba(153, 102, 255, 1)",
                borderWidth: 2,
              },
            ],
          },
          options: {
            responsive: true,
          },
        };

        // Generate insights
        const insights = await this.generateInsights(filter);

        return {
          content,
          chartData,
          insights,
        };
      },
      filter
    );
  }

  // Show Git Activity with visualization
  async showGitActivity(filter: any = {}): Promise<void> {
    await this.executeCommand(
      "gitQuickStats.showGitActivity",
      "Git Activity",
      async (filter) => {
        const filterArgs = this.getDateFilterArgs(filter);
        const activityArgs = ["log", "--all", '--format="%ar|%an|%s"'].concat(
          filterArgs
        );
        const timelineArgs = ["log", '--format="%at|%s"'].concat(filterArgs);

        const result = await this.git!.raw(activityArgs);
        const timelineResult = await this.git!.raw(timelineArgs);

        const lines = result
          .split("\n")
          .filter((line) => line.trim() !== "")
          .map((line) => line.replace(/^"|"$/g, ""));

        let content = "Time | Author | Message\n";
        content += "-----|--------|--------\n";

        lines.forEach((line) => {
          const [time, author, ...messageParts] = line.split("|");
          const message = messageParts.join("|"); // In case message contains |
          content += `${time} | ${author} | ${message}\n`;
        });

        // Create a timeline chart
        const timestamps = timelineResult
          .split("\n")
          .filter((line) => line.trim() !== "")
          .map((line) => {
            const [timestamp] = line.replace(/^"|"$/g, "").split("|");
            return parseInt(timestamp, 10) * 1000; // Convert to milliseconds
          });

        // Group commits by day
        const commitsByDay: Record<string, number> = {};
        timestamps.forEach((timestamp) => {
          const date = new Date(timestamp).toISOString().split("T")[0];
          if (!commitsByDay[date]) {
            commitsByDay[date] = 0;
          }
          commitsByDay[date]++;
        });

        // Sort dates and prepare chart data
        const sortedDates = Object.keys(commitsByDay).sort();

        const chartData: ChartData = {
          type: "line",
          data: {
            labels: sortedDates.slice(-30), // Last 30 days
            datasets: [
              {
                label: "Commits per Day",
                data: sortedDates.slice(-30).map((date) => commitsByDay[date]),
                backgroundColor: "rgba(153, 102, 255, 0.2)",
                borderColor: "rgba(153, 102, 255, 1)",
                borderWidth: 2,
              },
            ],
          },
        };

        // Generate activity insights
        const today = new Date().toISOString().split("T")[0];
        const yesterday = new Date(Date.now() - 86400000)
          .toISOString()
          .split("T")[0];

        const insights = [
          `Total commits in period: ${timestamps.length}`,
          `Commits today: ${commitsByDay[today] || 0}`,
          `Commits yesterday: ${commitsByDay[yesterday] || 0}`,
          `Average commits per day: ${(
            timestamps.length / Math.max(sortedDates.length, 1)
          ).toFixed(2)}`,
        ];

        return {
          content,
          chartData,
          insights,
        };
      },
      filter
    );
  }

  // Show Git Effort with visualization
  async showGitEffort(filter: any = {}): Promise<void> {
    await this.executeCommand(
      "gitQuickStats.showGitEffort",
      "Git Effort",
      async (filter) => {
        // Get list of files
        const filesResult = await this.git!.raw(["ls-files"]);
        const files = filesResult.split("\n").filter((f) => f.trim() !== "");

        // Get commit count for each file
        const fileStats: Record<string, number> = {};
        const filterArgs = this.getDateFilterArgs(filter);

        // Limit to 100 files for performance
        const filesToProcess = files.slice(0, 100);

        for (const file of filesToProcess) {
          try {
            const args = ["log", "--follow", '--format="%H"', "--"]
              .concat([file])
              .concat(filterArgs);
            const commitCount = await this.git!.raw(args);

            const count = commitCount
              .split("\n")
              .filter((line) => line.trim() !== "").length;
            fileStats[file] = count;
          } catch (error) {
            // Skip files that might have issues
          }
        }

        let content = "File | Commits\n";
        content += "-----|--------\n";

        // Sort by commit count (descending)
        const sortedFiles = Object.entries(fileStats).sort(
          ([, countA], [, countB]) => countB - countA
        );

        sortedFiles.forEach(([file, count]) => {
          content += `${file} | ${count}\n`;
        });

        // Create chart for top 10 files
        const top10Files = sortedFiles.slice(0, 10);

        const chartData: ChartData = {
          type: "bar",
          data: {
            labels: top10Files.map(([file]) => {
              // Truncate long file paths for readability
              return file.length > 30 ? "..." + file.slice(-30) : file;
            }),
            datasets: [
              {
                label: "Commit Count",
                data: top10Files.map(([, count]) => count),
                backgroundColor: "rgba(255, 159, 64, 0.6)",
                borderColor: "rgba(255, 159, 64, 1)",
                borderWidth: 1,
              },
            ],
          },
        };

        // Generate insights about files
        const insights = [
          `Most frequently modified file: ${top10Files[0]?.[0]} (${top10Files[0]?.[1]} commits)`,
          `Analyzed ${filesToProcess.length} files out of ${files.length} total files`,
        ];

        if (top10Files.length >= 3) {
          insights.push(
            `Hot files: ${top10Files
              .slice(0, 3)
              .map(([file, count]) => `${file} (${count} commits)`)
              .join(", ")}`
          );
        }

        return {
          content,
          chartData,
          insights,
        };
      },
      filter
    );
  }

  async showCommitsByHourWeek(filter: any = {}): Promise<void> {
    await this.executeCommand(
      "gitQuickStats.showCommitsByHourWeek",
      "Commits by Hour of Week",
      async (filter) => {
        const filterArgs = this.getDateFilterArgs(filter);
        const args = [
          "log",
          '--format="%H|%ad"',
          "--date=format-local:%u %H",
          "--all",
        ].concat(filterArgs);

        const result = await this.git!.raw(args);

        // Process the data to get hour frequency
        const hours = result
          .split("\n")
          .filter((line) => line.trim() !== "")
          .map((line) => {
            const parts = line.split("|");
            if (parts.length >= 2) {
              return parts[1].replace(/"/g, "");
            }
            return "";
          })
          .filter((hour) => hour !== "");

        const hourCounts: Record<string, number> = {};

        // Initialize counts for each hour of each day
        for (let day = 1; day <= 7; day++) {
          for (let hour = 0; hour < 24; hour++) {
            const key = `${day} ${hour.toString().padStart(2, "0")}`;
            hourCounts[key] = 0;
          }
        }

        hours.forEach((hour) => {
          const [day, hourStr] = hour.split(" ");
          const key = `${day} ${hourStr}`;
          if (hourCounts[key] !== undefined) {
            hourCounts[key]++;
          }
        });

        let content = "Day | Hour | Commits\n";
        content += "----|------|--------\n";

        for (let day = 1; day <= 7; day++) {
          for (let hour = 0; hour < 24; hour++) {
            const key = `${day} ${hour.toString().padStart(2, "0")}`;
            content += `${day} | ${hour}:00 - ${hour}:59 | ${hourCounts[key]}\n`;
          }
        }

        // Generate insights about weekly activity
        const insights = [];
        const mostActiveDay = Object.entries(hourCounts).reduce(
          (max, [key, count]) => {
            const [day] = key.split(" ");
            if (count > max.count) {
              return { day, count };
            }
            return max;
          },
          { day: "", count: 0 }
        );
        insights.push(
          `Most active day is ${mostActiveDay.day} with ${mostActiveDay.count} commits.`
        );
        const totalCommits = Object.values(hourCounts).reduce(
          (sum, count) => sum + count,
          0
        );
        insights.push(`Total commits in period: ${totalCommits}.`);
        insights.push(
          `Average commits per hour: ${(totalCommits / 168).toFixed(2)}.`
        );
        insights.push(
          `Average commits per day: ${(totalCommits / 7).toFixed(2)}.`
        );
        insights.push(
          `Average commits per hour of day: ${(totalCommits / 24).toFixed(2)}.`
        );
        insights.push(
          `Average commits per hour of week: ${(totalCommits / 168).toFixed(
            2
          )}.`
        );

        // Create chart data
        const chartData: ChartData = {
          type: "line",
          data: {
            labels: Array.from({ length: 168 }, (_, i) => {
              const day = Math.floor(i / 24) + 1; // 1-7 for days
              const hour = i % 24; // 0-23 for hours
              return `Day ${day} ${hour.toString().padStart(2, "0")}:00`;
            }),
            datasets: [
              {
                label: "Commits by Hour of Week",
                data: Object.keys(hourCounts).map(
                  (key) => hourCounts[key] || 0
                ),
                backgroundColor: "rgba(255, 99, 132, 0.2)",
                borderColor: "rgba(255, 99, 132, 1)",
                borderWidth: 1,
              },
            ],
          },
        };

        return {
          content,
          chartData,
          insights,
        };
      }
    );
  }

  async showCommitsByWeekday(filter: any = {}): Promise<void> {
    await this.executeCommand(
      "gitQuickStats.showCommitsByWeekday",
      "Commits by Weekday",
      async (filter) => {
        const filterArgs = this.getDateFilterArgs(filter);
        const args = [
          "log",
          '--format="%H|%ad"',
          "--date=format-local:%u",
          "--all",
        ].concat(filterArgs);

        const result = await this.git!.raw(args);

        // Process the data to get weekday frequency
        const weekdays = result
          .split("\n")
          .filter((line) => line.trim() !== "")
          .map((line) => {
            const parts = line.split("|");
            if (parts.length >= 2) {
              return parts[1].replace(/"/g, "");
            }
            return "";
          })
          .filter((weekday) => weekday !== "");

        const weekdayCounts: Record<string, number> = {};

        // Initialize counts for each weekday
        for (let i = 1; i <= 7; i++) {
          weekdayCounts[i.toString()] = 0;
        }

        weekdays.forEach((weekday) => {
          if (weekdayCounts[weekday] !== undefined) {
            weekdayCounts[weekday]++;
          }
        });

        let content = "Weekday | Commits\n";
        content += "--------|--------\n";

        for (let i = 1; i <= 7; i++) {
          content += `${i} | ${weekdayCounts[i.toString()]}\n`;
        }

        // Generate insights about weekly activity
        const insights = [];
        const mostActiveWeekday = Object.entries(weekdayCounts).reduce(
          (max, [key, count]) => {
            if (count > max.count) {
              return { day: key, count };
            }
            return max;
          },
          { day: "", count: 0 }
        );
        insights.push(
          `Most active weekday is ${mostActiveWeekday.day} with ${mostActiveWeekday.count} commits.`
        );
        const totalCommits = Object.values(weekdayCounts).reduce(
          (sum, count) => sum + count,
          0
        );
        insights.push(`Total commits in period: ${totalCommits}.`);
        insights.push(
          `Average commits per weekday: ${(totalCommits / 7).toFixed(2)}.`
        );
        insights.push(
          `Average commits per day: ${(totalCommits / 7).toFixed(2)}.`
        );
        insights.push(
          `Average commits per hour of day: ${(totalCommits / 168).toFixed(2)}.`
        );
        insights.push(
          `Average commits per hour of week: ${(totalCommits / 168).toFixed(
            2
          )}.`
        );
        // Create chart data
        const chartData: ChartData = {
          type: "bar",
          data: {
            labels: Object.keys(weekdayCounts).map((day) => `Day ${day}`),
            datasets: [
              {
                label: "Commits by Weekday",
                data: Object.values(weekdayCounts),
                backgroundColor: "rgba(75, 192, 192, 0.2)",
                borderColor: "rgba(75, 192, 192, 1)",
                borderWidth: 1,
              },
            ],
          },
        };
        return {
          content,
          chartData,
          insights,
        };
      }
    );
  }

  async showCommitsByYear(filter: any = {}): Promise<void> {
    await this.executeCommand(
      "gitQuickStats.showCommitsByYear",
      "Commits by Year",
      async (filter) => {
        const filterArgs = this.getDateFilterArgs(filter);
        const args = [
          "log",
          '--format="%H|%ad"',
          "--date=format-local:%Y",
          "--all",
        ].concat(filterArgs);

        const result = await this.git!.raw(args);

        // Process the data to get year frequency
        const years = result
          .split("\n")
          .filter((line) => line.trim() !== "")
          .map((line) => {
            const parts = line.split("|");
            if (parts.length >= 2) {
              return parts[1].replace(/"/g, "");
            }
            return "";
          })
          .filter((year) => year !== "");

        const yearCounts: Record<string, number> = {};

        years.forEach((year) => {
          if (!yearCounts[year]) {
            yearCounts[year] = 0;
          }
          yearCounts[year]++;
        });

        let content = "Year | Commits\n";
        content += "-----|--------\n";

        Object.entries(yearCounts).forEach(([year, count]) => {
          content += `${year} | ${count}\n`;
        });

        // Create chart data
        const chartData: ChartData = {
          type: "bar",
          data: {
            labels: Object.keys(yearCounts),
            datasets: [
              {
                label: "Commits by Year",
                data: Object.values(yearCounts),
                backgroundColor: "rgba(153, 102, 255, 0.2)",
                borderColor: "rgba(153, 102, 255, 1)",
                borderWidth: 2,
              },
            ],
          },
        };

        // Generate insights about yearly activity
        const insights = [];
        const mostActiveYear = Object.entries(yearCounts).reduce(
          (max, [key, count]) => {
            if (count > max.count) {
              return { year: key, count };
            }
            return max;
          },
          { year: "", count: 0 }
        );
        insights.push(
          `Most active year is ${mostActiveYear.year} with ${mostActiveYear.count} commits.`
        );
        const totalCommits = Object.values(yearCounts).reduce(
          (sum, count) => sum + count,
          0
        );
        insights.push(`Total commits in period: ${totalCommits}.`);
        insights.push(
          `Average commits per year: ${(
            totalCommits / Object.keys(yearCounts).length
          ).toFixed(2)}.`
        );
        insights.push(
          `Average commits per month: ${(
            totalCommits /
            (Object.keys(yearCounts).length * 12)
          ).toFixed(2)}.`
        );
        insights.push(
          `Average commits per day: ${(
            totalCommits /
            (Object.keys(yearCounts).length * 365)
          ).toFixed(2)}.`
        );
        insights.push(
          `Average commits per hour of day: ${(
            totalCommits /
            (Object.keys(yearCounts).length * 8760)
          ).toFixed(2)}.`
        );
        insights.push(
          `Average commits per hour of week: ${(
            totalCommits /
            (Object.keys(yearCounts).length * 8760)
          ).toFixed(2)}.`
        );
        return {
          content,
          chartData,
          insights,
        };
      }
    );
  }

  async showContributorStats(filter: any = {}): Promise<void> {
    await this.executeCommand(
      "gitQuickStats.showContributorStats",
      "Contributor Stats",
      async (filter) => {
        const filterArgs = this.getDateFilterArgs(filter);
        const args = ["shortlog", "-sn", "--no-merges"].concat(filterArgs);

        const result = await this.git!.raw(args);

        // Format for better display
        const lines = result.split("\n").filter((line) => line.trim() !== "");

        let content = "Author | Commits\n";
        content += "-------|--------\n";

        const chartData: ChartData = {
          type: "bar",
          data: {
            labels: [],
            datasets: [
              {
                label: "Commits by Author",
                data: [],
                backgroundColor: "rgba(54, 162, 235, 0.6)",
                borderColor: "rgba(54, 162, 235, 1)",
                borderWidth: 1,
              },
            ],
          },
        };

        for (const line of lines) {
          const match = line.match(/^\s*(\d+)\s+(.+)$/);
          if (match) {
            const commits = match[1];
            const author = match[2];
            content += `${author} | ${commits}\n`;

            // Add to chart data
            chartData.data.labels.push(author);
            chartData.data.datasets[0].data.push(parseInt(commits, 10));
          }
        }

        // Limit to top 10 authors for chart readability
        if (chartData.data.labels.length > 10) {
          chartData.data.labels = chartData.data.labels.slice(0, 10);
          chartData.data.datasets[0].data =
            chartData.data.datasets[0].data.slice(0, 10);
        }

        // Generate insights
        const insights = await this.generateInsights(filter);

        return {
          content,
          chartData,
          insights,
        };
      },
      filter
    );
  }

  // Show Branch Stats for all branches with visualization
  async showBranchStats(filter: any = {}): Promise<void> {
    await this.executeCommand(
      "gitQuickStats.showBranchStats",
      "Branch Stats",
      async () => {
        const branchResult = await this.git!.branch();
        const allBranches = branchResult.all;

        // Map: branch -> commit count
        const branchStats: Record<string, number> = {};

        for (const branch of allBranches) {
          try {
            // Get commit count for branch
            const commitCount = await this.git!.raw([
              "rev-list",
              "--count",
              branch,
            ]);
            branchStats[branch] = Number(commitCount.trim());
          } catch {
            branchStats[branch] = 0;
          }
        }

        // Prepare table content
        let content = "Branch | Commits\n";
        content += "-------|--------\n";
        Object.entries(branchStats)
          .sort(([, a], [, b]) => b - a)
          .forEach(([branch, count]) => {
            content += `${branch} | ${count}\n`;
          });

        // Prepare chart data (top 10 branches by commits)
        const topBranches = Object.entries(branchStats)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10);

        const chartData = {
          type: "bar" as const,
          data: {
            labels: topBranches.map(([branch]) => branch),
            datasets: [
              {
                label: "Commit Count",
                data: topBranches.map(([, count]) => count),
                backgroundColor: "rgba(54, 162, 235, 0.6)",
                borderColor: "rgba(54, 162, 235, 1)",
                borderWidth: 1,
              },
            ],
          },
        };

        const insights = [
          `Branch with most commits: ${topBranches[0]?.[0]} (${
            topBranches[0]?.[1] ?? 0
          } commits)`,
          `Total branches: ${allBranches.length}`,
        ];

        return {
          content,
          chartData,
          insights,
        };
      },
      filter
    );
  }

  async showChangelog(filter: any = {}): Promise<void> {
    await this.executeCommand(
      "gitQuickStats.showChangelog",
      "Changelog",
      async (filter) => {
        const filterArgs = this.getDateFilterArgs(filter);
        const args = ["log", '--format="%h %s (%an, %ar)"'].concat(filterArgs);

        const result = await this.git!.raw(args);

        // Format for better display
        const lines = result.split("\n").filter((line) => line.trim() !== "");

        let content = "Commit | Message | Author | Date\n";
        content += "-------|---------|--------|-----\n";

        lines.forEach((line) => {
          const parts = line.split(" ");
          const commitHash = parts[0];
          const message = parts.slice(1, -2).join(" ");
          const author = parts[parts.length - 2];
          const date = parts[parts.length - 1];
          content += `${commitHash} | ${message} | ${author} | ${date}\n`;
        });

        // Generate insights
        const insights = await this.generateInsights(filter);

        return {
          content,
          insights,
        };
      },
      filter
    );
  }

  async showCodeSuggestors(filter: any = {}): Promise<void> {
    await this.executeCommand(
      "gitQuickStats.showCodeSuggestors",
      "Code Suggestors",
      async (filter) => {
        const filterArgs = this.getDateFilterArgs(filter);
        const args = ["log", '--format="%h %s (%an, %ar)"'].concat(filterArgs);

        const result = await this.git!.raw(args);

        // Format for better display
        const lines = result.split("\n").filter((line) => line.trim() !== "");

        let content = "Commit | Message | Author | Date\n";
        content += "-------|---------|--------|-----\n";

        lines.forEach((line) => {
          const parts = line.split(" ");
          const commitHash = parts[0];
          const message = parts.slice(1, -2).join(" ");
          const author = parts[parts.length - 2];
          const date = parts[parts.length - 1];
          content += `${commitHash} | ${message} | ${author} | ${date}\n`;
        });

        // Generate insights
        const insights = await this.generateInsights(filter);

        return {
          content,
          insights,
        };
      },
      filter
    );
  }
}
