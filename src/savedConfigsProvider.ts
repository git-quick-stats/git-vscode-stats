import * as vscode from "vscode";

export class SavedConfiguration {
  constructor(
    public readonly name: string,
    public readonly statsCommand: string,
    public readonly dateAfter: string,
    public readonly dateBefore: string,
    public readonly author: string
  ) {}
}

export class CustomQuery {
  constructor(public readonly name: string, public readonly query: string) {}
}

export class SavedConfigurationsProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    vscode.TreeItem | undefined | null
  > = new vscode.EventEmitter<vscode.TreeItem | undefined | null>();
  readonly onDidChangeTreeData: vscode.Event<
    vscode.TreeItem | undefined | null
  > = this._onDidChangeTreeData.event;

  private configurations: SavedConfiguration[] = [];

  constructor(private context: vscode.ExtensionContext) {
    this.loadConfigurations();
  }

  refresh(): void {
    this.loadConfigurations();
    this._onDidChangeTreeData.fire(null);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<vscode.TreeItem[]> {
    return this.configurations.map((config) => {
      const item = new vscode.TreeItem(config.name);
      item.command = {
        command: config.statsCommand,
        title: "Load configuration",
        arguments: [
          {
            dateAfter: config.dateAfter,
            dateBefore: config.dateBefore,
            author: config.author,
          },
        ],
      };
      item.contextValue = "savedConfiguration";
      return item;
    });
  }

  private loadConfigurations(): void {
    const savedConfigs = this.context.globalState.get<SavedConfiguration[]>(
      "savedConfigurations",
      []
    );
    this.configurations = savedConfigs;
  }

  public saveConfiguration(config: SavedConfiguration): void {
    const savedConfigs = this.context.globalState.get<SavedConfiguration[]>(
      "savedConfigurations",
      []
    );

    // Check if a config with this name already exists
    const existingIndex = savedConfigs.findIndex((c) => c.name === config.name);

    if (existingIndex >= 0) {
      savedConfigs[existingIndex] = config;
    } else {
      savedConfigs.push(config);
    }

    this.context.globalState.update("savedConfigurations", savedConfigs);
    this.refresh();
  }

  public deleteConfiguration(name: string): void {
    const savedConfigs = this.context.globalState.get<SavedConfiguration[]>(
      "savedConfigurations",
      []
    );
    const updatedConfigs = savedConfigs.filter((c) => c.name !== name);
    this.context.globalState.update("savedConfigurations", updatedConfigs);
    this.refresh();
  }
}

export class CustomQueriesProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    vscode.TreeItem | undefined | null
  > = new vscode.EventEmitter<vscode.TreeItem | undefined | null>();
  readonly onDidChangeTreeData: vscode.Event<
    vscode.TreeItem | undefined | null
  > = this._onDidChangeTreeData.event;

  private queries: CustomQuery[] = [];

  constructor(private context: vscode.ExtensionContext) {
    this.loadQueries();
  }

  refresh(): void {
    this.loadQueries();
    this._onDidChangeTreeData.fire(null);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<vscode.TreeItem[]> {
    return this.queries.map((query) => {
      const item = new vscode.TreeItem(query.name);
      item.command = {
        command: "gitQuickStats.executeCustomQuery",
        title: "Execute custom query",
        arguments: [query],
      };
      item.contextValue = "customQuery";
      return item;
    });
  }

  private loadQueries(): void {
    const savedQueries = this.context.globalState.get<CustomQuery[]>(
      "customQueries",
      []
    );
    this.queries = savedQueries;
  }

  public saveQuery(query: CustomQuery): void {
    const savedQueries = this.context.globalState.get<CustomQuery[]>(
      "customQueries",
      []
    );

    // Check if a query with this name already exists
    const existingIndex = savedQueries.findIndex((q) => q.name === query.name);

    if (existingIndex >= 0) {
      savedQueries[existingIndex] = query;
    } else {
      savedQueries.push(query);
    }

    this.context.globalState.update("customQueries", savedQueries);
    this.refresh();
  }

  public deleteQuery(name: string): void {
    const savedQueries = this.context.globalState.get<CustomQuery[]>(
      "customQueries",
      []
    );
    const updatedQueries = savedQueries.filter((q) => q.name !== name);
    this.context.globalState.update("customQueries", updatedQueries);
    this.refresh();
  }
}
