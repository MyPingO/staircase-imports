const vscode = require('vscode');

function isExcludableLine(line) {
    const trimmedLine = line.trim();
    // Checks for dynamic imports, comments, empty lines, or strings that should be excluded
    return trimmedLine.startsWith("import(") || trimmedLine.startsWith("//") || trimmedLine.startsWith("/*") || trimmedLine.startsWith("`") || trimmedLine.startsWith("'") || trimmedLine.startsWith("\"") || trimmedLine === "" || trimmedLine.endsWith("*/");
}

function isStartOfMultilineImport(line) {
    return line.startsWith('import') && line.includes('{') && !line.includes('}');
}

function isEndOfMultilineImport(line) {
    return line.includes('}');
}

function getIndentation(line) {
    return line.length - line.trimStart().length;
}

function extractJavascriptImportGroups(lines) {
    const importGroups = [];
    let currentGroup = [];
    let multilineImport = false;
    let inCommentBlock = false;
    let lastWasImport = false;

    lines.forEach((line, index) => {
        const lineIndentation = getIndentation(line);
        const trimmedLine = line.trim();

        if (trimmedLine.startsWith("/*")) {
            inCommentBlock = true;
        }
        if (trimmedLine.endsWith("*/")) {
            inCommentBlock = false;
            return; // Skip the line that closes a comment block
        }

        if (!trimmedLine || isExcludableLine(line) || inCommentBlock) {
            if (currentGroup.length && !multilineImport) {
                importGroups.push({ type: "singleline", imports: currentGroup });
                currentGroup = [];
            }
            lastWasImport = false;
            return;
        }

        if (isStartOfMultilineImport(line)) {
            // If the current group is not empty, push it to the import groups
            // Incase there is a group of single line imports before the multiline import
            if (currentGroup.length) {
                importGroups.push({ type: "singleline", imports: currentGroup });
                currentGroup = [];
            }
            multilineImport = true;
            currentGroup = [{ line, index, indentation: lineIndentation }];
        } else if (multilineImport && isEndOfMultilineImport(line)) {
            currentGroup.push({ line, index, indentation: lineIndentation });
            importGroups.push({ type: "multiline", imports: currentGroup });
            currentGroup = [];
            multilineImport = false;
            lastWasImport = false;
        } else if (multilineImport) {
            currentGroup.push({ line, index, indentation: lineIndentation });
        } else if (line.startsWith('import') && !inCommentBlock) {
            if (!lastWasImport && currentGroup.length) {
                importGroups.push({ type: "singleline", imports: currentGroup });
                currentGroup = [];
            }
            currentGroup.push({ line, index, indentation: lineIndentation });
            lastWasImport = true;
        }
    });

    // Finalize any remaining imports after the loop
    if (currentGroup.length) {
        importGroups.push({ type: multilineImport ? "multiline" : "singleline", imports: currentGroup });
    }

    return importGroups;
}

function replaceMultilineImportGroup(edit, importGroup, documentUri) {
    const startLineIndex = importGroup.imports[0].index;
    const endLineIndex = importGroup.imports[importGroup.imports.length - 1].index;
    const imports = importGroup.imports.slice(1, importGroup.imports.length - 1);
    
    const sortOrder = vscode.workspace.getConfiguration('Staircase Import Formatter').get('order', 'ascending');
    // Sort the imports within the group according to their line length
    let sortedGroupLines = imports.sort((a, b) =>
        sortOrder === 'ascending' ? a.line.length - b.line.length : b.line.length - a.line.length
    );

    const startLine = importGroup.imports[0].line + '\n';
    const endLine = importGroup.imports[importGroup.imports.length - 1].line;

    // Construct the sorted multiline import string
    let sortedMultilineImports = startLine + sortedGroupLines.map(importLine => `${importLine.line}`).join('\n') + '\n' + endLine;

    const endLineLength = vscode.window.activeTextEditor.document.lineAt(endLineIndex).text.length;
    const range = new vscode.Range(startLineIndex, 0, endLineIndex, endLineLength);

    edit.replace(documentUri, range, sortedMultilineImports);
}


module.exports = {
    extractJavascriptImportGroups,
    replaceMultilineImportGroup
};