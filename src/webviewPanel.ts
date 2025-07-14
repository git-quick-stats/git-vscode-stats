import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export interface ChartData {
  type: "bar" | "line" | "pie" | "doughnut";
  data: {
    labels: string[];
    datasets: {
      label: string;
      data: number[];
      backgroundColor?: string | string[];
      borderColor?: string | string[];
      borderWidth?: number;
    }[];
  };
  options?: {
    responsive?: boolean;
    maintainAspectRatio?: boolean;
    scales?: {
      xAxes?: {
        display?: boolean;
        gridLines?: {
          display?: boolean;
        };
      }[];
      yAxes?: {
        display?: boolean;
        gridLines?: {
          display?: boolean;
        };
      }[];
    };
  };
}

export class GitStatsWebView {
  public static currentPanel: GitStatsWebView | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, title: string) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it
    if (GitStatsWebView.currentPanel) {
      GitStatsWebView.currentPanel._panel.reveal(column);
      GitStatsWebView.currentPanel._panel.title = title;
      return GitStatsWebView.currentPanel;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      "gitQuickStats",
      title,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
      }
    );

    GitStatsWebView.currentPanel = new GitStatsWebView(panel, extensionUri);
    return GitStatsWebView.currentPanel;
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programmatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case "filterChanged":
            vscode.commands.executeCommand(message.statsCommand, {
              dateAfter: message.dateAfter,
              dateBefore: message.dateBefore,
              author: message.author,
            });
            return;
          case "export":
            this.handleExport(message.format, message.title, message.data);
            return;
          case "saveConfiguration":
            vscode.commands.executeCommand("gitQuickStats.saveConfiguration", {
              name: message.name,
              statsCommand: message.statsCommand,
              dateAfter: message.dateAfter,
              dateBefore: message.dateBefore,
              author: message.author,
            });
            return;
          case "saveCustomQuery":
            vscode.commands.executeCommand("gitQuickStats.saveCustomQuery", {
              name: message.name,
              query: message.query,
            });
            return;
        }
      },
      null,
      this._disposables
    );
  }

  public updateContent(
    statsCommand: string,
    title: string,
    content: string,
    authors: string[],
    filter: any = {},
    chartData?: ChartData | null,
    insights?: string[] | null,
    comparisonMode: boolean = false,
    comparisonData?: any
  ) {
    // Set default filter values if not provided
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const dateAfter =
      filter.dateAfter || sixMonthsAgo.toISOString().split("T")[0];
    const dateBefore =
      filter.dateBefore || new Date().toISOString().split("T")[0];
    const author = filter.author || "";

    this._panel.webview.html = this._getHtmlForWebview(
      statsCommand,
      title,
      content,
      authors,
      dateAfter,
      dateBefore,
      author,
      chartData,
      insights,
      comparisonMode,
      comparisonData
    );
  }

  private async handleExport(format: string, title: string, data: string) {
    try {
      const options = {
        defaultUri: vscode.Uri.file(`${title.replace(/\s+/g, "_")}.${format}`),
        filters: { [format.toUpperCase()]: [format] },
      };

      const fileUri = await vscode.window.showSaveDialog(options);

      if (fileUri) {
        let content = "";

        switch (format) {
          case "csv":
            content = this.convertToCSV(data);
            break;
          case "json":
            content = this.convertToJSON(data);
            break;
          case "html":
            content = this.convertToHTML(title, data);
            break;
        }

        fs.writeFileSync(fileUri.fsPath, content);
        vscode.window.showInformationMessage(
          `Successfully exported to ${fileUri.fsPath}`
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Export failed: ${error}`);
    }
  }

  private convertToCSV(data: string): string {
    // Parse the HTML table data to CSV
    const rows = data.match(/<tr>(.+?)<\/tr>/gs);
    if (!rows) {
      return "";
    }

    return rows
      .map((row) => {
        const cells = row.match(/<t[hd]>(.+?)<\/t[hd]>/g);
        if (!cells) {
          return "";
        }
        return cells
          .map((cell) => {
            const content = cell.replace(/<t[hd]>(.+?)<\/t[hd]>/g, "$1");
            return `"${content.replace(/"/g, '""')}"`;
          })
          .join(",");
      })
      .join("\n");
  }

  private convertToJSON(data: string): string {
    // Parse the HTML table data to JSON
    const result: any[] = [];
    const rows = data.match(/<tr>(.+?)<\/tr>/gs);

    if (!rows || rows.length < 2) {
      return "[]";
    }

    // Extract header cells
    const headerCells = rows[0].match(/<th>(.+?)<\/th>/g);
    if (!headerCells) {
      return "[]";
    }

    const headers = headerCells.map((cell) =>
      cell.replace(/<th>(.+?)<\/th>/g, "$1")
    );

    // Process data rows
    for (let i = 1; i < rows.length; i++) {
      const dataCells = rows[i].match(/<td>(.+?)<\/td>/g);
      if (!dataCells) {
        continue;
      }

      const values = dataCells.map((cell) =>
        cell.replace(/<td>(.+?)<\/td>/g, "$1")
      );

      const rowObject: any = {};
      headers.forEach((header, index) => {
        rowObject[header] = values[index] || "";
      });

      result.push(rowObject);
    }

    return JSON.stringify(result, null, 2);
  }

  private convertToHTML(title: string, data: string): string {
    return `<!DOCTYPE html>
        <html>
        <head>
            <title>${title}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { color: #333; }
                table { border-collapse: collapse; width: 100%; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f2f2f2; }
            </style>
        </head>
        <body>
            <h1>${title}</h1>
            <div>${data}</div>
        </body>
        </html>`;
  }

  private _getHtmlForWebview(
    statsCommand: string,
    title: string,
    content: string,
    authors: string[],
    dateAfter: string,
    dateBefore: string,
    selectedAuthor: string,
    chartData?: ChartData | null,
    insights?: string[] | null,
    comparisonMode: boolean = false,
    comparisonData?: any
  ) {
    // Process content to HTML based on format (detect if it's a table)
    let htmlContent = "";

    if (content.includes("|")) {
      // Convert pipe-delimited content to HTML table
      const rows = content.split("\n").filter((row) => row.trim() !== "");

      if (rows.length > 0) {
        htmlContent = '<table class="stats-table">';

        // Header row
        const headerCells = rows[0]
          .split("|")
          .map((cell) => `<th>${cell.trim()}</th>`)
          .join("");
        htmlContent += `<tr>${headerCells}</tr>`;

        // Separator row (if exists)
        if (rows.length > 1 && rows[1].includes("-")) {
          // Skip separator row
        }

        // Data rows
        for (let i = 1; i < rows.length; i++) {
          if (rows[i].includes("-|-") || rows[i].match(/^[-|]+$/)) {
            continue; // Skip separator rows
          }

          const cells = rows[i]
            .split("|")
            .map((cell) => `<td>${cell.trim()}</td>`)
            .join("");
          htmlContent += `<tr>${cells}</tr>`;
        }

        htmlContent += "</table>";
      }
    } else {
      // Just format as pre
      htmlContent = `<pre>${content}</pre>`;
    }

    // Generate comparison view if in comparison mode
    let comparisonHtml = "";
    if (comparisonMode && comparisonData) {
      comparisonHtml = `
            <div class="comparison-container">
                <h2>Comparison View</h2>
                <div class="comparison-section">
                    <div class="comparison-column">
                        <h3>${comparisonData.source.title}</h3>
                        <div>${comparisonData.source.content}</div>
                    </div>
                    <div class="comparison-column">
                        <h3>${comparisonData.target.title}</h3>
                        <div>${comparisonData.target.content}</div>
                    </div>
                </div>
            </div>`;
    }

    // Generate insights section if insights are provided
    let insightsHtml = "";
    if (insights && insights.length > 0) {
      insightsHtml = `
            <div class="insights-panel">
                <h2>📊 Git Insights</h2>
                <ul>
                    ${insights.map((insight) => `<li>${insight}</li>`).join("")}
                </ul>
            </div>`;
    }

    // Generate chart section if chart data is provided
    let chartHtml = "";
    if (chartData) {
      const chartId = `chart-${Math.random().toString(36).substring(2, 15)}`;
      chartHtml = `
            <div class="chart-container">
                <canvas id="${chartId}" width="640" height="280"></canvas>
                <script>
                    const ctx = document.getElementById('${chartId}');
                    new Chart(ctx, ${JSON.stringify(chartData)});
                </script>
            </div>`;
    }

    // Construct the full HTML content
    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title}</title>
            <script src="https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js"></script>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-editor-foreground);
                    padding: 20px;
                }
                .filter-container {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                    margin-bottom: 20px;
                    padding: 10px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                }
                .filter-item {
                    display: flex;
                    flex-direction: column;
                    margin-right: 15px;
                }
                .filter-item label {
                    margin-bottom: 5px;
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                }
                .filter-item input, .filter-item select {
                    padding: 5px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 2px;
                }
                .button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 6px 12px;
                    border-radius: 2px;
                    cursor: pointer;
                    margin: 0 5px;
                }
                .button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .filter-button {
                    align-self: flex-end;
                }
                .button-group {
                    display: flex;
                    margin: 10px 0;
                    flex-wrap: wrap;
                    gap: 10px;
                }
                h1 {
                    font-size: 1.5em;
                    margin-bottom: 20px;
                    color: var(--vscode-editor-foreground);
                }
                h2 {
                    font-size: 1.3em;
                    margin-top: 20px;
                    color: var(--vscode-editor-foreground);
                }
                .stats-table {
                    border-collapse: collapse;
                    width: 100%;
                    margin-top: 20px;
                }
                .stats-table th, .stats-table td {
                    border: 1px solid var(--vscode-panel-border);
                    padding: 8px;
                    text-align: left;
                }
                .stats-table th {
                    background-color: var(--vscode-editor-lineHighlightBackground);
                }
                pre {
                    background-color: var(--vscode-editor-background);
                    padding: 10px;
                    border-radius: 4px;
                    overflow: auto;
                    white-space: pre-wrap;
                }
                .chart-container {
                    margin: 20px 0;
                    background-color: var(--vscode-editor-background);
                    padding: 10px;
                    border-radius: 4px;
                }
                .insights-panel {
                    margin: 20px 0;
                    padding: 10px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                }
                .insights-panel ul {
                    padding-left: 20px;
                }
                .insights-panel li {
                    margin: 8px 0;
                }
                .save-panel {
                    margin-top: 20px;
                    padding: 10px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    background-color: var(--vscode-editor-background);
                }
                .save-row {
                    display: flex;
                    align-items: center;
                    margin-bottom: 10px;
                }
                .save-row label {
                    width: 150px;
                    margin-right: 10px;
                }
                .comparison-container {
                    margin: 20px 0;
                    padding: 10px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                }
                .comparison-section {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 20px;
                }
                .comparison-column {
                    flex: 1;
                    min-width: 300px;
                    padding: 10px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                }
                .custom-query-panel {
                    margin-top: 20px;
                    padding: 10px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    background-color: var(--vscode-editor-background);
                }
                .custom-query-panel textarea {
                    width: 100%;
                    min-height: 100px;
                    margin: 10px 0;
                    padding: 8px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 2px;
                }
            </style>
        </head>
        <body>
            <h1>${title}</h1>
            
            <div class="filter-container">
                <div class="filter-item">
                    <label for="date-after">Date After</label>
                    <input type="date" id="date-after" value="${dateAfter}">
                </div>
                <div class="filter-item">
                    <label for="date-before">Date Before</label>
                    <input type="date" id="date-before" value="${dateBefore}">
                </div>
                <div class="filter-item">
                    <label for="author">Author</label>
                    <select id="author">
                        <option value="">All Authors</option>
                        ${authors
                          .map(
                            (author) =>
                              `<option value="${author}" ${
                                selectedAuthor === author ? "selected" : ""
                              }>${author}</option>`
                          )
                          .join("")}
                    </select>
                </div>
                <button class="button filter-button" id="apply-filters">Apply Filters</button>
            </div>
            
            <div class="button-group">
                <button class="button" id="export-csv">Export as CSV</button>
                <button class="button" id="export-json">Export as JSON</button>
                <button class="button" id="export-html">Export as HTML</button>
                <button class="button" id="show-save-panel">Save Configuration</button>
                <button class="button" id="show-custom-query">Custom Query</button>
            </div>

            
            <div id="save-configuration-panel" class="save-panel" style="display: none;">
                <h2>Save Current Configuration</h2>
                <div class="save-row">
                    <label for="config-name">Configuration Name:</label>
                    <input type="text" id="config-name" placeholder="My Favorite Filter">
                </div>
                <button class="button" id="save-configuration-btn">Save</button>
            </div>
            
            <div id="custom-query-panel" class="custom-query-panel" style="display: none;">
                <h2>Custom Git Query</h2>
                <div class="save-row">
                    <label for="query-name">Query Name:</label>
                    <input type="text" id="query-name" placeholder="My Custom Query">
                </div>
                <textarea id="query-content" placeholder="git log --format='%h|%an|%ad' --all"></textarea>
                <button class="button" id="save-query-btn">Save Query</button>
            </div>
            
            ${insightsHtml}
            
            ${chartHtml}
            
            <div id="stats-content">
                ${htmlContent}
            </div>
            
            ${comparisonHtml}
            
            
            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    
                    document.getElementById('apply-filters').addEventListener('click', () => {
                        const dateAfter = document.getElementById('date-after').value;
                        const dateBefore = document.getElementById('date-before').value;
                        const author = document.getElementById('author').value;
                        
                        vscode.postMessage({
                            command: 'filterChanged',
                            statsCommand: '${statsCommand}',
                            dateAfter: dateAfter,
                            dateBefore: dateBefore,
                            author: author
                        });
                    });
                    
                    document.getElementById('export-csv').addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'export',
                            format: 'csv',
                            title: '${title}',
                            data: document.getElementById('stats-content').innerHTML
                        });
                    });
                    
                    document.getElementById('export-json').addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'export',
                            format: 'json',
                            title: '${title}',
                            data: document.getElementById('stats-content').innerHTML
                        });
                    });
                    
                    document.getElementById('export-html').addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'export',
                            format: 'html',
                            title: '${title}',
                            data: document.getElementById('stats-content').innerHTML
                        });
                    });
                    
                    document.getElementById('show-save-panel').addEventListener('click', () => {
                        const panel = document.getElementById('save-configuration-panel');
                        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
                        document.getElementById('custom-query-panel').style.display = 'none';
                    });
                    
                    document.getElementById('show-custom-query').addEventListener('click', () => {
                        const panel = document.getElementById('custom-query-panel');
                        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
                        document.getElementById('save-configuration-panel').style.display = 'none';
                    });
                    
                    document.getElementById('save-configuration-btn').addEventListener('click', () => {
                        const name = document.getElementById('config-name').value;
                        if (!name) {
                            alert('Please enter a configuration name');
                            return;
                        }
                        
                        vscode.postMessage({
                            command: 'saveConfiguration',
                            name: name,
                            statsCommand: '${statsCommand}',
                            dateAfter: document.getElementById('date-after').value,
                            dateBefore: document.getElementById('date-before').value,
                            author: document.getElementById('author').value
                        });
                    });
                    
                    document.getElementById('save-query-btn').addEventListener('click', () => {
                        const name = document.getElementById('query-name').value;
                        const query = document.getElementById('query-content').value;
                        
                        if (!name || !query) {
                            alert('Please enter both a query name and query content');
                            return;
                        }
                        
                        vscode.postMessage({
                            command: 'saveCustomQuery',
                            name: name,
                            query: query
                        });
                    });
                })();
            </script>
        </body>
        </html>`;
  }

  public dispose() {
    GitStatsWebView.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
}
