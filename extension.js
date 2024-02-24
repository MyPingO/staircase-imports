const vscode = require("vscode");
const pythonFormatter = require("./formatters/pythonFormatter");
const javascriptFormatter = require("./formatters/javascriptFormatter");
const javaFormatter = require("./formatters/javaFormatter");

const SUPPORTED_LANGUAGES = [
	"python",
	"javascript",
	"typescript",
	"java",
	// 'csharp': /^\s*using .*;$/gm,
	// 'c': /^\s*#include .*$/gm,
	// 'cpp': /^\s*#include .*$/gm,
	// 'php': /^\s*use .*;$/gm,
	// 'ruby': /^\s*require .*$/gm,
	// 'go': /^\s*import .*$/gm,
	// 'rust': /^\s*use .*;$/gm,
	// 'kotlin': /^\s*import .*$/gm,
	// 'swift': /^\s*import .*$/gm,
	// 'dart': /^\s*import .*;?$/gm,
	// 'shellscript': /^\s*source .*$/gm,
	// 'powershell': /^\s*using .*$/gm,
	// 'elixir': /^\s*import .*$/gm,
	// 'lua': /^\s*require .*$/gm,
	// 'perl': /^\s*use .*;$/gm,
	// 'r': /^\s*library\(.*\)$/gm,
	// 'julia': /^\s*using .*$/gm,
	// 'haskell': /^\s*import .*$/gm,
	// 'erlang': /^\s*-include\(.*\)$/gm,
	// 'clojure': /^\s*\(require .*$/gm,
	// 'groovy': /^\s*import .*$/gm,
	// 'scala': /^\s*import .*$/gm,
];

function activate(context) {
	vscode.window.showInformationMessage("Staircase Import Formatter Activated!");
	context.subscriptions.push(
		vscode.workspace.onWillSaveTextDocument((event) => {
			const config = vscode.workspace.getConfiguration("Staircase Import Formatter");
			const enabled = config.get("enabled", "enabled");
			if (event.document.uri.scheme === "file" && enabled === "enabled") {
				formatOnSave(event);
			}
		}),
	);
}

function formatOnSave(event) {
	const document = event.document;
	const languageId = document.languageId;
	const uri = document.uri;
	if (SUPPORTED_LANGUAGES.includes(languageId)) {
		let edit;
		let importGroups;
		const documentText = document.getText();
		const lines = documentText.split(/\r?\n/); // \r? for windows compatibility
		switch (languageId) {
			case "python":
				importGroups = pythonFormatter.extractPythonImportGroups(lines);
				edit = new vscode.WorkspaceEdit();
				for (let i = 0; i < importGroups.length; i++) {
					const importGroup = importGroups[i];
					if (importGroup.imports.length > 1) {
						if (importGroup.type === "singleline") {
							pythonFormatter.replaceSinglelineImportGroup(edit, importGroup, uri);
						} else if (importGroup.type === "multiline") {
							pythonFormatter.replaceMultilineImportGroup(edit, importGroup, uri);
						}
					}
				}
				break;
			case "typescriptreact":
			case "typescript":
			case "javascriptreact":
			case "javascript":
				importGroups = javascriptFormatter.extractJavascriptImportGroups(lines);
				edit = new vscode.WorkspaceEdit();
				for (let i = 0; i < importGroups.length; i++) {
					const importGroup = importGroups[i];
					if (importGroup.imports.length > 1) {
						if (importGroup.type === "singleline") {
							javascriptFormatter.replaceSinglelineImportGroup(edit, importGroup, uri);
						} else if (importGroup.type === "multiline") {
							javascriptFormatter.replaceMultilineImportGroup(edit, importGroup, uri);
						}
					}
				}
				break;
			case "java":
				importGroups = javaFormatter.extractJavaImportGroups(lines);
				edit = new vscode.WorkspaceEdit();
				for (let i = 0; i < importGroups.length; i++) {
					const imports = importGroups[i];
					if (imports.length > 1) {
						javaFormatter.replaceSinglelineImportGroup(edit, imports, uri);
					}
				}
				break;
			default:
				break;
		}
		// I have no idea if any of this below code works
		event.waitUntil(vscode.workspace.applyEdit(edit));
		// force save?
		let save = vscode.workspace.saveAll();
		if (!save) {
			vscode.window.showErrorMessage("Failed to save all documents");
		}
	}
}

function deactivate() {}

module.exports = {
	activate,
	deactivate,
};
