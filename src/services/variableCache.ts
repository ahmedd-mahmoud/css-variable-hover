import * as vscode from "vscode";
import { VariableCache, TailwindCustomClasses } from "../types";
import {
  extractThemeContent,
  findStyleBlocks,
  parseTailwindConfig,
} from "../utils/parsers";

export let variableCache: VariableCache = {};
export let tailwindCustomClasses: TailwindCustomClasses = {};

export async function initializeCache() {
  variableCache = {};
  const files = await vscode.workspace.findFiles(
    "**/*.{css,scss,tailwind.config.js,tailwind.config.ts}"
  );

  for (const file of files) {
    await updateCacheForFile(file);
  }
}

export async function updateCacheForFile(uri: vscode.Uri) {
  try {
    const document = await vscode.workspace.openTextDocument(uri);
    const text = document.getText();
    const relativePath = vscode.workspace.asRelativePath(uri);

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

    // Process variables in the main content
    processVariables(mainContent, relativePath);

    // Process variables in media queries
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
