import * as vscode from "vscode";
import { getWatchedFiles } from "./config";
import { updateCacheForFile, initializeCache } from "./variableCache";

let fileWatcher: vscode.FileSystemWatcher | undefined;
let configWatcher: vscode.FileSystemWatcher | undefined;

function isInNodeModules(uri: vscode.Uri): boolean {
  return uri.fsPath.includes("node_modules");
}

export async function setupWatchers() {
  // Main watcher
  fileWatcher = vscode.workspace.createFileSystemWatcher(
    "**/*.{css,scss,tailwind.config.js,tailwind.config.ts}",
    true, // Ignore creates in node_modules
    false,
    false
  );

  // Filter out node_modules from watchers
  fileWatcher.onDidChange((uri) => {
    if (!isInNodeModules(uri)) {
      updateCacheForFile(uri);
    }
  });

  fileWatcher.onDidCreate((uri) => {
    if (!isInNodeModules(uri)) {
      updateCacheForFile(uri);
    }
  });

  fileWatcher.onDidDelete((uri) => {
    if (!isInNodeModules(uri)) {
      initializeCache();
    }
  });

  // Settings watcher
  const settingsWatcher = vscode.workspace.createFileSystemWatcher(
    "**/.vscode/settings.json",
    false,
    false,
    false
  );
  settingsWatcher.onDidChange(() => initializeCache());

  // Additional watchers
  const { additionalFiles } = await getWatchedFiles();
  if (additionalFiles.length > 0) {
    const pattern = `**/{${additionalFiles.join(",")}}`;
    configWatcher?.dispose();
    configWatcher = vscode.workspace.createFileSystemWatcher(
      pattern,
      true, // Ignore creates in node_modules
      false,
      false
    );

    // Filter out node_modules from additional watchers
    configWatcher.onDidChange((uri) => {
      if (!isInNodeModules(uri)) {
        updateCacheForFile(uri);
      }
    });

    configWatcher.onDidCreate((uri) => {
      if (!isInNodeModules(uri)) {
        updateCacheForFile(uri);
      }
    });

    configWatcher.onDidDelete((uri) => {
      if (!isInNodeModules(uri)) {
        initializeCache();
      }
    });
  }
}

export function disposeWatchers() {
  fileWatcher?.dispose();
  configWatcher?.dispose();
}
