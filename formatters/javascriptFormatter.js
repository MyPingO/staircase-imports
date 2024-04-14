const vscode = require("vscode");

// Get tab config options
const tabSize = vscode.workspace.getConfiguration("editor").get("tabSize", 4);
const insertSpaces = vscode.workspace.getConfiguration("editor").get("insertSpaces", true);

let tab;
if (insertSpaces) tab = " ".repeat(tabSize);
else tab = "\t";

function pushSingleLineGroup(importGroups, currentImportGroup, currentComments) {
	if (currentImportGroup.length) {
		importGroups.push({ type: "singleline", imports: [...currentImportGroup] });
		currentImportGroup.length = 0;
	}
	currentComments.length = 0;
}

function checkNeighborNode(nodeGroup, index, nodeTypesToCheck) {
	let nextNode = nodeGroup[index];
	if (nextNode && nodeTypesToCheck) return (
		nodeTypesToCheck.includes(nextNode.type) &&
		nextNode.startPosition.row - nodeGroup[index - 1].endPosition.row <= 1
	);
	else return false;
}

function lastNodeOnLine(nodeGroup, index) {
	let nextNode = nodeGroup[index + 1];
	if (nextNode) return nextNode.startPosition.row > nodeGroup[index].startPosition.row;
	return true;
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
			pushSingleLineGroup(importGroups, currentImportGroup, currentComments);
		}

		// Otherwise we are in the same import group

		// If the node is a comment add it to the currentComments array
		if (captureName === "comment") {
			if (nodeStartLine === lastLineIndex && lastNodeWasImport) {
				let text = node.text;
				if (text.endsWith("\r")) {
					text = text.slice(0, -1);
				}
				currentImportGroup[currentImportGroup.length - 1].trailingComments.push({ node: node, text: text });
			}
			else {
				currentComments.push({ node: node, text: node.text });
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
				pushSingleLineGroup(importGroups, currentImportGroup, currentComments);

				// Check if node has syntactical errors
				if (node.hasError()) {
					vscode.window.showErrorMessage("Skipped formatting import at line " + (node.startPosition.row + 1) + " due to syntax error.");
					return;
				}

				let conditionalSpace = lastNodeOnLine(node.children, 0) ? "" : " ";

				const importObject = {
					startPosition: node.startPosition,
					endPosition: node.endPosition,
					leadingText: "import" + conditionalSpace,
					importGroups: [],
					innerText: [],
					trailingText: "}"
				};

				let index = 1;
				while (node.children[index].type != 'import_clause') {
					importObject.leadingText += node.children[index].text;
					if (lastNodeOnLine(node.children, index)) {
						if (node.children[index].text.endsWith("\r")) {
							importObject.leadingText = importObject.leadingText.slice(0, -1);
						}
						importObject.leadingText += "\n";
					}
					else importObject.leadingText += " ";

					index++;
				}

				importObject.leadingText += "{\n" + tab;

				let named_imports = node.children[index].children.find(child => child.type === "named_imports");

				let importOrder = -1;
				
				for (let i = 1; i < named_imports.children.length; i++) {
					const child = named_imports.children[i];
					let text = child.text;

					if (child.type === "comment") {
						
						let conditionalNewLine = "";
						if (lastNodeOnLine(named_imports.children, i)) {
							// Get rid of potential return carriage
							if (text.endsWith("\r")) {
								text = text.slice(0, -1);
							}
	
							conditionalNewLine = "\n" + tab;
						}
						else conditionalNewLine = "";
						currentComments.push(text + conditionalNewLine);
						
						if (!checkNeighborNode(named_imports.children, i + 1, ["comment", "import_specifier"])) {
							importObject.innerText.push(...currentComments);
							currentComments.length = 0;
						}
					}
					else if (child.type === "import_specifier") {
						importOrder++;
						importObject.innerText.push(importOrder);
						
						const importLine = { text: text, leadingComments: [...currentComments] };
						currentComments.length = 0;

						if (lastNodeOnLine(named_imports.children, i)) {
							importLine.text += "\n" + tab;
						} 
						else {
							// Add any trailing text on the same line to importLine.text
							i++;
							let lastNodeOnLineVisited = false;
							while (named_imports.children[i].type != 'import_specifier' && named_imports.children[i].type != '}') {
								let conditionalSpace = named_imports.children[i].type === "," ? "" : " ";
								importLine.text += conditionalSpace + named_imports.children[i].text;
								if (lastNodeOnLine(named_imports.children, i)) {
									if (named_imports.children[i].text.endsWith("\r")) {
										importLine.text = importLine.text.slice(0, -1);
									}
									importLine.text += "\n" + tab;
									lastNodeOnLineVisited = true;
									i++;
									break;
								}
	
								i++;
							}
							if (!lastNodeOnLineVisited) {
								importLine.text += "\n" + tab;
							}
							i--;
						}

						importObject.importGroups.push(importLine);
					}
					else if (child.type === "}") {
						index = node.children.indexOf(node.children.find(child => child.type === "from"));
						while (index < node.children.length) {
							let conditionalSpace = node.children[index].type === ";" ? "" : " ";
							importObject.trailingText += conditionalSpace + node.children[index].text;
							index++;
						}
						break;
					}

				}

				importGroups.push({ type: "multiline",  importObject: importObject });
				lastNodeWasImport = false;
			}
		}
		lastLineIndex = nodeEndLine;
	});
	pushSingleLineGroup(importGroups, currentImportGroup, currentComments);
	return importGroups;
}


