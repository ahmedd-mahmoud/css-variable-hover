import * as vscode from "vscode";
import * as path from "path";

interface VariableCache {
  [key: string]: {
    value: string;
    source: string;
  };
}

interface WatchedFiles {
  additionalFiles: string[];
}

let variableCache: VariableCache = {};
let fileWatcher: vscode.FileSystemWatcher;
let configWatcher: vscode.FileSystemWatcher;

export function activate(context: vscode.ExtensionContext) {
  console.log("CSS Variables Tailwind extension is now active");

  // Initialize cache with CSS/SCSS files and watched files from settings
  initializeCache();

  // Watch CSS and SCSS files by default
  fileWatcher = vscode.workspace.createFileSystemWatcher(
    "**/*.{css,scss,tailwind.config.js,tailwind.config.ts}",
    false,
    false,
    false
  );

  // Watch settings.json for changes in watched files
  const settingsWatcher = vscode.workspace.createFileSystemWatcher(
    "**/.vscode/settings.json",
    false,
    false,
    false
  );

  settingsWatcher.onDidChange(() => {
    console.log("Settings changed, reinitializing cache...");
    initializeCache();
  });

  // Update cache when CSS/SCSS files change
  fileWatcher.onDidChange((uri) => updateCacheForFile(uri));
  fileWatcher.onDidCreate((uri) => updateCacheForFile(uri));
  fileWatcher.onDidDelete((uri) => {
    console.log(`File deleted: ${uri.fsPath}. Reinitializing cache...`);
    initializeCache();
  });

  // Watch additional files from settings
  setupAdditionalFileWatchers();

  context.subscriptions.push(fileWatcher, settingsWatcher);

  // Register hover provider
  const hoverProvider = vscode.languages.registerHoverProvider(
    [
      "css",
      "scss",
      "javascript",
      "typescript",
      "javascriptreact",
      "typescriptreact",
      "vue",
    ],
    {
      async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position
      ) {
        const line = document.lineAt(position.line).text;

        if (
          document.languageId === "vue" &&
          !isInStyleOrTemplate(document, position)
        ) {
          return;
        }

        const varRegex = /var\((--[\w-]+)\)/g;
        let match;
        let matches = [];

        while ((match = varRegex.exec(line)) !== null) {
          matches.push({
            variable: match[1],
            range: new vscode.Range(
              position.line,
              match.index,
              position.line,
              match.index + match[0].length
            ),
          });
        }

        const matchedVar = matches.find((m) => m.range.contains(position));
        if (!matchedVar) return;

        console.log("Matched variable:", matchedVar.variable);
        console.log("Cache:", variableCache[matchedVar.variable]);
        console.log("File watched:", isFileWatched(document.uri));

        // If variable not in cache and file not watched, prompt to add file
        if (
          !variableCache[matchedVar.variable] &&
          !isFileWatched(document.uri)
        ) {
          const addFile = await vscode.window.showInformationMessage(
            `Found CSS variable in unwatched file. Would you like to watch ${vscode.workspace.asRelativePath(
              document.uri
            )} for CSS variables?`,
            "Yes",
            "No"
          );

          if (addFile === "Yes") {
            await addFileToWatched(document.uri);
            await updateCacheForFile(document.uri);
          }
        }

        const cached = variableCache[matchedVar.variable];
        if (!cached) return;

        const markdown = new vscode.MarkdownString();
        markdown.appendCodeblock(
          `${matchedVar.variable}: ${cached.value}\n/* Defined in ${cached.source} */`,
          "css"
        );

        return new vscode.Hover(markdown);
      },
    }
  );

  context.subscriptions.push(hoverProvider);

  // Status bar item
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
    () => {
      statusBarItem.text = "CSS Vars: $(sync~spin)";
      initializeCache().then(() => {
        statusBarItem.text = "CSS Vars: $(sync)";
        vscode.window.showInformationMessage("CSS variables cache refreshed");
      });
    }
  );
  context.subscriptions.push(refreshCommand);
}

