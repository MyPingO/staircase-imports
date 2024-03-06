const assert = require("assert");

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
const vscode = require("vscode");
// const myExtension = require('../extension');

async function createOrClearFile(filePath) {
	try {
		await vscode.workspace.fs.writeFile(filePath, Buffer.from("")); // Create or overwrite
		console.log("File is ready (created or already existed).");
	} catch (err) {
		console.error("Error handling file:", err);
	}
}

suite("Extension Test Suite", () => {
	vscode.window.showInformationMessage("Start all Java tests.");
	test("Imports Test", async () => {
		const filePath = vscode.Uri.file(__dirname + "/test.java");
		await createOrClearFile(filePath);

		const document = await vscode.workspace.openTextDocument(filePath);
		const editor = await vscode.window.showTextDocument(document);

		// Java content for testing
		const content = `
        import java.util.Map;
        import java.util.ArrayList;
        import java.util.List;
        `;

		await editor.edit((editBuilder) => {
			editBuilder.replace(new vscode.Range(0, 0, document.lineCount, 0), content);
		});

		await document.save();
		// give time to update the document
		await new Promise((resolve) => setTimeout(resolve, 100));

		const expectedContent = `
        import java.util.Map;
        import java.util.List;
        import java.util.ArrayList;
        `;

		const documentContent = document.getText().replace(/\r/g, "");

		assert.strictEqual(documentContent, expectedContent);

		await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
	});
	test("Imports Test with Leading Comments", async () => {
		const filePath = vscode.Uri.file(__dirname + "/test.java");
		await createOrClearFile(filePath);

		const document = await vscode.workspace.openTextDocument(filePath);
		const editor = await vscode.window.showTextDocument(document);

		// Java content with comments
		const content = `
        // I am a part of T
        import java.util.Map;
        // I am a part of test
        import java.util.ArrayList;
        // I am a part of TEST
        import java.util.List;
        `;

		await editor.edit((editBuilder) => {
			editBuilder.replace(new vscode.Range(0, 0, document.lineCount, 0), content);
		});

		await document.save();
		// give time to update the document
		await new Promise((resolve) => setTimeout(resolve, 100));

		const expectedContent = `
        // I am a part of T
        import java.util.Map;
        // I am a part of TEST
        import java.util.List;
        // I am a part of test
        import java.util.ArrayList;
        `;

		const documentContent = document.getText().replace(/\r/g, "");

		assert.strictEqual(documentContent, expectedContent);

		await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
	});
	test("Imports Test with Leading Comments and Empty Lines", async () => {
		const filePath = vscode.Uri.file(__dirname + "/test.java");
		await createOrClearFile(filePath);

		const document = await vscode.workspace.openTextDocument(filePath);
		const editor = await vscode.window.showTextDocument(document);

		// Java content with comments
		const content = `
        // I am a part of test
        import java.util.ArrayList;

        // I am a part of TEST
        import java.util.List;

        // I am a part of T
        import java.util.Map;
        `;

		await editor.edit((editBuilder) => {
			editBuilder.replace(new vscode.Range(0, 0, document.lineCount, 0), content);
		});

		await document.save();
		// give time to update the document
		await new Promise((resolve) => setTimeout(resolve, 100));

		const expectedContent = `
        // I am a part of test
        import java.util.ArrayList;

        // I am a part of TEST
        import java.util.List;

        // I am a part of T
        import java.util.Map;
        `;

		const documentContent = document.getText().replace(/\r/g, "");

		assert.strictEqual(documentContent, expectedContent);

		await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
	});
	test("Imports With Multiline Comments Test", async () => {
		const filePath = vscode.Uri.file(__dirname + "/test.java");
		await createOrClearFile(filePath);

		const document = await vscode.workspace.openTextDocument(filePath);
		const editor = await vscode.window.showTextDocument(document);

		// Java content with comments
		const content = `
        /*
        I am a part of TEST
        */
        import java.util.List;
        /*
        I am a part of T
        */
        import java.util.Map;
        /*
        I am a part of test
        */
        import java.util.ArrayList;
        `;

		await editor.edit((editBuilder) => {
			editBuilder.replace(new vscode.Range(0, 0, document.lineCount, 0), content);
		});

		await document.save();
		// give time to update the document
		await new Promise((resolve) => setTimeout(resolve, 100));

		const expectedContent = `
        /*
        I am a part of T
        */
        import java.util.Map;
        /*
        I am a part of TEST
        */
        import java.util.List;
        /*
        I am a part of test
        */
        import java.util.ArrayList;
        `;

		const documentContent = document.getText().replace(/\r/g, "");

		assert.strictEqual(documentContent, expectedContent);

		await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
	});

	test("Imports Inside of Multiline String Test", async () => {
		const filePath = vscode.Uri.file(__dirname + "/test.java");
		await createOrClearFile(filePath);

		const document = await vscode.workspace.openTextDocument(filePath);
		const editor = await vscode.window.showTextDocument(document);

		// Java content with comments
		const content = `
        String test = """
        import java.util.List;
        import java.util.Map;
        import java.util.ArrayList;
        """;
        `;

		await editor.edit((editBuilder) => {
			editBuilder.replace(new vscode.Range(0, 0, document.lineCount, 0), content);
		});

		// Save the document
		await document.save();
		// give time to update the document
		await new Promise((resolve) => setTimeout(resolve, 100));

		const expectedContent = `
        String test = """
        import java.util.List;
        import java.util.Map;
        import java.util.ArrayList;
        """;
        `;

		const documentContent = document.getText().replace(/\r/g, "");

		assert.strictEqual(documentContent, expectedContent);

		await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
	});
});
