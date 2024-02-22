const vscode = require("vscode");

function isCommentLine(trimmedLine, inCommentBlock) {
	return (
		trimmedLine.startsWith("//") ||
		(trimmedLine.startsWith("/*") && trimmedLine.endsWith("*/")) ||
		trimmedLine.startsWith("`") ||
		trimmedLine.startsWith("'") ||
		trimmedLine.startsWith('"') ||
		inCommentBlock
	);
}

function isStartOfMultilineImport(trimmedLine) {
	return trimmedLine.startsWith("import ") && trimmedLine.includes("{") && !trimmedLine.includes("}");
}

function isSinglelineImport(trimmedLine) {
	return (
		(trimmedLine.startsWith("import ") &&
			trimmedLine.includes("{") &&
			trimmedLine.includes("}") &&
			!trimmedLine.includes("from")) || // import { ... } from '...';
		/* 
        import ... from '...';
        import ...; 
        */
		(trimmedLine.startsWith("import ") && !isStartOfMultilineImport(trimmedLine))
	);
}

function isEndOfMultilineImport(trimmedLine) {
	return trimmedLine.startsWith("}");
}

function extractJavascriptImportGroups(lines) {
	let importGroups = [];
	let currentImportGroup = [];
	let currentComments = [];

	let inMultilineImport = false;
	let inCommentBlock = false;

	lines.forEach((line, index) => {
		const trimmedLine = line.trim();

		// Check if line is the start of a multiline comment, if it is, set inCommentBlock to true
		if (trimmedLine.startsWith("/*") && !trimmedLine.endsWith("*/")) {
			inCommentBlock = true;
		}

		// Check if line is a comment, if true, add it to the current comments as an object { line, index } and continue to the next line

		if (isCommentLine(trimmedLine, inCommentBlock)) {
			currentComments.push({ line, index });
		}

		// Check if line is single line import, if true, add it to the current import group as an object { line, index, comments } and reset the current comments

		if (isSinglelineImport(trimmedLine)) {
			currentImportGroup.push({ line, index, comments: [...currentComments] });

			currentComments = [];
		}

		// Check if line is not a comment or single line import, if true, add the current group (if any) to the import groups and reset the current import group and comments

		if (!isCommentLine(trimmedLine, inCommentBlock) && !isSinglelineImport(trimmedLine)) {
			// if in multiline import, do nothing
			if (!inMultilineImport) {
				if (currentImportGroup.length) {
					importGroups.push({
						type: "singleline",
						imports: currentImportGroup,
					});
					currentImportGroup = [];
				}
				currentComments = [];
			}
		}

		// Check if line is start of multiline import, if true, set inMultilineImport to true, add the current import group and comments to the import groups if they exist, reset the current import group and comments, and add this line to the current import group

		if (isStartOfMultilineImport(trimmedLine)) {
			inMultilineImport = true;

			if (currentImportGroup.length) {
				importGroups.push({ type: "singleline", imports: currentImportGroup });
				currentImportGroup = [];
			}
			currentComments = [];

			currentImportGroup.push({ line, index, comments: [...currentComments] });
		}

		//Check if line is in multiline import, if true, add the line to the current import group
		else if (inMultilineImport && !isEndOfMultilineImport(trimmedLine)) {
			// Check if line in the multiline import is a comment, if true, do nothing
			if (!isCommentLine(trimmedLine, inCommentBlock)) {
				currentImportGroup.push({
					line,
					index,
					comments: [...currentComments],
				});

				currentComments = [];
			}
		}

		// Check if line is end of multiline import, if true, add the line to the current import group, add the current import group and comments to the import groups, and reset the current import group and comments
		else if (inMultilineImport && isEndOfMultilineImport(trimmedLine)) {
			inMultilineImport = false;

			currentImportGroup.push({ line, index, comments: [...currentComments] });
			importGroups.push({ type: "multiline", imports: currentImportGroup });

			currentImportGroup = [];
			currentComments = [];
		}

		// Check if line is the end of a multiline comment, if true, set inCommentBlock to false

		if (inCommentBlock && trimmedLine.endsWith("*/")) {
			inCommentBlock = false;
		}
	});

	// Add any remaining imports and comments to the import groups
	// Any remaining imports must be singleline imports since multiline imports are handled when the end of a multiline import is found

	if (currentImportGroup.length) {
		importGroups.push({ type: "singleline", imports: currentImportGroup });
	}

	return importGroups;
}

function replaceMultilineImportGroup(edit, importGroup, documentUri) {
	let startLineIndex = importGroup.imports[0].index;
	const endLineIndex = importGroup.imports[importGroup.imports.length - 1].index;

	const startLine = importGroup.imports[0].line + "\n";
	const endLine = importGroup.imports[importGroup.imports.length - 1].line;

	const imports = importGroup.imports.slice(1, importGroup.imports.length - 1);

	const sortOrder = vscode.workspace.getConfiguration("Staircase Import Formatter").get("order", "ascending");

	// Sort the imports within the group according to their line length
	let sortedGroupLines = imports.sort((a, b) =>
		sortOrder === "ascending" ? a.line.length - b.line.length : b.line.length - a.line.length,
	);

	// Initialize a new array to hold the result
	let resultWithComments = [];

	// Iterate over each importLine
	sortedGroupLines.forEach(importLine => {
		// If the importLine has associated comments, add them first
		if (importLine.comments && importLine.comments.length > 0) {
			
			importLine.comments.forEach(comment => {
				resultWithComments.push(comment);
				if (comment.index < startLineIndex) {
					startLineIndex = comment.index;
				}
			});
		}
		// Then, add the importLine itself
		resultWithComments.push(importLine);
	});

	// The closing line might also have leading comments
	if (importGroup.imports[importGroup.imports.length - 1].comments.length > 0) {
		importGroup.imports[importGroup.imports.length - 1].comments.forEach(comment => {
			resultWithComments.push(comment);
		});
	}


	// Construct the sorted multiline import string
	let sortedMultilineImports = startLine + resultWithComments.map((importLine) => `${importLine.line}`).join("\n") + "\n" + endLine;

	const endLineLength = vscode.window.activeTextEditor.document.lineAt(endLineIndex).text.length;
	const range = new vscode.Range(startLineIndex, 0, endLineIndex, endLineLength);

	edit.replace(documentUri, range, sortedMultilineImports);
}

function replaceSinglelineImportGroup(edit, importGroup, documentUri) {
	const imports = importGroup.imports;
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
    sortedGroupLines.forEach(importLine => {
        // If the importLine has associated comments, add them first
        if (importLine.comments && importLine.comments.length > 0) {
            
            importLine.comments.forEach(comment => {
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
	extractJavascriptImportGroups,
	replaceMultilineImportGroup,
	replaceSinglelineImportGroup,
};
