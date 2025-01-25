import * as vscode from "vscode";
import * as path from "path";

interface VariableDefinition {
  value: string;
  source: string;
  mediaQuery?: string;
}

interface VariableCache {
  [key: string]: VariableDefinition[];
}

interface WatchedFiles {
  additionalFiles: string[];
}

interface TailwindCustomClasses {
  [key: string]: {
    prefix: string;
    className: string;
    variable: string;
  };
}

let variableCache: VariableCache = {};
let fileWatcher: vscode.FileSystemWatcher;
let configWatcher: vscode.FileSystemWatcher;
let tailwindCustomClasses: TailwindCustomClasses = {};

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

  // Watch for file changes
  fileWatcher.onDidChange((uri) => updateCacheForFile(uri));
  fileWatcher.onDidCreate((uri) => updateCacheForFile(uri));
  fileWatcher.onDidDelete((uri) => {
    console.log(`File deleted: ${uri.fsPath}. Reinitializing cache...`);
    initializeCache();
  });

  // Watch additional files from settings
  setupAdditionalFileWatchers();

  // Watch for active editor changes to check for new variable definitions
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
          await updateCacheForFile(editor.document.uri);
        }
      }
    }
  });

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
      "html",
    ],
    {
      async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position
      ) {
        const line = document.lineAt(position.line).text;
        const wordRange = document.getWordRangeAtPosition(position, /[\w-]+/);
        if (!wordRange) return;

        const word = document.getText(wordRange);

        if (
          document.languageId === "vue" &&
          !isInStyleOrTemplate(document, position)
        ) {
          return;
        }

        let matches = [];

        // Check for var() usage
        const varRegex = /var\((--[\w-]+)\)/g;
        let match;
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

        // Check for Tailwind class usage
        const currentClass = word;
        if (currentClass) {
          // First check custom Tailwind classes
          const customClass = Object.entries(tailwindCustomClasses).find(
            ([key]) => currentClass === key
          );

          if (customClass) {
            const [_, config] = customClass;
            const startPos = line.indexOf(currentClass);
            if (startPos !== -1) {
              matches.push({
                variable: config.variable,
                range: new vscode.Range(
                  position.line,
                  startPos,
                  position.line,
                  startPos + currentClass.length
                ),
                isCustomClass: true,
                className: currentClass,
              });
            }
          } else {
            // Check for direct CSS variable usage in class names
            const cssVars = Object.keys(variableCache);
            for (const cssVar of cssVars) {
              const varName = cssVar.substring(2); // Remove '--' prefix
              if (currentClass.includes(varName)) {
                const startPos = line.indexOf(currentClass);
                if (startPos !== -1) {
                  matches.push({
                    variable: cssVar,
                    range: new vscode.Range(
                      position.line,
                      startPos,
                      position.line,
                      startPos + currentClass.length
                    ),
                  });
                }
              }
            }
          }
        }

        // Find the matching variable under the cursor
        const matchedVar = matches.find((m) => m.range.contains(position));
        if (!matchedVar) return;

        const definitions = variableCache[matchedVar.variable];
        if (!definitions?.length) return;

        // Create hover content
        const markdown = new vscode.MarkdownString();

        if (matchedVar.isCustomClass) {
          markdown.appendCodeblock(
            `${matchedVar.className} → var(${matchedVar.variable})`,
            "css"
          );
        }

        // Group definitions by source file
        const groupedDefs = definitions.reduce((acc, def) => {
          const key = def.source;
          if (!acc[key]) acc[key] = [];
          acc[key].push(def);
          return acc;
        }, {} as { [key: string]: VariableDefinition[] });

        // Display all definitions grouped by source
        for (const [source, defs] of Object.entries(groupedDefs)) {
          markdown.appendCodeblock(
            `/* ${source} */\n${defs
              .map((def) =>
                def.mediaQuery
                  ? `@media ${def.mediaQuery} {\n  ${matchedVar.variable}: ${def.value};\n}`
                  : `${matchedVar.variable}: ${def.value};`
              )
              .join("\n")}`,
            "css"
          );
        }

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

    const mediaQueryRegex = /@media[^{]+{([^}]+)}/g;
    let mediaMatch;

    // Remove media query blocks from the main content
    const mainContent = searchText.replace(mediaQueryRegex, "");

    // Process variables in the main content (outside media queries)
    processVariables(mainContent, relativePath);

    // Process variables inside media queries
    while ((mediaMatch = mediaQueryRegex.exec(searchText)) !== null) {
      const mediaQuery = mediaMatch[0]
        .substring(6, mediaMatch[0].indexOf("{"))
        .trim();

      const mediaContent = mediaMatch[1];
      processVariables(mediaContent, relativePath, mediaQuery);
    }

    if (/tailwind\.config\.(js|ts|cjs|mjs)$/.test(uri.fsPath)) {
      const themeContent = extractThemeContent(text);
      if (themeContent) {
        await parseTailwindConfig(themeContent, relativePath);
      }
    }
  } catch (error) {
    console.error(`Error updating cache for ${uri.fsPath}:`, error);
  }
}

