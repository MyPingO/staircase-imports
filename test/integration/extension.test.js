const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const vscode = require("vscode");

const config = vscode.workspace.getConfiguration("Staircase Import Formatter");
let directory;
let sequence = 0;
let originalEnabled;
let originalOrder;

async function createDocument(extension, content) {
	const eol = content.includes("\r\n") ? "\r\n" : "\n";
	const uri = vscode.Uri.file(path.join(directory, `fixture-${sequence++}.${extension}`));
	await fs.writeFile(uri.fsPath, `fixture${eol}`);
	const document = await vscode.workspace.openTextDocument(uri);
	const edit = new vscode.WorkspaceEdit();
	edit.replace(
		uri,
		new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)),
		content,
	);
	assert.ok(await vscode.workspace.applyEdit(edit));
	return document;
}

async function saveAndAssert(document, expected) {
	let saves = 0;
	const listener = vscode.workspace.onDidSaveTextDocument((saved) => {
		if (saved.uri.toString() === document.uri.toString()) saves++;
	});
	try {
		assert.ok(await document.save(), "save must succeed");
		assert.equal(document.getText(), expected);
		assert.equal(
			await fs.readFile(document.uri.fsPath, "utf8"),
			expected,
			"the first save must write formatted text",
		);
		assert.equal(document.isDirty, false);
		assert.equal(saves, 1, "formatting must not trigger recursive saves");
	} finally {
		listener.dispose();
	}
}

