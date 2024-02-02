const vscode = require('vscode');

const IMPORT_PATTERNS = {
    'javascript': /^\s*import .*;?$/gm,
    'typescript': /^\s*import .*;?$/gm,
    'python': /^\s*(import .*|from .* import(.*\n)*.*);?$/gm,
    'java': /^\s*import .*;$/gm,
    'csharp': /^\s*using .*;$/gm,
    'c': /^\s*#include .*$/gm,
    'cpp': /^\s*#include .*$/gm,
    'php': /^\s*use .*;$/gm,
    'ruby': /^\s*require .*$/gm,
    'go': /^\s*import .*$/gm,
    'rust': /^\s*use .*;$/gm,
    'kotlin': /^\s*import .*$/gm,
    'swift': /^\s*import .*$/gm,
    'dart': /^\s*import .*;?$/gm,
    'shellscript': /^\s*source .*$/gm,
    'powershell': /^\s*using .*$/gm,
    'elixir': /^\s*import .*$/gm,
    'lua': /^\s*require .*$/gm,
    'perl': /^\s*use .*;$/gm,
    'r': /^\s*library\(.*\)$/gm,
    'julia': /^\s*using .*$/gm,
    'haskell': /^\s*import .*$/gm,
    'erlang': /^\s*-include\(.*\)$/gm,
    'clojure': /^\s*\(require .*$/gm,
    'groovy': /^\s*import .*$/gm,
    'scala': /^\s*import .*$/gm,
};

function activate(context) {
    vscode.window.showInformationMessage('Staircase Import Formatter Activated!');
    context.subscriptions.push(vscode.workspace.onWillSaveTextDocument(event => {
        if (event.document.uri.scheme === 'file') {
            formatOnSave(event);
        }
    }));
}

function formatOnSave(event) {
    const document = event.document;
    const importPattern = IMPORT_PATTERNS[document.languageId];
    const languageId = document.languageId;
    if (importPattern) {
        let edit;
        switch (languageId) {
            case 'python':
                edit = formatPythonDocument(document, importPattern);
                break;
            default:
                edit = formatGenericDocument(document, importPattern);
                break;
        }
        event.waitUntil(vscode.workspace.applyEdit(edit));
        // save
        let save = vscode.workspace.saveAll();
        if (!save) {
            vscode.window.showErrorMessage('Failed to save all documents');
        }
    }
}

function formatGenericDocument(document, importPattern) {
    const documentText = document.getText();
    const lines = documentText.split(/\r?\n/); // \r? for windows compatibility
    const importGroups = extractImportGroups(lines, importPattern);

    const edit = new vscode.WorkspaceEdit();
    importGroups.forEach(group => {
        if (group.length > 1) {
            replaceWithSortedImports(edit, group, lines, document.uri);
        }
    });

    return edit;
}
function replaceWithSortedImports(edit, importGroup, lines, documentUri) {
    const config = vscode.workspace.getConfiguration('Staircase Import Formatter');
    const sortOrder = config.get('order', 'ascending');

    let sortedGroupLines = importGroup.map(importData => importData.line);
    sortedGroupLines.sort((lineA, lineB) =>
        sortOrder === 'ascending' ? lineA.length - lineB.length : lineB.length - lineA.length
    );

    const sortedImportsText = sortedGroupLines.join("\n");

    replaceGroup(edit, importGroup, lines, sortedImportsText, documentUri);
}
function replaceGroup(edit, importGroup, lines, sortedImportsText, documentUri) {
    const startLineIndex = importGroup[0].index;
    const endLineIndex = importGroup[importGroup.length - 1].index;
    const range = new vscode.Range(startLineIndex, 0, endLineIndex, lines[endLineIndex].length);
    edit.replace(documentUri, range, sortedImportsText);
}
function extractImportGroups(lines, importPattern) {
    let importGroups = [];
    let currentGroup = [];

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const isImportLine = new RegExp(importPattern).test(line);

        if (isImportLine) {
            currentGroup.push({ line, index });
        } else if (currentGroup.length > 0) {
            importGroups.push(currentGroup);
            currentGroup = [];
        }
    }

    if (currentGroup.length > 0) {
        importGroups.push(currentGroup);
    }

    return importGroups;
}

