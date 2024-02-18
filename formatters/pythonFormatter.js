const vscode = require('vscode');

function getPythonImportGroups(document, importPattern) {
    const documentText = document.getText();
    const lines = documentText.split(/\r?\n/); // \r? for windows compatibility
    const importGroups = extractPythonImportGroups(lines, importPattern);

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

            // if multiline import comes after regular group
            if (currentGroup.length > 0) {
                // push current group and reset
                importGroups.push({ type: "singleline", imports: currentGroup });
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
                importGroups.push({ type: "multiline", opening: opening, imports: currentGroup, openingLineIndex: openingLineIndex, closingLineIndex: closingLineIndex });
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
            importGroups.push({ type: "singleline", imports: currentGroup });
            currentGroup = [];
        }

        
    }
    // Add the last group if it exists
    if (currentGroup.length > 0) {
        importGroups.push({ type: "singleline", imports: currentGroup });
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


module.exports = {
    getPythonImportGroups,
    replaceMultiLineImportGroup
}