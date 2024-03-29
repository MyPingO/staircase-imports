const vscode = require("vscode");
const path = require("path");
const pythonFormatter = require("./formatters/pythonFormatter");
const javascriptFormatter = require("./formatters/javascriptFormatter");
const javaFormatter = require("./formatters/javaFormatter");
const Parser = require("web-tree-sitter");

const LOADED_WASM_LANGUAGES = {
	python: null,
	javascript: null,
	typescript: null,
	java: null,
};

const SUPPORTED_LANGUAGES = {
	python: "tree-sitter-python.wasm",
	javascript: "tree-sitter-javascript.wasm",
	typescript: "tree-sitter-typescript.wasm",
	java: "tree-sitter-java.wasm",
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
};

async function initializeTreeSitterParser() {
	await Parser.init();
	const parser = new Parser();
	return parser;
}

async function activate(context) {
	vscode.window.showInformationMessage("Staircase Import Formatter Activated!");
	const parser = await initializeTreeSitterParser();
	context.subscriptions.push(
		vscode.workspace.onWillSaveTextDocument((event) => {
			const config = vscode.workspace.getConfiguration("Staircase Import Formatter");
			const enabled = config.get("enabled", "enabled");
			if (event.document.uri.scheme === "file" && enabled === "enabled") {
				formatOnSave(event, context, parser);
			}
		}),
	);
}

async function setWASMLanguage(context, languageId, parser) {
	if (LOADED_WASM_LANGUAGES[languageId] !== null) return;

	const wasmPath = path.join(context.extensionPath, "grammars", SUPPORTED_LANGUAGES[languageId]);
	const lang = await Parser.Language.load(wasmPath);
	LOADED_WASM_LANGUAGES[languageId] = lang;
	parser.setLanguage(LOADED_WASM_LANGUAGES[languageId]);
}

async function createParserTree(context, languageId, parser, documentText) {
	await setWASMLanguage(context, languageId, parser);
	return parser.parse(documentText);
}

function createMultilineStringMap(parser, tree, queryString) {
	const queryMap = new Map();

	const query = parser.getLanguage().query(queryString);
	const matches = query.captures(tree.rootNode);
	for (let i = 0; i < matches.length; i++) {
		const match = matches[i];
		const node = match.node;
		const startLine = node.startPosition.row;
		const endLine = node.endPosition.row;
		if (startLine !== endLine) {
			queryMap.set(startLine, endLine);
		}
	}
	return queryMap;
}

async function formatOnSave(event, context, parser) {
	const document = event.document;
	const languageId = document.languageId;
	const uri = document.uri;
	if (languageId in SUPPORTED_LANGUAGES) {
		let edit;
		let importGroups;
		let multilineStringsMap;
		const documentText = document.getText();
		const lines = documentText.split(/\r?\n/); // \r? for windows compatibility

		// tree sitter parsing for multiline strings
		const tree = await createParserTree(context, languageId, parser, documentText);
		switch (languageId) {
			case "python":
				const pythonQuery = `
				(expression_statement([(string) (binary_operator(string))])) @string
				(expression_statement(assignment([(string) (binary_operator(string))]))) @stringAssignment
				`;
				multilineStringsMap = createMultilineStringMap(parser, tree, pythonQuery);
				importGroups = pythonFormatter.extractPythonImportGroups(lines, multilineStringsMap);
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
				// TODO: In the future when tree-sitter fixes this issue: https://github.com/tree-sitter/tree-sitter/issues/3141
				// Simplify the query to
				// (lexical_declaration(variable_declarator([(string) (template_string) (binary_expression(string))]))) @stringAssignment
				// (lexical_declaration(variable_declarator((call_expression[(template_string) (binary_expression(string))])))) @stringCallAssignment

				const javascriptQuery = `
				(lexical_declaration(variable_declarator(string))) @string
				(lexical_declaration(variable_declarator([(template_string) (binary_expression(string))]))) @stringAssignment
				(lexical_declaration(variable_declarator((call_expression[(template_string) (binary_expression(string))])))) @stringCallAssignment
				`;
				multilineStringsMap = createMultilineStringMap(parser, tree, javascriptQuery);
				importGroups = javascriptFormatter.extractJavascriptImportGroups(lines, multilineStringsMap);
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
				const javaQuery = `
				(local_variable_declaration(variable_declarator(string_literal (multiline_string_fragment)))) @multilineString
				(local_variable_declaration(variable_declarator(binary_expression(string_literal (multiline_string_fragment))))) @multilineString
				`;
				multilineStringsMap = createMultilineStringMap(parser, tree, javaQuery);
				importGroups = javaFormatter.extractJavaImportGroups(lines, multilineStringsMap);
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

		vscode.workspace.applyEdit(edit).then(() => {
			document.save();
		});
	}
}

function deactivate() {}

module.exports = {
	activate,
	deactivate,
};
