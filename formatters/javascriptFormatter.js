const { text } = require("body-parser");
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
function extractJavascriptImportGroups(captures) {
	let importGroups = [];
	let currentImportGroup = [];
	let currentComments = [];

	let lastLineIndex = 0;
	let lastNodeWasImport = false;

	captures.forEach(capture => {
		const node = capture.node;
		const captureName = capture.name;
		const nodeStartLine = node.startPosition.row;
		const nodeEndLine = node.endPosition.row;


		// If the nodeStartLine - lastLineIndex > 1, then we are in a new import group, 
		// So push the currentImportGroup to the importGroups array (if any) and reset it and the currentComments array
		if (nodeStartLine - lastLineIndex > 1) {
			pushCurrentGroupToImportGroups(importGroups, "singleline", currentImportGroup, currentComments);
		}

		// Otherwise we are in the same import group

		// If the node is a comment add it to the currentComments array
		if (captureName === "comment") {
			if (nodeStartLine === lastLineIndex && lastNodeWasImport) {
				currentImportGroup[currentImportGroup.length - 1].trailingComments.push({ node: node, text: node.text});
			}
			else {
				currentComments.push({ node: node, text: node.text});
				lastNodeWasImport = false;
			}
		}

		// If the node is an import, do some checks to see if it's a singleline or multiline import
		else if (captureName === "import") {

			// If the start and end line is the same, it is a singleline import
			if (nodeStartLine === nodeEndLine) {
				currentImportGroup.push({ node: node, text: node.text, leadingComments: [...currentComments], trailingComments: [] });
				currentComments.length = 0;
				lastNodeWasImport = true;
			}

			// Otherwise it is a multiline import
			else {
				// If the currentImportGroup is not empty, push it to the importGroups array and reset it and the currentComments array
				if (currentImportGroup.length) {
					pushCurrentGroupToImportGroups(importGroups, "singleline", currentImportGroup, currentComments);
				}

				// Get the import_clause child from the node
				const importClause = node.namedChildren.find((child) => child.type === "import_clause");
				// Try get the named_imports child from the import_clause
				const namedImports = importClause.namedChildren.find((child) => child.type === "named_imports");
				// If it exists, add every child node to the currentImportGroup array with the same comment logic as above
				if (namedImports) {
					namedImports.namedChildren.forEach((child) => {
						// If the child is a comment, add it to the currentComments array
						if (child.type === "comment") {
							if (lastLineIndex === child.startPosition.row && lastNodeWasImport) {
								currentImportGroup[currentImportGroup.length - 1].trailingComments.push({ node: child, text: child.text});
							}
							else {
								currentComments.push({ node: child, text: child.text});
								lastNodeWasImport = false;
							}
						}
						// If the child is an import_specifier, add it to the currentImportGroup array
						else if (child.type === "import_specifier") {
							currentImportGroup.push({ node: child, text: child.text, leadingComments: [...currentComments], trailingComments: []});
							currentComments.length = 0;
							lastNodeWasImport = true;
						}
						lastLineIndex = child.endPosition.row;
					});
					lastNodeWasImport = false;
					// Add the currentImportGroup to the importGroups array and reset it and the currentComments array
					pushCurrentGroupToImportGroups(importGroups, "multiline", currentImportGroup, currentComments);
				}
			}
		}
		lastLineIndex = nodeEndLine;
	});
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
		if (imports[imports.length - 1].comments && imports[imports.length - 1].comments.length > 0) {
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
		imports.push({ line: lastLineComments, index: closingBraceRow, comments: [] });
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
