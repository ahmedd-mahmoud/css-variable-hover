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

export async function isFileIgnored(uri: vscode.Uri): Promise<boolean> {
  const relativePath = vscode.workspace.asRelativePath(uri);
  const config = vscode.workspace.getConfiguration("cssVarHover");
  const ignoredFiles = config.get<string[]>("ignoredFiles", []);
  return ignoredFiles.includes(relativePath);
}

export async function addFileToIgnored(uri: vscode.Uri): Promise<void> {
  const relativePath = vscode.workspace.asRelativePath(uri);
  const config = vscode.workspace.getConfiguration("cssVarHover");
  const ignoredFiles = config.get<string[]>("ignoredFiles", []);

  if (!ignoredFiles.includes(relativePath)) {
    ignoredFiles.push(relativePath);
    await config.update(
      "ignoredFiles",
      ignoredFiles,
      vscode.ConfigurationTarget.Workspace
    );

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
      await updateSettingsFile(workspaceFolder, undefined, ignoredFiles);
    }
  }
}

export function isInNodeModules(uri: vscode.Uri): boolean {
  const relativePath = vscode.workspace.asRelativePath(uri);
  return relativePath.includes("node_modules");
}

async function updateSettingsFile(
  workspaceFolder: vscode.WorkspaceFolder,
  watchedFiles?: string[],
  ignoredFiles?: string[]
): Promise<void> {
  const settingsPath = path.join(
    workspaceFolder.uri.fsPath,
    ".vscode",
    "settings.json"
  );

  try {
    const settingsDoc = await vscode.workspace.openTextDocument(settingsPath);
    const settings = JSON.parse(settingsDoc.getText());
    if (watchedFiles) {
      settings["cssVarHover.watchedFiles"] = watchedFiles;
    }
    if (ignoredFiles) {
      settings["cssVarHover.ignoredFiles"] = ignoredFiles;
    }
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(settingsPath),
      Buffer.from(JSON.stringify(settings, null, 2))
    );
  } catch (error) {
    await vscode.workspace.fs.createDirectory(
      vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, ".vscode"))
    );
    const settings = {
      ...(watchedFiles && { "cssVarHover.watchedFiles": watchedFiles }),
      ...(ignoredFiles && { "cssVarHover.ignoredFiles": ignoredFiles }),
    };
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(settingsPath),
      Buffer.from(JSON.stringify(settings, null, 2))
    );
  }
}
