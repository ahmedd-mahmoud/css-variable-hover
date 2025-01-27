import * as vscode from "vscode";
import { getWatchedFiles } from "./config";
import { updateCacheForFile, initializeCache } from "./variableCache";

let fileWatcher: vscode.FileSystemWatcher | undefined;
let configWatcher: vscode.FileSystemWatcher | undefined;

export async function setupWatchers() {
  // Main watcher
  fileWatcher = vscode.workspace.createFileSystemWatcher(
    "**/*.{css,scss,tailwind.config.js,tailwind.config.ts}",
    false,
    false,
    false
  );
  fileWatcher.onDidChange(updateCacheForFile);
  fileWatcher.onDidCreate(updateCacheForFile);
  fileWatcher.onDidDelete(() => initializeCache());

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
      false,
      false,
      false
    );
    configWatcher.onDidChange(updateCacheForFile);
    configWatcher.onDidCreate(updateCacheForFile);
    configWatcher.onDidDelete(() => initializeCache());
  }
}

export function disposeWatchers() {
  fileWatcher?.dispose();
  configWatcher?.dispose();
}
