// services/config.ts
import * as vscode from "vscode";
import * as path from "path";
import { WatchedFiles } from "../types";

export async function getWatchedFiles(): Promise<WatchedFiles> {
  const config = vscode.workspace.getConfiguration("cssVarHover");
  return {
    additionalFiles: config.get<string[]>("watchedFiles", []),
  };
}

export function isFileWatched(uri: vscode.Uri): boolean {
  const relativePath = vscode.workspace.asRelativePath(uri);
  const config = vscode.workspace.getConfiguration("cssVarHover");
  const watchedFiles = config.get<string[]>("watchedFiles", []);

  return (
    watchedFiles.includes(relativePath) ||
    relativePath.endsWith(".css") ||
    relativePath.endsWith(".scss")
  );
}

export async function addFileToWatched(uri: vscode.Uri): Promise<void> {
  const relativePath = vscode.workspace.asRelativePath(uri);
  const config = vscode.workspace.getConfiguration("cssVarHover");
  const watchedFiles = config.get<string[]>("watchedFiles", []);

  if (!watchedFiles.includes(relativePath)) {
    watchedFiles.push(relativePath);
    await config.update(
      "watchedFiles",
      watchedFiles,
      vscode.ConfigurationTarget.Workspace
    );

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
      await updateSettingsFile(workspaceFolder, watchedFiles);
    }
  }
}

async function updateSettingsFile(
  workspaceFolder: vscode.WorkspaceFolder,
  watchedFiles: string[]
): Promise<void> {
  const settingsPath = path.join(
    workspaceFolder.uri.fsPath,
    ".vscode",
    "settings.json"
  );

  try {
    const settingsDoc = await vscode.workspace.openTextDocument(settingsPath);
    const settings = JSON.parse(settingsDoc.getText());
    settings["cssVarHover.watchedFiles"] = watchedFiles;
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(settingsPath),
      Buffer.from(JSON.stringify(settings, null, 2))
    );
  } catch (error) {
    // Create .vscode directory and settings.json if they don't exist
    await vscode.workspace.fs.createDirectory(
      vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, ".vscode"))
    );
    const settings = {
      "cssVarHover.watchedFiles": watchedFiles,
    };
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(settingsPath),
      Buffer.from(JSON.stringify(settings, null, 2))
    );
  }
}
