const vscode = require('vscode');
const pythonFormatter = require('./formatters/pythonFormatter');

const IMPORT_PATTERNS = {
    'python': /^\s*(import .*|from .* import(.*\n)*.*);?$/gm,
    // 'javascript': /^\s*import .*;?$/gm,
    // 'typescript': /^\s*import .*;?$/gm,
    // 'java': /^\s*import .*;$/gm,
    // 'csharp': /^\s*using .*;$/gm,
    // 'c': /^\s*#include .*$/gm,
    // 'cpp': /^\s*#include .*$/gm,
    // 'php': /^\s*use .*;$/gm,
    // 'ruby': /^\s*require .*$/gm,
    // 'go': /^\s*import .*$/gm,
    // 'rust': /^\s*use .*;$/gm,
    // 'kotlin': /^\s*import .*$/gm,
    // 'swift': /^\s*import .*$/gm,
    // 'dart': /^\s*import .*;?$/gm,
    // 'shellscript': /^\s*source .*$/gm,
    // 'powershell': /^\s*using .*$/gm,
    // 'elixir': /^\s*import .*$/gm,
    // 'lua': /^\s*require .*$/gm,
    // 'perl': /^\s*use .*;$/gm,
    // 'r': /^\s*library\(.*\)$/gm,
    // 'julia': /^\s*using .*$/gm,
    // 'haskell': /^\s*import .*$/gm,
    // 'erlang': /^\s*-include\(.*\)$/gm,
    // 'clojure': /^\s*\(require .*$/gm,
    // 'groovy': /^\s*import .*$/gm,
    // 'scala': /^\s*import .*$/gm,
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
    const uri = document.uri;
    if (importPattern) {
        let edit;
        switch (languageId) {
            case 'python':
                let importGroups = pythonFormatter.getPythonImportGroups(document, importPattern);
                edit = new vscode.WorkspaceEdit();
                for (let i = 0; i < importGroups.length; i++) {
                    const importGroup = importGroups[i];
                    if (importGroup.imports.length > 1) {
                        if (importGroup.type === "line-based") {
                            replaceSingleLineImportGroup(edit, importGroup.imports, document, uri);
                        }
                        else if (importGroup.type === "parenthesised") {
                            pythonFormatter.replaceMultiLineImportGroup(edit, importGroup, uri)
                        }
                    }
                }
                break;
            default:
                edit = formatGenericDocument(document, importPattern);
                break;
        }
        // I have no idea if any of this below code works
        event.waitUntil(vscode.workspace.applyEdit(edit));
        // force save?
        let save = vscode.workspace.saveAll();
        if (!save) {
            vscode.window.showErrorMessage('Failed to save all documents');
        }
    }
}

function formatGenericDocument(document, importPattern) {
    const lines = document.getText().split(/\r?\n/); // \r? for windows compatibility
    const importGroups = extractImportGroups(lines, importPattern);

    const edit = new vscode.WorkspaceEdit();
    importGroups.forEach(group => {
        if (group.length > 1) {
            replaceSingleLineImportGroup(edit, group, lines, document.uri);
        }
    });

    return edit;
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
function replaceSingleLineImportGroup(edit, importGroup, document, documentUri) {
    const config = vscode.workspace.getConfiguration('Staircase Import Formatter');
    const sortOrder = config.get('order', 'ascending');
    const startLineIndex = importGroup[0].index;
    const endLineIndex = importGroup[importGroup.length - 1].index;
    const lines = document.getText().split(/\r?\n/); // \r? for windows compatibility
    const range = new vscode.Range(startLineIndex, 0, endLineIndex, lines[endLineIndex].length);

    let sortedGroupLines = importGroup.map(importData => importData.line);
    sortedGroupLines.sort((lineA, lineB) =>
        sortOrder === 'ascending' ? lineA.length - lineB.length : lineB.length - lineA.length
    );
    
    const sortedImportsText = sortedGroupLines.join("\n");
    
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

function deactivate() { }

module.exports = {
    activate,
    deactivate
};
