import * as vscode from "vscode";
import { getWatchedFiles } from "./config";
import { updateCacheForFile, initializeCache } from "./variableCache";

export class FileWatcher {
  private fileWatcher!: vscode.FileSystemWatcher;
  private configWatcher!: vscode.FileSystemWatcher;

  constructor() {
    this.setupMainWatcher();
    this.setupSettingsWatcher();
    this.setupAdditionalWatchers();
  }

  private setupMainWatcher() {
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      "**/*.{css,scss,tailwind.config.js,tailwind.config.ts}",
      false,
      false,
      false
    );

    this.fileWatcher.onDidChange(updateCacheForFile);
    this.fileWatcher.onDidCreate(updateCacheForFile);
    this.fileWatcher.onDidDelete(() => initializeCache());
  }

  private setupSettingsWatcher() {
    const settingsWatcher = vscode.workspace.createFileSystemWatcher(
      "**/.vscode/settings.json",
      false,
      false,
      false
    );
    settingsWatcher.onDidChange(() => initializeCache());
  }

  private async setupAdditionalWatchers() {
    const { additionalFiles } = await getWatchedFiles();
    if (additionalFiles.length > 0) {
      const pattern = `**/{${additionalFiles.join(",")}}`;
      this.configWatcher?.dispose();
      this.configWatcher = vscode.workspace.createFileSystemWatcher(
        pattern,
        false,
        false,
        false
      );

      this.configWatcher.onDidChange(updateCacheForFile);
      this.configWatcher.onDidCreate(updateCacheForFile);
      this.configWatcher.onDidDelete(() => initializeCache());
    }
  }

  dispose() {
    this.fileWatcher?.dispose();
    this.configWatcher?.dispose();
  }
}
