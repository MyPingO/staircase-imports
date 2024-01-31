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
            applySortedImports(edit, group, lines, document.uri);
        }
    });

    return edit;
}

function formatPythonDocument(document, importPattern) {
    const documentText = document.getText();
    const lines = documentText.split(/\r?\n/); // \r? for windows compatibility
    const importGroups = extractPythonImportGroups(lines, importPattern);

    const edit = new vscode.WorkspaceEdit();
    importGroups.forEach(group => {
        if (group.length > 1) {
            applySortedImports(edit, group, lines, document.uri);
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

function extractPythonImportGroups(lines, importPattern) {
    let importGroups = [];
    let currentGroup = [];

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const isImportLine = new RegExp(importPattern).test(line);
        const isMultilineImport = isImportLine && /\(/.test(line);

        if (isMultilineImport) {
            let multiLineImport = "";
            // while the line does not contain a closing parenthesis
            while (/\)/.test(lines[index]) === false) {
                multiLineImport += lines[index] + "\n";
                index++;
            }
            // add the last line with the closing parenthesis
            multiLineImport += lines[index];

            // Get rid of all newlines
            multiLineImport = multiLineImport.replace(/\n/g, '');

            // Add a new line after the opening parenthesis
            multiLineImport = multiLineImport.replace(/\(/, '(\n');

            // Add a new line before the closing parenthesis
            multiLineImport = multiLineImport.replace(/\)/, '\n)');

            // Replace each comma with a comma and a new line
            multiLineImport = multiLineImport.replace(/,/g, ',\n');

            // Add every line that has a comma to the group
            const multiLineImports = multiLineImport.split('\n');
            const openingParenthesisSection = multiLineImports[0];
            const closingParenthesisSection = multiLineImports[multiLineImports.length - 1];
            for (let i = 0; i < multiLineImports.length; i++) {
                const multiLineImport = multiLineImports[i];
                if (multiLineImport.includes(',')) {
                    currentGroup.push({ line: multiLineImport, index: index - multiLineImports.length + i + 2});
                }
            }

            // Combine the opening and closing sections with the current group as a string to insert
            multiLineImport = openingParenthesisSection + '\n' + multiLineImports.slice(1, multiLineImports.length - 1).join('\n') + '\n' + closingParenthesisSection;

            console.log(multiLineImport);

            // Add the current group to the import groups
            importGroups.push(currentGroup);
            currentGroup = [];
        } 
        else if (isImportLine) {
            currentGroup.push({ line, index });
        } 
        else if (currentGroup.length > 0) {
            importGroups.push(currentGroup);
            currentGroup = [];
        }
    }

    // Add the last group if it exists
    if (currentGroup.length > 0) {
        importGroups.push(currentGroup);
    }

    return importGroups;
}

function applySortedImports(edit, group, lines, documentUri) {
    const config = vscode.workspace.getConfiguration('Staircase Import Formatter');
    const sortOrder = config.get('order', 'ascending');

    let sortedGroupLines = group.map(importObj => importObj.line);
    sortedGroupLines.sort((lineA, lineB) => 
        sortOrder === 'ascending' ? lineA.length - lineB.length : lineB.length - lineA.length
    );

    const sortedImportsText = sortedGroupLines.join("\n");
    const replacementRange = createReplacementRange(group, lines);

    edit.replace(documentUri, replacementRange, sortedImportsText);
}

function createReplacementRange(group, lines) {
    const startLineIndex = group[0].index;
    const endLineIndex = group[group.length - 1].index;
    return new vscode.Range(startLineIndex, 0, endLineIndex, lines[endLineIndex].length);
}

function deactivate() { }

module.exports = {
    activate,
    deactivate
};