function formatPythonDocument(document, importPattern) {
    const documentText = document.getText();
    const lines = documentText.split(/\r?\n/); // \r? for windows compatibility
    const importGroups = extractPythonImportGroups(lines, importPattern);

    const edit = new vscode.WorkspaceEdit();
    for (let i = 0; i < importGroups.length; i++) {
        const importGroup = importGroups[i];
        if (importGroup.imports.length > 1) {
            if (importGroup.type === "line-based") {
                let uri = document.uri;
                replaceWithSortedImports(edit, importGroup.imports, lines, uri);
                console.log("FORMATTED");
            }
            else if (importGroup.type === "parenthesised") {
                let uri = document.uri;
                replaceMultiLineImportGroup(edit, importGroup, uri)
            }
        }
    }

    return edit;
}

function extractPythonImportGroups(lines, importPattern) {
    let importGroups = [];
    let currentGroup = [];

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const isImportLine = new RegExp(importPattern).test(line);
        const isMultilineImport = isImportLine && /\(/.test(line);

        if (isMultilineImport) {

            // if multiline import comes after regular group
            if (currentGroup.length > 0) {
                // push current group and reset
                importGroups.push({ type: "line-based", imports: currentGroup });
                currentGroup = [];
            }

            let multiLineImport = "";
            let openingLineIndex = index;
            // while the line does not contain a closing parenthesis
            while (/\)/.test(lines[index]) === false) {
                multiLineImport += lines[index] + "\n";
                index++;
            }
            let closingLineIndex = index;
            // add the last line with the closing parenthesis
            multiLineImport += lines[index];

            const pattern = /(from\s+\w+\s+import\s+\()([\s\S]+?)\)/i;
            const match = multiLineImport.match(pattern);

            if (match) {
                const opening = line.match(/^\s*/)[0] + match[1];
                const importGroup = match[2].split(',')
                    .map(importLine => importLine.trim())
                    .filter(importLine => importLine.length > 0)
                    .map(importLine => importLine + ',');

                for (let i = 0; i < importGroup.length; i++) {
                    currentGroup.push({ line: importGroup[i], index: openingLineIndex + i });
                }

                // console.log(multiLineImport);

                // Add the current group to the import groups
                importGroups.push({ type: "parenthesised", opening: opening, imports: currentGroup, openingLineIndex: openingLineIndex, closingLineIndex: closingLineIndex });
                currentGroup = [];
            }
            else {
                const message = "Failed to match multiline import. Please report this issue on the extension GitHub page!";
                const buttonLabel = "Report Issue";
                vscode.window.showErrorMessage(message, buttonLabel).then((selection) => {
                    if (selection === buttonLabel) {
                        vscode.env.openExternal(vscode.Uri.parse('https://github.com/MyPingO/staircase-imports/issues'));
                    }
                });
            }
        }
        else if (isImportLine) {
            currentGroup.push({ line, index });
        }
        else if (currentGroup.length > 0) {
            importGroups.push({ type: "line-based", imports: currentGroup });
            currentGroup = [];
        }

        
    }
    // Add the last group if it exists
    if (currentGroup.length > 0) {
        importGroups.push({ type: "line-based", imports: currentGroup });
    }
    return importGroups;
}
function replaceMultiLineImportGroup(edit, importGroup, documentUri) {
    const insertIndex = importGroup.openingLineIndex;
    const endIndex = importGroup.closingLineIndex;
    const config = vscode.workspace.getConfiguration('Staircase Import Formatter');
    const sortOrder = config.get('order', 'ascending');

    let sortedGroupLines = importGroup.imports.map(importGroup => importGroup.line);
    sortedGroupLines.sort((lineA, lineB) =>
        sortOrder === 'ascending' ? lineA.length - lineB.length : lineB.length - lineA.length
    );

    let sortedMultilineImports;
    const openingLeadingWhitespace = importGroup.opening.match(/^\s*/)[0];
    const closing = `${openingLeadingWhitespace})`;
    sortedMultilineImports = importGroup.opening + '\n' + sortedGroupLines.map(line => openingLeadingWhitespace + '\t' + line).join('\n') + '\n' + closing;

    console.log(sortedMultilineImports);

    const endIndexLine = vscode.window.activeTextEditor.document.lineAt(endIndex);
    const range = new vscode.Range(insertIndex, 0, endIndex, endIndexLine.text.length);

    edit.replace(documentUri, range, sortedMultilineImports);
}

function deactivate() { }

module.exports = {
    activate,
    deactivate
};
