import * as vscode from "vscode";
import { Formatter } from "./Formatter";
import commands = require("./completion/commands.json");
import systemFunctions = require("./completion/systemFunctions.json");
import systemVariables = require("./completion/systemVariables.json");

export class DocumentFormattingEditProvider implements vscode.DocumentFormattingEditProvider {
  private _formatter: Formatter;
  public constructor() {
    this._formatter = new Formatter();
  }

  public provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.TextEdit[]> {
    return [...this.commands(document, options), ...this.functions(document, options)];
  }

  private commands(document: vscode.TextDocument, options: vscode.FormattingOptions): vscode.TextEdit[] {
    const edits = [];
    let indent = 1;

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);

      if (line.text.length && !line.text.trim().length) {
        edits.push({
          newText: "",
          range: line.range,
        });
        continue;
      }

      const commentsMatch = line.text.match(/^(\s*)(\/\/+|#+;\s*|;)(.*)/i);
      if (commentsMatch) {
        const indentSize = options.tabSize * indent;
        const [, space, comment] = commentsMatch;
        let newText;
        if (space === "" && comment.match(/\/{3}/)) {
          newText = "";
        } else {
          newText = " ".repeat(indentSize);
        }

        if (options.insertSpaces && space.length !== newText.length) {
          edits.push({
            newText,
            range: new vscode.Range(new vscode.Position(i, 0), new vscode.Position(i, space.length)),
          });
        }
        continue;
      }

      const dotsMatch = line.text.match(/^\s+(\.\s*)+/);
      if (dotsMatch) {
        const indentSize = options.tabSize;
        const [dots] = dotsMatch;
        const newText =
          " ".repeat(indentSize) +
          dots
            .split(".")
            .slice(1)
            .map(() => "." + " ".repeat(indentSize - 1))
            .join("");
        if (options.insertSpaces && dots.length !== newText.length) {
          edits.push({
            newText,
            range: new vscode.Range(new vscode.Position(i, 0), new vscode.Position(i, dots.length)),
          });
        }
      }

      const bracketMatch = line.text.match(/^(\s+)}(.*)$/);
      if (bracketMatch) {
        indent--;
        const indentSize = options.tabSize * indent;
        const [, space, rest] = bracketMatch;
        if (options.insertSpaces && space.length !== indentSize) {
          edits.push({
            newText: " ".repeat(indentSize),
            range: new vscode.Range(new vscode.Position(i, 0), new vscode.Position(i, space.length)),
          });
        }
        if (rest.trimLeft().length) {
          const pos = line.text.indexOf("}") + 1;
          edits.push({
            newText: "\n" + " ".repeat(indentSize),
            range: new vscode.Range(
              new vscode.Position(i, pos),
              new vscode.Position(i, pos + rest.length - rest.trimLeft().length)
            ),
          });
        }
      }

      const commandsMatch = line.text.match(/^(\s+[\s.]*)\b([a-z]+)\b/i);
      if (commandsMatch) {
        const indentSize = options.tabSize * indent;
        const [, space, found] = commandsMatch;
        if (!space.includes(".") && options.insertSpaces && space.length !== indentSize) {
          const newText = " ".repeat(indentSize);
          edits.push({
            newText,
            range: new vscode.Range(new vscode.Position(i, 0), new vscode.Position(i, space.length)),
          });
        }
        const pos = line.text.indexOf(found);
        const range = new vscode.Range(new vscode.Position(i, pos), new vscode.Position(i, pos + found.length));
        const command = commands.find(el => el.alias.includes(found.toUpperCase()));
        if (command) {
          const expect = this._formatter.command(command.label);
          if (expect !== found) {
            edits.push({
              newText: expect,
              range,
            });
          }
        }
        const setAssignMatch = line.text.match(
          /^\s+(?:\.\s*)*set\s(?:\^?%?(?:[a-z][a-z0-9]*)(?:\.[a-z][a-z0-9]*)*)(\s*=\s*)/i
        );
        if (setAssignMatch) {
          const [full, assign] = setAssignMatch;
          const pos = full.length - assign.length;
          const newText = " = ";
          const range = new vscode.Range(new vscode.Position(i, pos), new vscode.Position(i, pos + assign.length));
          if (assign !== newText) {
            edits.push({
              newText,
              range,
            });
          }
        }
      }

      if (line.text.match(/^(\w+|{)/)) {
        indent = 1;
      } else if (line.text.match(/.+{(?!.*})/)) {
        indent++;
      }
    }

    return edits;
  }

  private functions(document: vscode.TextDocument, options: vscode.FormattingOptions): vscode.TextEdit[] {
    const edits = [];

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);

      const pattern = /(?<!\$)(\$\b[a-z]+)\b/gi;
      let functionsMatch = null;
      while ((functionsMatch = pattern.exec(line.text)) !== null) {
        const [, found] = functionsMatch;
        const pos = functionsMatch.index;
        const range = new vscode.Range(new vscode.Position(i, pos), new vscode.Position(i, pos + found.length));
        const systemFunction = [...systemFunctions, ...systemVariables].find(el =>
          el.alias.includes(found.toUpperCase())
        );
        if (systemFunction) {
          const expect = this._formatter.function(systemFunction.label);
          if (expect !== found) {
            edits.push({
              newText: expect,
              range,
            });
          }
        }
      }
    }

    return edits;
  }
}
