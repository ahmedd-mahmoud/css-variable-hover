// utils/parsers.ts
import * as vscode from "vscode";
import { tailwindCustomClasses } from "../services/variableCache";

export function findStyleBlocks(
  text: string
): Array<{ start: number; end: number }> {
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

export function isInStyleOrTemplate(
  document: vscode.TextDocument,
  position: vscode.Position
): boolean {
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

export function extractThemeContent(text: string): string | null {
  const themeRegex = /theme\s*:\s*{([\s\S]*?)}(?=\s*,|\s*})/;
  const match = themeRegex.exec(text);
  return match ? match[1] : null;
}

export async function parseTailwindConfig(
  themeContent: string,
  sourcePath: string
) {
  try {
    // Reset custom classes for this config file
    Object.keys(tailwindCustomClasses).forEach((key) => {
      if (tailwindCustomClasses[key].source === sourcePath) {
        delete tailwindCustomClasses[key];
      }
    });

    const sectionRegex = /(\w+)\s*:\s*{([^}]+)}/g;
    let sectionMatch;

    while ((sectionMatch = sectionRegex.exec(themeContent)) !== null) {
      const section = sectionMatch[1];
      const content = sectionMatch[2];
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
              source: sourcePath,
            };
          }
        }
      }
    }
  } catch (error) {
    console.error("Error parsing Tailwind config:", error);
  }
}

export function getTailwindPrefix(section: string): string | null {
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

export async function checkForVariableDefinitions(
  document: vscode.TextDocument
): Promise<boolean> {
  const text = document.getText();
  const varDefRegex = /--([\w-]+):\s*([^;]+);/g;
  return varDefRegex.test(text);
}
