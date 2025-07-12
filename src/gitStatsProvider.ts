import * as vscode from "vscode";
import * as path from "path";

export class GitStatsItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly command?: vscode.Command,
    public readonly contextValue?: string,
    public readonly children?: GitStatsItem[]
  ) {
    super(
      label,
      children
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    if (command) {
      this.command = command;
    }

    if (contextValue) {
      this.contextValue = contextValue;
    }
  }
}

export class GitStatsProvider implements vscode.TreeDataProvider<GitStatsItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    GitStatsItem | undefined | null
  > = new vscode.EventEmitter<GitStatsItem | undefined | null>();
  readonly onDidChangeTreeData: vscode.Event<GitStatsItem | undefined | null> =
    this._onDidChangeTreeData.event;

  constructor() {}

  refresh(): void {
    this._onDidChangeTreeData.fire(null);
  }

  getTreeItem(element: GitStatsItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: GitStatsItem): Promise<GitStatsItem[]> {
    if (element) {
      return element.children || [];
    }

    // Create categories for better organization
    const basicStats = new GitStatsItem(
      "Basic Statistics",
      undefined,
      undefined,
      [
        new GitStatsItem(
          "Detailed Git Stats",
          {
            command: "gitQuickStats.showDetailedStats",
            title: "Show detailed git stats",
            arguments: [],
          },
          "detailedStats"
        ),
        new GitStatsItem("Git Insights & Recommendations", {
          command: "gitQuickStats.showInsights",
          title: "Show git insights and recommendations",
          arguments: [],
        }),
      ]
    );

    const commitAnalysis = new GitStatsItem(
      "Commit Analysis",
      undefined,
      undefined,
      [
        new GitStatsItem("Commits by Author", {
          command: "gitQuickStats.showCommitsByAuthor",
          title: "Show commits by author",
          arguments: [],
        }),
        new GitStatsItem("Commits by Hour/Day", {
          command: "gitQuickStats.showCommitsByHourDay",
          title: "Show commits by hour of day",
          arguments: [],
        }),
        new GitStatsItem("Commits by Hour/Week", {
          command: "gitQuickStats.showCommitsByHourWeek",
          title: "Show commits by hour of week",
          arguments: [],
        }),
        new GitStatsItem("Commits by Month", {
          command: "gitQuickStats.showCommitsByMonth",
          title: "Show commits by month",
          arguments: [],
        }),
        new GitStatsItem("Commits by Weekday", {
          command: "gitQuickStats.showCommitsByWeekday",
          title: "Show commits by weekday",
          arguments: [],
        }),
        new GitStatsItem("Commits by Year", {
          command: "gitQuickStats.showCommitsByYear",
          title: "Show commits by year",
          arguments: [],
        }),
      ]
    );

    const repoAnalysis = new GitStatsItem(
      "Repository Analysis",
      undefined,
      undefined,
      [
        new GitStatsItem("Contributor Stats", {
          command: "gitQuickStats.showContributorStats",
          title: "Show contributor stats",
          arguments: [],
        }),
        new GitStatsItem("Branch Stats", {
          command: "gitQuickStats.showBranchStats",
          title: "Show branch stats",
          arguments: [],
        }),
        new GitStatsItem("Changelog", {
          command: "gitQuickStats.showChangelog",
          title: "Show changelog",
          arguments: [],
        }),
        new GitStatsItem("Code Suggestors", {
          command: "gitQuickStats.showCodeSuggestors",
          title: "Show code suggestors",
          arguments: [],
        }),
        new GitStatsItem("Git Effort", {
          command: "gitQuickStats.showGitEffort",
          title: "Show git effort",
          arguments: [],
        }),
        new GitStatsItem("Git Activity", {
          command: "gitQuickStats.showGitActivity",
          title: "Show git activity",
          arguments: [],
        }),
      ]
    );

    const advancedTools = new GitStatsItem(
      "Advanced Tools",
      undefined,
      undefined,
      [
        new GitStatsItem("Compare Stats", {
          command: "gitQuickStats.showComparison",
          title: "Compare stats between branches or time periods",
          arguments: [],
        }),
        new GitStatsItem("Save Current Configuration", {
          command: "gitQuickStats.saveConfiguration",
          title: "Save current configuration",
          arguments: [],
        }),
        new GitStatsItem("Create Custom Query", {
          command: "gitQuickStats.saveCustomQuery",
          title: "Create custom git query",
          arguments: [],
        }),
      ]
    );

    return [basicStats, commitAnalysis, repoAnalysis, advancedTools];
  }
}
