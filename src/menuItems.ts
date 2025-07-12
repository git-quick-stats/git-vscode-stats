import * as vscode from "vscode";

export enum MenuItemId {
  CommitsPerAuthor = "commitsPerAuthor",
  CommitsPerDay = "commitsPerDay",
  ShowAll = "showAll",
}

export enum MenuStatItemId {
  ShowAll = "showAll",
  Author = "author",
}

export class MenuTreeItem extends vscode.TreeItem {
  constructor(
    public readonly id: MenuItemId,
    public readonly label: string,
    public readonly authorName?: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);

    this.command = {
      command: "myExtension.handleItemClick",
      title: "Handle Click",
      arguments: [this],
    };
  }
}
