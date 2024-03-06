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
		// import { ... } from '...';
		trimmedLine.startsWith("import ") &&
		((trimmedLine.includes("{") && trimmedLine.includes("}") && !trimmedLine.includes("from")) ||
			/* 
				import ... from '...';
				import ...;
				*/
			!isStartOfMultilineImport(trimmedLine))
	);
}

function isEndOfMultilineImport(trimmedLine) {
	return trimmedLine.startsWith("}");
}

function pushCurrentGroupToImportGroups(importGroups, type, currentImportGroup, currentComments) {
	if (currentImportGroup.length) {
		importGroups.push({ type: type, imports: [...currentImportGroup] });
		currentImportGroup.length = 0;
	}
	currentComments.length = 0;
}

function extractJavascriptImportGroups(lines, multilineStringsMap) {
	let importGroups = [];
	let currentImportGroup = [];
	let currentComments = [];

	let inMultilineImport = false;
	let inCommentBlock = false;
	let inMultilineString = false;

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		const trimmedLine = line.trim();

		// Check if line is the start of a multiline string, if it is, continue to the end line of the multiline string

		if (multilineStringsMap) {
			if (multilineStringsMap.has(index)) {
				inMultilineString = true;
				// Set the index to the end index of the multiline string - 1 because the loop will increment the index
				// This is to check if the end line of the multiline string isn't also the start of another multiline string
				index = multilineStringsMap.get(index) - 1;

				// push any potential imports in the current group to the import groups
				pushCurrentGroupToImportGroups(importGroups, "singleline", currentImportGroup, currentComments);

				continue;
			}
			// If the line isn't the start of a multiline string, reset inMultilineString flag and continue
			else if (inMultilineString) {
				inMultilineString = false;
				continue;
			}
		}

		// Check if line is the start of a multiline comment, if it is, set inCommentBlock to true, push the current comments to the current comments stack, and continue to the next line

		if (trimmedLine.startsWith("/*") && !trimmedLine.endsWith("*/")) {
			inCommentBlock = true;
			currentComments.push({ line, index });
			continue;
		}
		// Check if line is the end of a multiline comment, if true, set inCommentBlock to false

		if (inCommentBlock && trimmedLine.endsWith("*/")) {
			inCommentBlock = false;
			currentComments.push({ line, index });
			continue;
		}

		// Check if line is a single-line comment, if true, add it to the current comments as an object { line, index } and continue to the next line

		if (isCommentLine(trimmedLine, inCommentBlock)) {
			currentComments.push({ line, index });
			continue;
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
				// push any potential imports in the current group to the import groups
				pushCurrentGroupToImportGroups(importGroups, "singleline", currentImportGroup, currentComments);
			}
		}

		// Check if line is start of multiline import, if true, set inMultilineImport to true, add the current import group and comments to the import groups if they exist, reset the current import group and comments, and add this line to the current import group

		if (isStartOfMultilineImport(trimmedLine)) {
			inMultilineImport = true;

			// push any potential imports in the current group to the import groups
			pushCurrentGroupToImportGroups(importGroups, "singleline", currentImportGroup, currentComments);

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
			pushCurrentGroupToImportGroups(importGroups, "multiline", currentImportGroup, currentComments);
		}
	}

	// Add any remaining imports and comments to the import groups
	// Any remaining imports must be singleline imports since multiline imports are handled when the end of a multiline import is found

	pushCurrentGroupToImportGroups(importGroups, "singleline", currentImportGroup, currentComments);

	return importGroups;
}

function replaceMultilineImportGroup(edit, importGroup, documentUri) {
	let startLineIndex = importGroup.imports[0].index;
	const endLineIndex = importGroup.imports[importGroup.imports.length - 1].index;

	const startLine = importGroup.imports[0].line + "\n";
	const endLine = importGroup.imports[importGroup.imports.length - 1].line;

	const imports = importGroup.imports.slice(1, importGroup.imports.length - 1);

	// Make sure the last import has a comma at the end
	const lastImportLine = imports[imports.length - 1].line;

	// It might have an inline comment
	let lastImportLineSplit = lastImportLine.split(/(?=\/\/)|(?=\/\*)/); // Split without removing the delimiter from the string

	// Save trailing whitespace to add back later
	const whitespaceMatch = lastImportLineSplit[0].match(/\s+$/);
	const trailingWhitespace = whitespaceMatch ? whitespaceMatch[0] : "";

	// Get rid of trailing whitespace
	lastImportLineSplit[0] = lastImportLineSplit[0].trimEnd();

	// Add comma if it doesn't exist
	if (!lastImportLineSplit[0].endsWith(",")) {
		lastImportLineSplit[0] = lastImportLineSplit[0] + ",";
	}

	// Add trailing whitespace back
	lastImportLineSplit[0] = lastImportLineSplit[0] + trailingWhitespace;

	// Rejoin the line
	imports[imports.length - 1].line = lastImportLineSplit.join("");

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

	// The closing line might also have leading comments
	if (importGroup.imports[importGroup.imports.length - 1].comments.length > 0) {
		importGroup.imports[importGroup.imports.length - 1].comments.forEach((comment) => {
			resultWithComments.push(comment);
		});
	}

	// Construct the sorted multiline import string
	let sortedMultilineImports =
		startLine + resultWithComments.map((importLine) => `${importLine.line}`).join("\n") + "\n" + endLine;

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
	extractJavascriptImportGroups,
	replaceMultilineImportGroup,
	replaceSinglelineImportGroup,
};
