import * as vscode from "vscode";
import { setupWatchers, disposeWatchers } from "./services/fileWatcher";
import { HoverProvider } from "./services/hoverProvider";
import { initializeCache } from "./services/variableCache";
import { checkForVariableDefinitions } from "./utils/parsers";
import { addFileToWatched, isFileWatched } from "./services/config";

export function activate(context: vscode.ExtensionContext) {
  console.log("CSS Variables Hover extension is now active");

  // Initialize services
  const hoverProvider = new HoverProvider();

  // Register hover provider for supported languages
  const supportedLanguages = [
    "css",
    "scss",
    "javascript",
    "typescript",
    "javascriptreact",
    "typescriptreact",
    "vue",
    "html",
  ];

  // Watch for active editor changes to check for new variable definitions
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (editor && !isFileWatched(editor.document.uri)) {
        const hasVariables = await checkForVariableDefinitions(editor.document);
        if (hasVariables) {
          const addFile = await vscode.window.showInformationMessage(
            `Found CSS variable definitions in unwatched file. Would you like to watch ${vscode.workspace.asRelativePath(
              editor.document.uri
            )} for CSS variables?`,
            "Yes",
            "No"
          );

          if (addFile === "Yes") {
            await addFileToWatched(editor.document.uri);
            await initializeCache();
          }
        }
      }
    })
  );

  // Register providers and services
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(supportedLanguages, hoverProvider)
  );

  // Setup file watchers
  setupWatchers().catch((error) => {
    console.error("Failed to setup file watchers:", error);
    vscode.window.showErrorMessage("Failed to setup file watchers");
  });

  // Create status bar item
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right
  );
  statusBarItem.text = "CSS Vars: $(sync)";
  statusBarItem.tooltip = "Click to refresh CSS variables cache";
  statusBarItem.command = "cssVarHover.refreshCache";
  context.subscriptions.push(statusBarItem);
  statusBarItem.show();

  // Register refresh command
  const refreshCommand = vscode.commands.registerCommand(
    "cssVarHover.refreshCache",
    async () => {
      statusBarItem.text = "CSS Vars: $(sync~spin)";
      try {
        await initializeCache();
        vscode.window.showInformationMessage("CSS variables cache refreshed");
      } catch (error) {
        vscode.window.showErrorMessage("Failed to refresh CSS variables cache");
        console.error("Refresh cache error:", error);
      } finally {
        statusBarItem.text = "CSS Vars: $(sync)";
      }
    }
  );
  context.subscriptions.push(refreshCommand);

  // Initialize cache
  initializeCache().catch((error) => {
    console.error("Initial cache creation failed:", error);
    vscode.window.showErrorMessage("Failed to initialize CSS variables cache");
  });
}

export function deactivate() {
  disposeWatchers();
}
