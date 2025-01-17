import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  console.log("CSS Variables Hover extension is now active");

  const hoverProvider = vscode.languages.registerHoverProvider(
    ["css", "scss"],
    {
      async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position
      ) {
        // Get the line text
        const line = document.lineAt(position.line).text;

        // Find var(--something) at the current position
        const varRegex = /var\(--[\w-]+\)/g;
        let match;

        while ((match = varRegex.exec(line)) !== null) {
          const start = match.index;
          const end = start + match[0].length;

          // Check if the position is within this match
          if (position.character >= start && position.character <= end) {
            // Extract variable name
            const varName = match[0].slice(4, -1); // Remove var( and )
            console.log(`Found variable: ${varName}`);

            // Find variable definition
            try {
              // Search in current document first
              const value = await findVariableInDocument(document, varName);
              if (value) {
                return new vscode.Hover([
                  `**CSS Variable Value**`,
                  `\`${varName}: ${value}\``,
                  `*(defined in current file)*`,
                ]);
              }

              // Search in other CSS files
              const cssFiles = await vscode.workspace.findFiles(
                "**/*.{css,scss}"
              );

              for (const file of cssFiles) {
                // Skip current file as we already checked it
                if (file.fsPath === document.uri.fsPath) continue;

                const content = await vscode.workspace.openTextDocument(file);
                const value = await findVariableInDocument(content, varName);

                if (value) {
                  return new vscode.Hover([
                    `**CSS Variable Value**`,
                    `\`${varName}: ${value}\``,
                    `*(defined in ${vscode.workspace.asRelativePath(file)})*`,
                  ]);
                }
              }

              return new vscode.Hover("Variable definition not found");
            } catch (error) {
              console.error("Error finding variable:", error);
              return new vscode.Hover("Error finding variable definition");
            }
          }
        }
        return undefined;
      },
    }
  );

  context.subscriptions.push(hoverProvider);
}

async function findVariableInDocument(
  document: vscode.TextDocument,
  varName: string
): Promise<string | undefined> {
  const text = document.getText();
  const regex = new RegExp(`${varName}:\\s*([^;]+);`);
  const match = text.match(regex);
  return match?.[1]?.trim();
}

export function deactivate() {}
