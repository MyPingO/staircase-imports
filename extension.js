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
                event.waitUntil(
                    formatOnSave(event, context, parser)
                        .then(() => {
                            vscode.window.showInformationMessage("Staircase Import Formatter: Imports formatted successfully!");
                        })
                        .catch((error) => {
                            vscode.window.showErrorMessage(`Staircase Import Formatter: Error formatting imports: ${error}`);
                        })
                );
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

function getCapturesFromQuery(parser, tree, queryString) {
    const query = parser.getLanguage().query(queryString);
    const allCaptures = query.captures(tree.rootNode);
    const captures = [];

    let lastMultilineImportStartPos = { row: -1, col: -1 };
    let lastMultilineImportEndPos = { row: -1, col: -1 };

    allCaptures.forEach((capture) => {
        const name = capture.name;
        const node = capture.node;
        const startPosition = node.startPosition;
        const endPosition = node.endPosition;

        if (name === "import" && startPosition.row != endPosition.row) {
            lastMultilineImportStartPos = startPosition;
            lastMultilineImportEndPos = endPosition;
        }
        else if (name === "comment") {
            // Skip comments inside multiline imports because we handle them separately later
            if (
                (
                    startPosition.row > lastMultilineImportStartPos.row ||
                    (
                        startPosition.row === lastMultilineImportStartPos.row &&
                        startPosition.column > lastMultilineImportStartPos.column
                    )
                ) &&
                (
                    startPosition.row < lastMultilineImportEndPos.row ||
                    (
                        startPosition.row === lastMultilineImportEndPos.row &&
                        startPosition.column < lastMultilineImportEndPos.column
                    )
                )
            ) {
                return;
            }
        }
        captures.push(capture);
    });
    return captures;
}


async function formatOnSave(event, context, parser) {
    const document = event.document;
    const languageId = document.languageId;
    const uri = document.uri;
    if (languageId in SUPPORTED_LANGUAGES) {
        const edit = new vscode.WorkspaceEdit();
        let importGroups;
        let captures;
        const documentText = document.getText();
        const lines = documentText.split(/\r?\n/); // \r? for windows compatibility

        // tree sitter parsing for multiline strings
        const tree = await createParserTree(context, languageId, parser, documentText);
        switch (languageId) {
            case "python":
                const pythonQuery = `
				(expression_statement([(string) (binary_operator(string))])) @string
				(expression_statement(assignment([(string) (binary_operator(string))]))) @string
				`;
                captures = getCapturesFromQuery(parser, tree, pythonQuery);
                importGroups = pythonFormatter.extractPythonImportGroups(lines, captures);
                for (let i = 0; i < importGroups.length; i++) {
                    const importGroup = importGroups[i];
                    if (importGroup.imports.length > 1) {
                        if (importGroup.type === "singleline") {
                            pythonFormatter.replaceSinglelineImportGroup(edit, importGroup, document);
                        } else if (importGroup.type === "multiline") {
                            pythonFormatter.replaceMultilineImportGroup(edit, importGroup, document);
                        }
                    }
                }
                break;
            case "typescriptreact":
            case "typescript":
            case "javascriptreact":
            case "javascript":
                try {
                    const javascriptQuery = `
						(comment) @comment
						(import_statement) @import
						`;
                    captures = getCapturesFromQuery(parser, tree, javascriptQuery);
                    importGroups = javascriptFormatter.extractJavascriptImportGroups(captures);

                    for (let i = 0; i < importGroups.length; i++) {
                        const importGroup = importGroups[i];
                        if (importGroup.type === "singleline") {
                            javascriptFormatter.replaceSinglelineImportGroup(edit, importGroup.imports, document);
                        }
                        else if (importGroup.type === "multiline") {
                            javascriptFormatter.replaceMultilineImportGroup(edit, importGroup.importObject, document);
                        }
                    }
                }
                catch (error) {
                    console.error(error);
                }
                break;
            case "java":
                const javaQuery = `
				(import_declaration) @import
				(block_comment) @comment
				(line_comment) @comment
				`;
                // captures = getCapturesFromQuery(parser, tree, javaQuery);
                // importGroups = javaFormatter.extractJavaImportGroups(lines, multilineStringsMap);
                // for (let i = 0; i < importGroups.length; i++) {
                //     const imports = importGroups[i];
                //     if (imports.length > 1) {
                //         javaFormatter.replaceSinglelineImportGroup(edit, imports, uri);
                //     }
                // }
                break;
            default:
                break;
        }
        return vscode.workspace.applyEdit(edit);
    }
}

function deactivate() { }

module.exports = {
    activate,
    deactivate,
};