async function getWatchedFiles(): Promise<WatchedFiles> {
  const config = vscode.workspace.getConfiguration("cssVarHover");
  return {
    additionalFiles: config.get<string[]>("watchedFiles", []),
  };
}

async function addFileToWatched(uri: vscode.Uri): Promise<void> {
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

    // Create or update .vscode/settings.json
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
      const settingsPath = path.join(
        workspaceFolder.uri.fsPath,
        ".vscode",
        "settings.json"
      );
      try {
        const settingsDoc = await vscode.workspace.openTextDocument(
          settingsPath
        );
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
  }
}

function isFileWatched(uri: vscode.Uri): boolean {
  const relativePath = vscode.workspace.asRelativePath(uri);
  const config = vscode.workspace.getConfiguration("cssVarHover");
  const watchedFiles = config.get<string[]>("watchedFiles", []);

  return (
    watchedFiles.includes(relativePath) ||
    relativePath.endsWith(".css") ||
    relativePath.endsWith(".scss")
  );
}

async function setupAdditionalFileWatchers() {
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

    configWatcher.onDidChange((uri) => updateCacheForFile(uri));
    configWatcher.onDidCreate((uri) => updateCacheForFile(uri));
    configWatcher.onDidDelete((uri) => initializeCache());
  }
}

async function initializeCache() {
  console.log("Initializing CSS variables cache...");
  variableCache = {};

  // Search in CSS, SCSS, and tailwind config files
  const files = await vscode.workspace.findFiles(
    "**/*.{css,scss,tailwind.config.js,tailwind.config.ts}"
  );

  for (const file of files) {
    await updateCacheForFile(file);
  }

  console.log("Cache initialized with variables:", Object.keys(variableCache));
}

async function updateCacheForFile(uri: vscode.Uri) {
  try {
    const document = await vscode.workspace.openTextDocument(uri);
    const text = document.getText();
    const relativePath = vscode.workspace.asRelativePath(uri);

    // For Vue files, extract style blocks
    let searchText = text;
    if (document.languageId === "vue") {
      const styleBlocks = findStyleBlocks(text);
      searchText = styleBlocks
        .map((block) => text.substring(block.start, block.end))
        .join("\n");
    }

    // Find all variable definitions
    const varDefRegex = /--([\w-]+):\s*([^;]+);/g;
    let match;

    while ((match = varDefRegex.exec(searchText)) !== null) {
      const varName = "--" + match[1];
      const value = match[2].trim();
      variableCache[varName] = {
        value,
        source: relativePath,
      };
    }

    // For JS/TS files, look for Tailwind config
    if (/\.(js|ts|jsx|tsx)$/.test(uri.fsPath)) {
      const configRegex = /['"](--.+?)['"]:\s*['"]([^'"]+)['"]/g;
      while ((match = configRegex.exec(text)) !== null) {
        const varName = match[1];
        const value = match[2];
        variableCache[varName] = {
          value,
          source: relativePath,
        };
      }
    }
  } catch (error) {
    console.error(`Error updating cache for ${uri.fsPath}:`, error);
  }
}

function findStyleBlocks(text: string): Array<{ start: number; end: number }> {
  const blocks = [];
  const regex = /<style[^>]*>([\s\S]*?)<\/style>/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return blocks;
}

function isInStyleOrTemplate(
  document: vscode.TextDocument,
  position: vscode.Position
) {
  const text = document.getText();
  const offset = document.offsetAt(position);

  const styleBlocks = findStyleBlocks(text);

  if (
    styleBlocks.some((block) => offset >= block.start && offset <= block.end)
  ) {
    return true;
  }

  const templateMatch = /<template[^>]*>([\s\S]*?)<\/template>/g.exec(text);

  if (
    templateMatch &&
    offset >= templateMatch.index &&
    offset <= templateMatch.index + templateMatch[0].length
  ) {
    return true;
  }

  return false;
}

export function deactivate() {
  fileWatcher?.dispose();
  configWatcher?.dispose();
}