function replaceSinglelineImportGroup(edit, imports, document) {

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

	let unsortedImports = [];

	// Add the imports and any potential trailing comments to the unsortedImports array
	for (let i = 0; i < imports.length; i++) {
		const importObject = imports[i];
		let importText = importObject.text;

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
				importsWithLeadingComments.push({ node: comment.node, text: comment.text });
			});
		}
		// Then, add the importLine itself
		importsWithLeadingComments.push({ node: importLine.node, text: importLine.text });
	});


	let whitespace = document.lineAt(startPosition.row).text.match(/^(\s*)/)[0];
	//if whitespace length != start column
	if (whitespace.length !== startPosition.column) {
		importsWithLeadingComments[0].text = "\n" + importsWithLeadingComments[0].text;
	}

	// Go through each text line after the first and add the whitespace to the beginning of the line
	for (let i = 1; i < importsWithLeadingComments.length; i++) {
		importsWithLeadingComments[i].text = whitespace + importsWithLeadingComments[i].text;
	}

	// Construct the sorted multiline import string
	let replaceString = importsWithLeadingComments.map(importLine => importLine.text).join("\n");

	const range = new vscode.Range(startPosition.row, startPosition.column, endPosition.row, endPosition.column);

	edit.replace(document.uri, range, replaceString);
}

function replaceMultilineImportGroup(edit, importObject, document) {
	const startPosition = importObject.startPosition;
	const endPosition = importObject.endPosition;

	if (startPosition.column != 0) {
		importObject.leadingText = "\n" + importObject.leadingText;
	}

	const sortOrder = vscode.workspace.getConfiguration("Staircase Import Formatter").get("order", "ascending");

	// Sort the imports within the group according to their line length
	let sortedImports = importObject.importGroups.sort((a, b) =>
		sortOrder === "ascending" ? a.text.length - b.text.length : b.text.length - a.text.length,
	);

	// Construct the sorted multiline import string
	let importText = importObject.leadingText;
	for (let i = 0; i < importObject.innerText.length; i++) {
		const text = importObject.innerText[i];
		// Check if the current innerText is a string or a number
		if (typeof importObject.innerText[i] === "string") {
			importText += text;
		} else {
			if (sortedImports[i].leadingComments.length > 0) {
				for (let j = 0; j < sortedImports[i].leadingComments.length; j++) {
					importText += sortedImports[i].leadingComments[j];
				}
			}
			importText += sortedImports[i].text;
		}
	}
	if (importText.endsWith("\n" + tab)) {
		importText = importText.slice(0, -tab.length);
	}
	importText += importObject.trailingText;
	console.log(importText);

	const range = new vscode.Range(startPosition.row, startPosition.column, endPosition.row, endPosition.column);

	edit.replace(document.uri, range, importText);
}


module.exports = {
	extractJavascriptImportGroups,
	replaceSinglelineImportGroup,
	replaceMultilineImportGroup
};