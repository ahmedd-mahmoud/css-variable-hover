// services/hoverProvider.ts
import * as vscode from "vscode";
import { VariableDefinition } from "../types";
import { variableCache, tailwindCustomClasses } from "./variableCache";
import { isInStyleOrTemplate } from "../utils/parsers";

export class HoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | undefined> {
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

    const matches = [
      ...this.findVarMatches(line, position),
      ...this.findTailwindMatches(line, position, word),
    ];

    const matchedVar = matches.find((m) => m.range.contains(position));
    if (!matchedVar) return;

    const definitions = variableCache[matchedVar.variable];
    if (!definitions?.length) return;

    return this.createHover(matchedVar, definitions);
  }

  private findVarMatches(line: string, position: vscode.Position) {
    const matches = [];
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

    return matches;
  }

  private findTailwindMatches(
    line: string,
    position: vscode.Position,
    word: string
  ) {
    const matches = [];
    const currentClass = word;

    if (currentClass) {
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
          const varName = cssVar.substring(2);
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

    return matches;
  }

  private createHover(
    matchedVar: {
      variable: string;
      isCustomClass?: boolean;
      className?: string;
    },
    definitions: VariableDefinition[]
  ): vscode.Hover {
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
  }
}