function processVariables(text: string, source: string, mediaQuery?: string) {
  const varDefRegex = /--([\w-]+)\s*:\s*([^;]+);/g;
  let match;

  while ((match = varDefRegex.exec(text)) !== null) {
    const varName = "--" + match[1];
    const value = match[2].trim();

    if (!variableCache[varName]) {
      variableCache[varName] = [];
    }

    variableCache[varName].push({
      value,
      source,
      mediaQuery,
    });
  }
}

function extractThemeContent(text: string): string | null {
  // Match theme configuration including extend
  const themeRegex = /theme\s*:\s*{([\s\S]*?)}(?=\s*,|\s*})/;
  const match = themeRegex.exec(text);
  return match ? match[1] : null;
}

async function parseTailwindConfig(themeContent: string, sourcePath: string) {
  try {
    // Reset custom classes for this config file
    tailwindCustomClasses = {};

    // Match different property sections (fontSize, spacing, colors, etc.)
    const sectionRegex = /(\w+)\s*:\s*{([^}]+)}/g;
    let sectionMatch;

    while ((sectionMatch = sectionRegex.exec(themeContent)) !== null) {
      const section = sectionMatch[1];
      const content = sectionMatch[2];

      // Match custom class definitions with var() usage
      const customClassRegex =
        /['"]?([\w-]+)['"]?\s*:\s*['"]var\((--[\w-]+)\)['"]?/g;
      let classMatch;

      while ((classMatch = customClassRegex.exec(content)) !== null) {
        const className = classMatch[1];
        const variable = classMatch[2].match(/--[\w-]+/)?.[0];

        if (variable) {
          const prefix = getTailwindPrefix(section);
          if (prefix) {
            const fullClassName = `${prefix}-${className}`;
            tailwindCustomClasses[fullClassName] = {
              prefix,
              className,
              variable,
            };
          }
        }
      }
    }
  } catch (error) {
    console.error("Error parsing Tailwind config:", error);
  }
}

function getTailwindPrefix(section: string): string | null {
  // Map Tailwind theme sections to their class prefixes
  const prefixMap: { [key: string]: string } = {
    fontSize: "text",
    spacing: "",
    colors: "",
    backgroundColor: "bg",
    textColor: "text",
    borderColor: "border",
    margin: "m",
    padding: "p",
    width: "w",
    height: "h",
    maxWidth: "max-w",
    maxHeight: "max-h",
    minWidth: "min-w",
    minHeight: "min-h",
  };

  return prefixMap[section] || null;
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

async function checkForVariableDefinitions(
  document: vscode.TextDocument
): Promise<boolean> {
  const text = document.getText();
  const varDefRegex = /--([\w-]+):\s*([^;]+);/g;
  return varDefRegex.test(text);
}

export function deactivate() {
  fileWatcher?.dispose();
  configWatcher?.dispose();
}
