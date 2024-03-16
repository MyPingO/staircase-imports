const { is } = require("express/lib/request");
const vscode = require("vscode");

function isStartOfMultilineImport(lineIndex, multilineImportsDict) {
	return multilineImportsDict && lineIndex in multilineImportsDict;
}

function isSinglelineImport(trimmedLine, lineIndex, multilineImportsDict) {
	return (
		// import { ... } from '...';
		trimmedLine.startsWith("import ") &&
		((trimmedLine.includes("{") && trimmedLine.includes("}") && !trimmedLine.includes("from")) ||
			/* 
				import ... from '...';
				import ...;
				*/
			!isStartOfMultilineImport(lineIndex, multilineImportsDict))
	);
}

function handleComments(index, lines, commentsMap, currentComments) {
	let commentEndLineIndex = commentsMap.get(index);

	// Iterate over each line of the multiline comment and add it to the current comments
	for (; index <= commentEndLineIndex; index++) {
		currentComments.push({ line: lines[index], index });
	}

	return index - 1;
}

function pushCurrentGroupToImportGroups(importGroups, type, currentImportGroup, currentComments) {
	if (currentImportGroup.length) {
		importGroups.push({ type: type, imports: [...currentImportGroup] });
		currentImportGroup.length = 0;
	}
	currentComments.length = 0;
}


//NOTE: The order of the if statements in this function is important
function extractJavascriptImportGroups(lines, multilineStringsMap, commentsMap, multilineImportsDict) {
	let importGroups = [];
	let currentImportGroup = [];
	let currentComments = [];

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		const trimmedLine = line.trim();

		// Check if line is the start of a multiline string, if it is, continue to the end line of the multiline string

		if (multilineStringsMap.has(index)) {
			/* Set the index to the end line index of the multiline string - 1 because the loop will increment the index

			This is to check if the end line of the multiline string isn't also the start of another multiline string */

			index = multilineStringsMap.get(index) - 1;

			// push any potential imports in the current group to the import groups
			pushCurrentGroupToImportGroups(importGroups, "singleline", currentImportGroup, currentComments);

			continue;
		}

		// Check if line is single line import, if true, add it to the current import group as an object { line, index, comments } and reset the current comments

		if (isSinglelineImport(trimmedLine, index, multilineImportsDict)) {
			currentImportGroup.push({ line, index, comments: [...currentComments] });

			currentComments = [];
			continue;
		}

		// Check if line is the start of a multiline comment, if it is, set inCommentBlock to true, push the current comments to the current comments stack, and continue to the end line of the multiline comment

		if (commentsMap.has(index)) {
			index = handleComments(index, lines, commentsMap, currentComments);
			continue;
		}

		// Otherwise, push any potential imports in the current group to the import groups and reset the current import group and comments

		pushCurrentGroupToImportGroups(importGroups, "singleline", currentImportGroup, currentComments);

		// Check if line is start of multiline import, add the current import group and comments to the import groups if they exist, reset the current import group and comments, and add this line to the current import group

		if (isStartOfMultilineImport(index, multilineImportsDict)) {
			let endLineIndex = multilineImportsDict[index].endPosition.row;

			// Iterate over each line of the multiline import
			while (index <= endLineIndex) {
				const line = lines[index];
				const trimmedLine = line.trim();

				if (commentsMap.has(index)) {
					index = handleComments(index, lines, commentsMap, currentComments);
				}

				// Check if line is not a comment and is not empty, if true, add it to the current import group and reset the current comments
				else if (trimmedLine !== "") {
					currentImportGroup.push({ line, index, comments: [...currentComments] });
					currentComments = [];
				}

				index++;
			}
			// Add the current import group to the import groups
			pushCurrentGroupToImportGroups(importGroups, "multiline", currentImportGroup, currentComments);
			// Decrement the index to account for the increment at the end of the while loop
			index -= 1;
		}
	}

	// Add any remaining imports and comments to the import groups
	// Any remaining imports must be singleline imports since multiline imports are handled when the end of a multiline import is found

	pushCurrentGroupToImportGroups(importGroups, "singleline", currentImportGroup, currentComments);

	return importGroups;
}


