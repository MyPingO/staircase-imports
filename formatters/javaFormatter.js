const vscode = require("vscode");

function isCommentLine(trimmedLine, inCommentBlock) {
	return (
		trimmedLine.startsWith("//") || (trimmedLine.startsWith("/*") && trimmedLine.endsWith("*/")) || inCommentBlock
	);
}

function isSinglelineImport(trimmedLine) {
	return trimmedLine.startsWith("import ");
}

function extractJavaImportGroups(lines) {
	let importGroups = [];
	let currentImportGroup = [];
	let currentComments = [];

	let inCommentBlock = false;

	lines.forEach((line, index) => {
		const trimmedLine = line.trim();

		// Check if line is the start of a multiline comment, if it is, set inCommentBlock to true
		if (trimmedLine.startsWith("/*") && !trimmedLine.endsWith("*/")) {
			inCommentBlock = true;
            currentComments.push({ line, index });
            return;
		}

        // Check if line is the end of a multiline comment, if it is, set inCommentBlock to false
		if (inCommentBlock && trimmedLine.endsWith("*/")) {
			inCommentBlock = false;
            currentComments.push({ line, index });
            return;
		}

		// Check if line is a single-line comment, if true, add it to the current comments as an object { line, index } and continue to the next line
		if (isCommentLine(trimmedLine, inCommentBlock)) {
			currentComments.push({ line, index });
		}

		// Check if line is single line import, if true, add it to the current import group as an object { line, index, comments } and reset the current comments
		else if (isSinglelineImport(trimmedLine)) {
			currentImportGroup.push({ line, index, comments: [...currentComments] });
			currentComments = [];
		}

		// Check if line is not a comment or single line import, if true, add the current group (if any) to the import groups and reset the current import group and comments

		else {
			if (currentImportGroup.length > 0) {
				importGroups.push(currentImportGroup);
				currentImportGroup = [];
			}
			currentComments = [];
		}
	});

	if (currentImportGroup.length > 0) {
		importGroups.push(currentImportGroup);
	}

	return importGroups;
}

function replaceSinglelineImportGroup(edit, imports, documentUri) {
	const endLineIndex = imports[imports.length - 1].index;
	let startLineIndex = imports[0].index;

	const sortOrder = vscode.workspace.getConfiguration("Staircase Import Formatter").get("order", "ascending");

	// Sort the imports within the group according to their line length
	let sortedGroupLines = imports.sort((a, b) =>
		sortOrder === "ascending" ? a.line.length - b.line.length : b.line.length - a.line.length,
	);

	// Initialize a new array to hold the result
	let resultWithComments = [];

	// Iterate over each importLine
	sortedGroupLines.forEach((importLine) => {
		// If the importLine has associated comments, add them first
		if (importLine.comments && importLine.comments.length > 0) {
			importLine.comments.forEach((comment) => {
				resultWithComments.push(comment);
				if (comment.index < startLineIndex) {
					startLineIndex = comment.index;
				}
			});
		}
		// Then, add the importLine itself
		resultWithComments.push(importLine);
	});

	// Construct the sorted singleline import string
	let sortedSinglelineImports = resultWithComments.map((importLine) => `${importLine.line}`).join("\n");

	const endLineLength = vscode.window.activeTextEditor.document.lineAt(endLineIndex).text.length;
	const range = new vscode.Range(startLineIndex, 0, endLineIndex, endLineLength);

	edit.replace(documentUri, range, sortedSinglelineImports);
}

module.exports = {
    extractJavaImportGroups,
    replaceSinglelineImportGroup,
};