suite("Staircase Imports in VS Code", () => {
	suiteSetup(async () => {
		const extension = vscode.extensions.getExtension("MyPing0.staircase-import-formatter");
		assert.ok(extension, "the extension must be installed in the test host");
		await extension.activate();
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "staircase-imports-"));
		originalEnabled = config.inspect("enabled").globalValue;
		originalOrder = config.inspect("order").globalValue;
	});

	setup(async () => {
		await config.update("enabled", "enabled", vscode.ConfigurationTarget.Global);
		await config.update("order", "ascending", vscode.ConfigurationTarget.Global);
	});

	teardown(async () => {
		await vscode.commands.executeCommand("workbench.action.closeAllEditors");
	});

	suiteTeardown(async () => {
		await config.update("enabled", originalEnabled, vscode.ConfigurationTarget.Global);
		await config.update("order", originalOrder, vscode.ConfigurationTarget.Global);
		if (directory) await fs.rm(directory, { recursive: true, force: true });
	});

	test("formats every supported language on the first save", async () => {
		const examples = [
			["py", "python", "import longest\nimport a\n", "import a\nimport longest\n"],
			[
				"js",
				"javascript",
				'import Long from "long";\nimport A from "a";\n',
				'import A from "a";\nimport Long from "long";\n',
			],
			[
				"ts",
				"typescript",
				'import type { LongType } from "types";\nimport A from "a";\n',
				'import A from "a";\nimport type { LongType } from "types";\n',
			],
			["java", "java", "import longpackage.C;\nimport a.B;\n", "import a.B;\nimport longpackage.C;\n"],
			[
				"jsx",
				"javascriptreact",
				'import Long from "long";\nimport A from "a";\nconst x = <A/>;\n',
				'import A from "a";\nimport Long from "long";\nconst x = <A/>;\n',
			],
			[
				"tsx",
				"typescriptreact",
				'import Long from "long";\nimport A from "a";\nconst x = <A/>;\n',
				'import A from "a";\nimport Long from "long";\nconst x = <A/>;\n',
			],
		];
		for (const [extension, language, input, expected] of examples) {
			const document = await createDocument(extension, input);
			assert.equal(document.languageId, language);
			await saveAndAssert(document, expected);
		}
	});

	test("saves a background document while a different editor is active", async () => {
		const background = await createDocument("py", "import longest\nimport a\n");
		const foreground = await createDocument("txt", "foreground\n");
		await vscode.window.showTextDocument(foreground);
		await saveAndAssert(background, "import a\nimport longest\n");
		assert.equal(foreground.getText(), "foreground\n");
		await foreground.save();
	});

	test("handles concurrent saves and then returns to a previously loaded language", async () => {
		const python = await createDocument("py", "import longest\nimport a\n");
		const javascript = await createDocument("js", 'import Long from "long";\nimport A from "a";\n');
		await Promise.all([
			saveAndAssert(python, "import a\nimport longest\n"),
			saveAndAssert(javascript, 'import A from "a";\nimport Long from "long";\n'),
		]);
		await saveAndAssert(await createDocument("py", "import longer\nimport z\n"), "import z\nimport longer\n");
	});

	test("reads a changed sort order without reloading the extension", async () => {
		await config.update("order", "descending", vscode.ConfigurationTarget.Global);
		await saveAndAssert(await createDocument("py", "import a\nimport longest\n"), "import longest\nimport a\n");
	});

	test("disabled formatting leaves saved files untouched", async () => {
		await config.update("enabled", "disabled", vscode.ConfigurationTarget.Global);
		const input = "import longest\nimport a\n";
		const document = await createDocument("py", input);
		await saveAndAssert(document, input);
		await vscode.window.showTextDocument(document);
		await vscode.commands.executeCommand("staircaseImports.format");
		assert.equal(document.getText(), input);
	});

	test("the explicit formatting command is undoable and does not save the document", async () => {
		const input = "import longest\nimport a\n";
		const document = await createDocument("py", input);
		await vscode.window.showTextDocument(document);
		try {
			await vscode.commands.executeCommand("staircaseImports.format");
			assert.equal(document.getText(), "import a\nimport longest\n");
			assert.equal(document.isDirty, true);
			assert.equal(await fs.readFile(document.uri.fsPath, "utf8"), "fixture\n");
			// The UI command can finish before its document-change notification
			// reaches the extension host. Observe that event instead of sleeping.
			await vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup");
			let listener;
			let timeout;
			try {
				await new Promise((resolve, reject) => {
					listener = vscode.workspace.onDidChangeTextDocument((event) => {
						if (event.document === document && document.getText() === input) resolve();
					});
					timeout = setTimeout(() => reject(new Error("Undo did not restore the original imports")), 5000);
					vscode.commands.executeCommand("undo").then(undefined, reject);
				});
			} finally {
				listener?.dispose();
				clearTimeout(timeout);
			}
			assert.equal(document.getText(), input);
		} finally {
			await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
		}
	});

	test("the command also works on an unsaved document", async () => {
		const document = await vscode.workspace.openTextDocument({
			language: "python",
			content: "import longest\nimport a\n",
		});
		await vscode.window.showTextDocument(document);
		try {
			await vscode.commands.executeCommand("staircaseImports.format");
			assert.equal(document.getText(), "import a\nimport longest\n");
			assert.equal(document.isUntitled, true);
		} finally {
			await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
		}
	});

	test("preserves CRLF on disk", async () => {
		await saveAndAssert(
			await createDocument("py", "import longest\r\nimport a\r\n"),
			"import a\r\nimport longest\r\n",
		);
	});

	test("leaves unsupported documents untouched", async () => {
		const input = "import longest\nimport a\n";
		await saveAndAssert(await createDocument("txt", input), input);
	});

	test("formats unusual layouts on the first save without changing Python suite boundaries", async () => {
		const examples = [
			[
				"py",
				"if ready: import longest, a; import bb; run()\n",
				"if ready: import a; import bb; import longest; run()\n",
			],
			["py", "from pkg import longest, \\\n a\n", "from pkg import (\n a,\n longest,\n)\n"],
			["js", 'import { longest,\n  a } from "x";\n', 'import {\n  a,\n  longest,\n} from "x";\n'],
			["java", "import java\n .util.ArrayList; import a.B;\n", "import a.B;\nimport java.util.ArrayList;\n"],
			[
				"ts",
				"namespace N { import LongAlias = X.Y.Z; import A = X.Y; }\n",
				"namespace N { import A = X.Y;\nimport LongAlias = X.Y.Z; }\n",
			],
			[
				"tsx",
				'import type {Longest as Alias, A} from "x";\nconst x = <A/>;\n',
				'import type {\n    A,\n    Longest as Alias,\n} from "x";\nconst x = <A/>;\n',
			],
		];
		for (const [extension, input, expected] of examples)
			await saveAndAssert(await createDocument(extension, input), expected);
	});

	test("saving incomplete import syntax still succeeds without edits", async () => {
		const source = 'import {longest, a from "x";\n';
		await saveAndAssert(await createDocument("js", source), source);
	});
});