/* A Quick Visualization of What Happens in this function

--Given the following imports--

openingBraceColumn
|
V
{ some, // a comment!
	something,
	somethingElse <--- No comma
	// another comment!
} from 'somewhere';
^
closingBraceColumn

openingBracePart = "import {"
imports[0].line = "some, // a comment!"

closingBracePart = "} from 'somewhere';"
imports[imports.length - 1].line = "another comment!"

// Add comma to last import if it doesn't have one

--Imports now looks like this--

some, // a comment!
something,
somethingElse, <--- Now it has a comma
// another comment!


--Now we sort the imports by length--

something,
somethingElse,
some, // a comment!
// another comment!

--Then we construct the sorted multiline import string by adding back the brace lines--

sortedMultilineImports = `
{
	something,
	somethingElse,
	some, // a comment!
	// another comment!
} from 'somewhere';
`

--Then we replace the original import group with the sorted import group--

Done!
*/
function replaceMultilineImportGroup(edit, imports, multilineImportsDict, documentUri) {
	const startLineIndex = multilineImportsDict[imports[0].index].startPosition.row;

	// The row for where the import group starts and ends
	const openingBraceRow = multilineImportsDict[startLineIndex].startPosition.row;
	const closingBraceRow = multilineImportsDict[startLineIndex].endPosition.row;

	// The column for where the braces start and end
	const openingBraceColumn = multilineImportsDict[startLineIndex].startPosition.column;
	// The closing brace column is 1 more than the column the closing brace is on
	const closingBraceColumn = multilineImportsDict[startLineIndex].endPosition.column - 1;

	// // Save the leading whitespace of the first import line to be used in the replacement text
	// let leadingWhitespace = imports[0].line.match(/^\s*/)[0];
	
	// Save the open brace and everything before it, then delete it from the first import line
	let openingBracePart = imports[0].line.slice(0, openingBraceColumn + 1);
	imports[0].line = imports[0].line.slice(openingBraceColumn + 1);

	// Save the closing brace and everything after it, then delete it from the last import line
	let closingBracePart = imports[imports.length - 1].line.slice(closingBraceColumn);
	imports[imports.length - 1].line = imports[imports.length - 1].line.slice(0, closingBraceColumn);

	// Delete the first line if it's empty
	if (imports[0].line.trim() === "") {
		imports.shift();
	}
	// Delete the last line if it's empty and has no leading comments
	// If it has comments, replace the line with it's leading comments
	let lastLineComments;
	if (imports[imports.length - 1].line.trim() === "") {
		if (imports[imports.length - 1].comments && imports[imports.length - 1].comments.length > 0){
			lastLineComments = imports[imports.length - 1].comments.map((comment) => comment.line).join("\n");
		}
		imports.pop();
	}

	// Attempt to make sure the last import has a trailing comma before formatting
	// The following lines of code don't account for really dumb edge cases

	let lastImport = imports[imports.length - 1].line;

	// It might have leading comments, so split the line and add the trailing comma to the last part
	let lastImportCommentSplit = lastImport.split(/(?=\/\/)|(?=\/\*)/); // (Regex for // or /*)
	lastImportCommentSplit[0] = lastImportCommentSplit[0].trimEnd();

	// If lastImportCommentSplit[0] doesn't end with a comma, add it
	if (!lastImportCommentSplit[0].endsWith(",")) {
		lastImportCommentSplit[0] += ",";
		// Join the line back together
		imports[imports.length - 1].line = lastImportCommentSplit.join("");
	}

	// Add the last line's comments back to the imports array
	if (lastLineComments) {
		imports.push({ line: lastLineComments, index: closingBraceRow, comments: []});
	}

	// Sort the imports within the group according to their line length
	const sortOrder = vscode.workspace.getConfiguration("Staircase Import Formatter").get("order", "ascending");

	// Sort the imports within the group according to their line length
	imports.sort((a, b) =>
		sortOrder === "ascending" ? a.line.length - b.line.length : b.line.length - a.line.length,
	);

	// Initialize a new array to hold the result
	let resultWithComments = [];

	// Iterate over each importLine
	imports.forEach((importLine) => {
		// If the importLine has associated comments, add them first
		if (importLine.comments && importLine.comments.length > 0) {
			importLine.comments.forEach((comment) => {
				resultWithComments.push(comment);
			});
		}
		// Then, add the importLine itself
		resultWithComments.push(importLine);
	});

	// Construct the sorted multiline import string
	let sortedMultilineImports = resultWithComments.map((importLine) => `${importLine.line}`).join("\n");

	// Add back the curly braces and leading whitespace
	sortedMultilineImports = openingBracePart + "\n" + sortedMultilineImports + "\n" + closingBracePart;

	const range = new vscode.Range(openingBraceRow, openingBraceColumn, closingBraceRow, closingBraceColumn + 1 + closingBracePart.length);

	edit.replace(documentUri, range, sortedMultilineImports);
}


function replaceSinglelineImportGroup(edit, imports, documentUri) {
	const endLineIndex = imports[imports.length - 1].index;
	let startLineIndex = imports[0].index;

	const sortOrder = vscode.workspace.getConfiguration("Staircase Import Formatter").get("order", "ascending");

	// Sort the imports within the group according to their line length
	imports.sort((a, b) =>
		sortOrder === "ascending" ? a.line.length - b.line.length : b.line.length - a.line.length,
	);

	// Initialize a new array to hold the result
	let resultWithComments = [];

	// Iterate over each importLine
	imports.forEach((importLine) => {
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
