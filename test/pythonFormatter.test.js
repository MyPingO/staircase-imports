const assert = require("assert");
const vscode = require("vscode");
// The following simulates testing a Python file within a JavaScript testing environment.

async function createOrVerifyFile(filePath) {
	try {
		await vscode.workspace.fs.writeFile(filePath, Buffer.from("")); // Create or overwrite
		console.log("File is ready (created or already existed).");
	} catch (err) {
		console.error("Error handling file:", err);
	}
}

suite("Extension Test Suite", () => {
	vscode.window.showInformationMessage("Start all Python tests.");

	test("Basic Python Imports Test", async () => {
		const filePath = vscode.Uri.file(__dirname + "/test.py");
		await createOrVerifyFile(filePath);

		const document = await vscode.workspace.openTextDocument(filePath);
		const editor = await vscode.window.showTextDocument(document);

		// Python content for testing
		const content = `
        from test import test
        from TEST import TEST
        from Tt import T
        `;

		await editor.edit((editBuilder) => {
			editBuilder.replace(new vscode.Range(0, 0, document.lineCount, 0), content);
		});

		await document.save();
		// give time to update the document
		await new Promise((resolve) => setTimeout(resolve, 100));

		const expectedContent = `
        from Tt import T
        from test import test
        from TEST import TEST
        `;

		const documentContent = document.getText().replace(/\r/g, "");

		assert.strictEqual(documentContent, expectedContent);

		await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
	});

	test("Basic Imports Test with Leading Comments", async () => {
		const filePath = vscode.Uri.file(__dirname + "/test.py");
		await createOrVerifyFile(filePath);

		const document = await vscode.workspace.openTextDocument(filePath);
		const editor = await vscode.window.showTextDocument(document);

		// Python content with comments
		const content = `
        # I am a part of test
        from test import test
        # I am a part of TEST
        from TEST import TEST
        # I am a part of T
        from Tt import T
        `;

		await editor.edit((editBuilder) => {
			editBuilder.replace(new vscode.Range(0, 0, document.lineCount, 0), content);
		});

		await document.save();
		// give time to update the document
		await new Promise((resolve) => setTimeout(resolve, 100));

		const expectedContent = `
        # I am a part of T
        from Tt import T
        # I am a part of test
        from test import test
        # I am a part of TEST
        from TEST import TEST
        `;

		const documentContent = document.getText().replace(/\r/g, "");

		assert.strictEqual(documentContent, expectedContent);

		await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
	});

	test("Multiline Python Imports Test", async () => {
		const filePath = vscode.Uri.file(__dirname + "/test.py");
		await createOrVerifyFile(filePath);

		const document = await vscode.workspace.openTextDocument(filePath);
		const editor = await vscode.window.showTextDocument(document);

		// Multiline Python imports
		const content = `
        from TEST import (
            TEST,
            T, #lol
            test,
        )
        `;

		await editor.edit((editBuilder) => {
			editBuilder.replace(new vscode.Range(0, 0, document.lineCount, 0), content);
		});

		await document.save();
		// give time to update the document
		await new Promise((resolve) => setTimeout(resolve, 100));

		const expectedContent = `
        from TEST import (
            TEST,
            test,
            T, #lol
        )
        `;

		const documentContent = document.getText().replace(/\r/g, "");

		assert.strictEqual(documentContent, expectedContent);

		await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
	});

	test("Python Multiline Imports Test with Leading Comments", async () => {
		const filePath = vscode.Uri.file(__dirname + "/test.py");
		await createOrVerifyFile(filePath);

		const document = await vscode.workspace.openTextDocument(filePath);
		const editor = await vscode.window.showTextDocument(document);

		// Python multiline imports with comments
		const content = `
        # This is a comment
        from TEST import (
            # I am part of TEST
            TEST,
            # I am part of T
            T, #}
            # I am part of test
            test
        )
        `;

		await editor.edit((editBuilder) => {
			editBuilder.replace(new vscode.Range(0, 0, document.lineCount, 0), content);
		});

		await document.save();
		// give time to update the document
		await new Promise((resolve) => setTimeout(resolve, 100));

		const expectedContent = `
        # This is a comment
        from TEST import (
            # I am part of TEST
            TEST,
            # I am part of T
            T, #}
            # I am part of test
            test,
        )
        `;

		const documentContent = document.getText().replace(/\r/g, "");

		assert.strictEqual(documentContent, expectedContent);

		await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
	});

	test("Python Multiline Imports Test with Trailing Comments", async () => {
		const filePath = vscode.Uri.file(__dirname + "/test.py");
		await createOrVerifyFile(filePath);

		const document = await vscode.workspace.openTextDocument(filePath);
		const editor = await vscode.window.showTextDocument(document);

		// Python multiline imports with comments
		const content = `
        import T # This is a comment
        import TEST as T # This is a comment
        from test import test # This is a comment

        from TEST import (
            TEST, # This is a comment
            T, # This is a comment
            test # This is a comment
        )
        `;

		await editor.edit((editBuilder) => {
			editBuilder.replace(new vscode.Range(0, 0, document.lineCount, 0), content);
		});

		await document.save();
		// give time to update the document
		await new Promise((resolve) => setTimeout(resolve, 100));

		const expectedContent = `
        import T # This is a comment
        import TEST as T # This is a comment
        from test import test # This is a comment

        from TEST import (
            T, # This is a comment
            TEST, # This is a comment
            test, # This is a comment
        )
        `;

		const documentContent = document.getText().replace(/\r/g, "");

		assert.strictEqual(documentContent, expectedContent);

		await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
	});

	test("Python Imports in Strings Test", async () => {
		const filePath = vscode.Uri.file(__dirname + "/test.py");
		await createOrVerifyFile(filePath);

		const document = await vscode.workspace.openTextDocument(filePath);
		const editor = await vscode.window.showTextDocument(document);

		// Python imports in strings
		const content = `
		test = \"\"\"
		from test import test
		import TEST as T
		#LOL
		import t as t
		from Tt import T\"\"\"
		import test as test
		from test import test
		import test
		test = \"\"\"
		import {
			test,
			TEST,
			Tt
		} from test\"\"\"
		# test
		import test
		import T
		`;

		await editor.edit((editBuilder) => {
			editBuilder.replace(new vscode.Range(0, 0, document.lineCount, 0), content);
		});

		await document.save();
		// give time to update the document
		await new Promise((resolve) => setTimeout(resolve, 100));

		const expectedContent = `
		test = \"\"\"
		from test import test
		import TEST as T
		#LOL
		import t as t
		from Tt import T\"\"\"
		import test
		import test as test
		from test import test
		test = \"\"\"
		import {
			test,
			TEST,
			Tt
		} from test\"\"\"
		import T
		# test
		import test
		`;

		const documentContent = document.getText().replace(/\r/g, "");

		assert.strictEqual(documentContent, expectedContent);

		await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
	});
});
