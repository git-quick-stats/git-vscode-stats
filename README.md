# Git VSCode Stats

Track, compare, and visualize repository activity directly inside VS Code.

Git VSCode Stats adds a dedicated activity bar view with ready-made reports for commit trends, contributors, branches, and repository history. It is built for developers who want quick insight into project patterns without switching tools.

## What You Get

- Organized stats explorer in the VS Code activity bar
- Rich report views rendered in an interactive webview
- Date and author filtering for most reports
- Charts for trend analysis and distribution views
- Comparison mode for branches and time periods
- Saved report configurations and reusable custom queries
- Export options for CSV, JSON, and HTML

## Available Reports

- Detailed Git Stats
- Commits by Author
- Commits by Hour/Day
- Commits by Hour/Week
- Commits by Month
- Commits by Weekday
- Commits by Year
- Contributor Stats
- Branch Stats
- Changelog
- Code Suggestors
- Git Effort
- Git Activity
- Comparison View
- Git Insights

## Screenshots

<center>
<img width="600" height="auto" alt="Git VSCode Stats main view" src="https://github.com/user-attachments/assets/0b93b49f-307d-48d5-84dc-d14136715a54" />

<br>

<img width="600" height="auto" alt="Git VSCode Stats chart view" src="https://github.com/user-attachments/assets/d0f9d148-6f4b-44f5-a50b-16496519a75e" />
</center>

## Installation

Install from the VS Code Marketplace:

https://marketplace.visualstudio.com/items?itemName=git-quick-stats.git-vscode-stats

Or clone and run locally for development:

```bash
git clone https://github.com/git-quick-stats/git-vscode-stats.git
cd git-vscode-stats
npm install
```

## How to Use

1. Open a folder that contains a Git repository.
2. Click the Git Quick Stats icon in the activity bar.
3. Pick a report from the Git Stats tree.
4. Apply filters (date range, author) in the webview.
5. Export or save the current setup if needed.

## Saved Configurations and Custom Queries

- Save the current filter + report combination to run it again quickly.
- Save custom Git queries and execute them from the sidebar.
- Custom query execution is restricted to read-only Git subcommands for safety.


## Development

### Requirements

- Node.js 18+
- npm
- VS Code 1.80+

### Commands

```bash
npm install
npm run compile
npm test
```

- `npm run compile`: builds TypeScript to `dist/`
- `npm test`: runs Node-based test suite in `test/`

### Run the Extension Locally

1. Open the project in VS Code.
2. Run `npm install` and `npm run compile`.
3. Press `F5` to launch the Extension Development Host.

## Troubleshooting

- If no data appears, verify the opened workspace is a valid Git repository.
- If charts do not load, run `npm install` to ensure bundled dependencies are present.
- If results look incomplete, widen date filters or clear author filtering.

## License

This project is licensed under the terms of the `LICENSE` file in the repository root.
