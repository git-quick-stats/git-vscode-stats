import * as vscode from "vscode";
import { GitStatsProvider } from "./gitStatsProvider";
import { GitStatsCommands } from "./gitStatsCommands";
import {
  SavedConfigurationsProvider,
  CustomQueriesProvider,
  SavedConfiguration,
  CustomQuery,
} from "./savedConfigsProvider";

export function activate(context: vscode.ExtensionContext) {
  const gitStatsProvider = new GitStatsProvider();
  const gitStatsCommands = new GitStatsCommands();
  const savedConfigsProvider = new SavedConfigurationsProvider(context);
  const customQueriesProvider = new CustomQueriesProvider(context);

  // Register tree data providers
  vscode.window.registerTreeDataProvider("gitQuickStatsView", gitStatsProvider);
  vscode.window.registerTreeDataProvider(
    "gitQuickStatsFavorites",
    savedConfigsProvider
  );
  vscode.window.registerTreeDataProvider(
    "gitQuickStatsCustomQueries",
    customQueriesProvider
  );

  // Register refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand("gitQuickStats.refreshStats", () => {
      gitStatsProvider.refresh();
    })
  );

  // Register git stats commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitQuickStats.showDetailedStats",
      (filter) => {
        gitStatsCommands.showDetailedStats(filter);
      }
    ),
    vscode.commands.registerCommand(
      "gitQuickStats.showCommitsByAuthor",
      (filter) => {
        gitStatsCommands.showCommitsByAuthor(filter);
      }
    ),
    vscode.commands.registerCommand(
      "gitQuickStats.showCommitsByHourDay",
      (filter) => {
        gitStatsCommands.showCommitsByHourDay(filter);
      }
    ),
    vscode.commands.registerCommand(
      "gitQuickStats.showCommitsByHourWeek",
      (filter) => {
        gitStatsCommands.showCommitsByHourWeek(filter);
      }
    ),
    vscode.commands.registerCommand(
      "gitQuickStats.showCommitsByMonth",
      (filter) => {
        gitStatsCommands.showCommitsByMonth(filter);
      }
    ),
    vscode.commands.registerCommand(
      "gitQuickStats.showCommitsByWeekday",
      (filter) => {
        // gitStatsCommands.showCommitsByWeekday(filter);
      }
    ),
    vscode.commands.registerCommand(
      "gitQuickStats.showCommitsByYear",
      (filter) => {
        //  gitStatsCommands.showCommitsByYear(filter);
      }
    ),
    vscode.commands.registerCommand(
      "gitQuickStats.showContributorStats",
      (filter) => {
        // gitStatsCommands.showContributorStats(filter);
      }
    ),
    vscode.commands.registerCommand(
      "gitQuickStats.showBranchStats",
      (filter) => {
        // gitStatsCommands.showBranchStats(filter);
      }
    ),
    vscode.commands.registerCommand("gitQuickStats.showChangelog", (filter) => {
      //gitStatsCommands.showChangelog(filter);
    }),
    vscode.commands.registerCommand(
      "gitQuickStats.showCodeSuggestors",
      (filter) => {
        // gitStatsCommands.showCodeSuggestors(filter);
      }
    ),
    vscode.commands.registerCommand("gitQuickStats.showGitEffort", (filter) => {
      gitStatsCommands.showGitEffort(filter);
    }),
    vscode.commands.registerCommand(
      "gitQuickStats.showGitActivity",
      (filter) => {
        gitStatsCommands.showGitActivity(filter);
      }
    ),
    vscode.commands.registerCommand("gitQuickStats.showInsights", (filter) => {
      gitStatsCommands.showInsights(filter);
    }),
    vscode.commands.registerCommand(
      "gitQuickStats.showComparison",
      (filter) => {
        gitStatsCommands.showComparison(filter);
      }
    ),
    vscode.commands.registerCommand(
      "gitQuickStats.executeCustomQuery",
      (query: CustomQuery) => {
        gitStatsCommands.executeCustomQuery(query);
      }
    ),
    vscode.commands.registerCommand(
      "gitQuickStats.saveConfiguration",
      (config) => {
        if (config && config.name && config.statsCommand) {
          const savedConfig = new SavedConfiguration(
            config.name,
            config.statsCommand,
            config.dateAfter,
            config.dateBefore,
            config.author
          );
          savedConfigsProvider.saveConfiguration(savedConfig);
          vscode.window.showInformationMessage(
            `Configuration "${config.name}" saved`
          );
        } else {
          vscode.window
            .showInputBox({
              placeHolder: "Enter configuration name",
            })
            .then((name) => {
              if (name) {
                vscode.window
                  .showQuickPick([
                    "Detailed Git Stats",
                    "Commits by Author",
                    "Commits by Hour/Day",
                    "Git Activity",
                  ])
                  .then((command) => {
                    if (command) {
                      const commandId = `gitQuickStats.show${command.replace(
                        /\s/g,
                        ""
                      )}`;
                      savedConfigsProvider.saveConfiguration(
                        new SavedConfiguration(name, commandId, "", "", "")
                      );
                      vscode.window.showInformationMessage(
                        `Configuration "${name}" saved`
                      );
                    }
                  });
              }
            });
        }
      }
    ),
    vscode.commands.registerCommand(
      "gitQuickStats.saveCustomQuery",
      (query) => {
        if (query && query.name && query.query) {
          customQueriesProvider.saveQuery(
            new CustomQuery(query.name, query.query)
          );
          vscode.window.showInformationMessage(
            `Custom query "${query.name}" saved`
          );
        } else {
          vscode.window
            .showInputBox({
              placeHolder: "Enter query name",
            })
            .then((name) => {
              if (name) {
                vscode.window
                  .showInputBox({
                    placeHolder:
                      'Enter git query, e.g., log --format="%h|%an|%s" --all',
                  })
                  .then((queryCommand) => {
                    if (queryCommand) {
                      customQueriesProvider.saveQuery(
                        new CustomQuery(name, queryCommand)
                      );
                      vscode.window.showInformationMessage(
                        `Custom query "${name}" saved`
                      );
                    }
                  });
              }
            });
        }
      }
    )
  );
}

export function deactivate() {}
