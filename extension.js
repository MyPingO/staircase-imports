const vscode = require("vscode");
const { ImportFormatter } = require("./src/formatter");

const CONFIGURATION = "Staircase Import Formatter";

/** @param {vscode.ExtensionContext} context */
function activate(context) {
	const formatter = new ImportFormatter();
	const output = vscode.window.createOutputChannel("Staircase Imports");

	/**
	 * Capture source and settings before awaiting a grammar load. Reject edits if
	 * the document changes while the formatter is working.
	 * @param {vscode.TextDocument} document
	 * @param {vscode.CancellationToken} [token]
	 * @returns {Promise<vscode.TextEdit[]>}
	 */
	async function getEdits(document, token) {
		if (!ImportFormatter.supports(document.languageId) || document.isClosed) return [];
		const config = vscode.workspace.getConfiguration(CONFIGURATION, document);
		if (config.get("enabled", "enabled") !== "enabled" || token?.isCancellationRequested) return [];
		const order = config.get("order") === "descending" ? "descending" : "ascending";
		const version = document.version;
		const source = document.getText();
		try {
			const edits = await formatter.getEdits(source, document.languageId, order);
			if (document.isClosed || document.version !== version || token?.isCancellationRequested) return [];
			return edits.map((edit) =>
				vscode.TextEdit.replace(
					new vscode.Range(document.positionAt(edit.start), document.positionAt(edit.end)),
					edit.newText,
				),
			);
		} catch (error) {
			output.appendLine(`Unable to format ${document.uri.toString()}: ${String(error)}`);
			return [];
		}
	}

	context.subscriptions.push(
		formatter,
		output,
		vscode.workspace.onWillSaveTextDocument((event) => {
			// VS Code applies these edits during this save. waitUntil must be called
			// synchronously during event dispatch; no second save is necessary.
			if (ImportFormatter.supports(event.document.languageId)) event.waitUntil(getEdits(event.document));
		}),
		vscode.commands.registerCommand("staircaseImports.format", async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) return;
			const edits = await getEdits(editor.document);
			if (!edits.length) return;
			await editor.edit((builder) => {
				for (const edit of edits) builder.replace(edit.range, edit.newText);
			});
		}),
	);
}

module.exports = { activate };
