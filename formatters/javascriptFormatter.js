const assert = require("assert");
const vscode = require("vscode");

function pushCurrentGroupToImportGroups(importGroups, type, currentImportGroup, currentComments) {
	if (currentImportGroup.length) {
		importGroups.push({ type: type, imports: [...currentImportGroup] });
		currentImportGroup.length = 0;
	}
	currentComments.length = 0;
}

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
					namedImports.children.forEach((child) => {
						// Doing this to make node mutable
						let node = {
							type: child.type,
							startPosition: { ...child.startPosition },
							endPosition: { ...child.endPosition },
							text: child.text,
						};

						if (node.text.endsWith("\r")) {
							node.text = node.text.slice(0, -1);
							node.endPosition.column -= 1;
						}

						// If the node is a comment, add it to the currentComments array
						if (node.type === "comment") {
							if (lastLineIndex === node.startPosition.row && lastNodeWasImport) {
								currentImportGroup[currentImportGroup.length - 1].trailingComments.push({ node: node, text: node.text});
							}
							else {
								currentComments.push({ node: node, text: node.text});
								lastNodeWasImport = false;
							}
						}
						// If the node is an import_specifier, add it to the currentImportGroup array
						else if (node.type === "import_specifier") {
							currentImportGroup.push({ node: node, text: node.text, leadingComments: [...currentComments], trailingComments: []});
							currentComments.length = 0;
							lastNodeWasImport = true;
						}
						// If the node is a comma, add it to the last import_specifier in the currentImportGroup array
						else if (node.type === ",") {
							assert(currentImportGroup[currentImportGroup.length - 1].node.type === "import_specifier", "Expected the last node to be an import_specifier");
							currentImportGroup[currentImportGroup.length - 1].text += ",";
						}
						lastLineIndex = node.endPosition.row;
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


function replaceImportGroup(edit, importGroupType, imports, documentUri) {
	
	// Get the start and end position of the first and last nodes in the group
	let startPosition;
	if (imports[0].leadingComments && imports[0].leadingComments.length > 0) {
		startPosition = imports[0].leadingComments[0].node.startPosition;
	} 
	else {
		startPosition = imports[0].node.startPosition;
	}

	let endPosition;
	if (imports[imports.length - 1].trailingComments && imports[imports.length - 1].trailingComments.length > 0) {
		endPosition = imports[imports.length - 1].trailingComments.at(-1).node.endPosition;
	}
	else {
		endPosition = imports[imports.length - 1].node.endPosition;
	}

	// Get the whitespace count of the first node in the group
	let whitespaceCount = startPosition.column;

	let unsortedImports = [];

	// Add the imports and any potential trailing comments to the unsortedImports array
	for (let i = 0; i < imports.length; i++) {
		const importObject = imports[i];
		let importText = importObject.text;

		if (importGroupType === "multiline" && !importText.endsWith(",")) {
			importText = importText + ',';
		} 

		if (importObject.trailingComments && importObject.trailingComments.length > 0) {
			importObject.trailingComments.forEach((comment) => {
				importText += ` ${comment.text}`;
			});
		}
		unsortedImports.push({ node: importObject.node, text: importText, leadingComments: importObject.leadingComments });
	}

	// Sort the imports within the group according to their line length
	const sortOrder = vscode.workspace.getConfiguration("Staircase Import Formatter").get("order", "ascending");

	// Sort the imports within the group according to their line length
	let sortedImports = unsortedImports.sort((a, b) =>
		sortOrder === "ascending" ? a.text.length - b.text.length : b.text.length - a.text.length,
	);

	// Initialize a new array to hold the result
	let importsWithLeadingComments = [];

	// Iterate over each importLine
	sortedImports.forEach((importLine) => {
		// If the importLine has associated comments, add them before it
		if (importLine.leadingComments && importLine.leadingComments.length > 0) {
			importLine.leadingComments.forEach((comment) => {
				importsWithLeadingComments.push(comment.text);
			});
		}
		// Then, add the importLine itself
		importsWithLeadingComments.push(importLine.text);
	});

	
	// Go through each text line and add the whitespace to the beginning of the line
	for (let i = 1; i < importsWithLeadingComments.length; i++) {
		importsWithLeadingComments[i] = " ".repeat(whitespaceCount) + importsWithLeadingComments[i];
	}

	// Construct the sorted multiline import string
	let replaceString = importsWithLeadingComments.join("\n");

	const range = new vscode.Range(startPosition.row, startPosition.column, endPosition.row, endPosition.column);

	edit.replace(documentUri, range, replaceString);
}


module.exports = {
	extractJavascriptImportGroups,
	replaceImportGroup,
};
