const assert = require("assert");

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
const vscode = require("vscode");
// const myExtension = require('../extension');

async function createOrVerifyFile(filePath) {
	try {
		await vscode.workspace.fs.writeFile(filePath, Buffer.from("")); // Create or overwrite
		console.log("File is ready (created or already existed).");
	} catch (err) {
		console.error("Error handling file:", err);
	}
}

suite("Extension Test Suite", () => {
	vscode.window.showInformationMessage("Start all tests.");
	let filePath;
	let document;
	let editor;
	test("Basic Javascript Imports Test", async () => {
		// Open correct test file from test directory
		filePath = vscode.Uri.file(__dirname + "/test.js");
		// Check if the file exists, create it if it doesn't
		await createOrVerifyFile(filePath);

		document = await vscode.workspace.openTextDocument(filePath);
		editor = await vscode.window.showTextDocument(document);

		// Set content to be placed into the document
		const content = `
		import TEST from "TEST";
		import { test } from "a";
		import { T } from "Tt";
		`;

		// Replace all contents of the file with the test
		await editor.edit((editBuilder) => {
			editBuilder.replace(new vscode.Range(0, 0, document.lineCount, 0), content);
		});

		// Save the document
		await document.save();

		// Set expected content
		const expectedContent = `
		import { T } from "Tt";
		import TEST from "TEST";
		import { test } from "a";
		`;

		// Get the document's content
		const documentContent = document.getText().replace(/\r/g, ""); // replace(/\r/g, '') for windows compatibility

		// Test if the content is as expected
		assert.strictEqual(documentContent, expectedContent);

		// Close the document
		await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
	});

	test("Basic Imports Test with Leading Comments", async () => {
		// Open correct test file from test directory
		filePath = vscode.Uri.file(__dirname + "/test.js");
		// Check if the file exists, create it if it doesn't
		await createOrVerifyFile(filePath);

		document = await vscode.workspace.openTextDocument(filePath);
		editor = await vscode.window.showTextDocument(document);

		// Set content to be placed into the document
		const content = `
		// I am a part of TEST
		import TEST from "TEST";
		// I am a part of test
		import { test } from "test";
		// I am a part of T
		import { T } from "T";
		`;

		// Replace all contents of the file with the test
		await editor.edit((editBuilder) => {
			editBuilder.replace(new vscode.Range(0, 0, document.lineCount, 0), content);
		});

		// Save the document
		await document.save();

		// Set expected content
		const expectedContent = `
		// I am a part of T
		import { T } from "T";
		// I am a part of TEST
		import TEST from "TEST";
		// I am a part of test
		import { test } from "test";
		`;

		// Get the document's content
		const documentContent = document.getText().replace(/\r/g, ""); // replace(/\r/g, '') for windows compatibility

		// Test if the content is as expected
		assert.strictEqual(documentContent, expectedContent);

		// Close the document
		await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
	});

	test("Multiline Javascript Imports Test", async () => {
		// Open correct test file from test directory
		filePath = vscode.Uri.file(__dirname + "/test.js");
		// Check if the file exists, create it if it doesn't
		await createOrVerifyFile(filePath);

		document = await vscode.workspace.openTextDocument(filePath);
		editor = await vscode.window.showTextDocument(document);

		// Set content to be placed into the document
		const content = `
		import { 
			TEST,
			T, //lol
			test
		} from "TEST";
		`;

		// Replace all contents of the file with the test
		await editor.edit((editBuilder) => {
			editBuilder.replace(new vscode.Range(0, 0, document.lineCount, 0), content);
		});

		// Save the document
		await document.save();

		// Set expected content
		const expectedContent = `
		import { 
			TEST,
			test,
			T, //lol
		} from "TEST";
		`;

		// Get the document's content
		const documentContent = document.getText().replace(/\r/g, ""); // replace(/\r/g, '') for windows compatibility

		// Test if the content is as expected
		assert.strictEqual(documentContent, expectedContent);

		// Close the document
		await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
	});

	test("Javascript Multiline Imports Test with Leading Comments", async () => {
		// Open correct test file from test directory
		filePath = vscode.Uri.file(__dirname + "/test.js");
		// Check if the file exists, create it if it doesn't
		await createOrVerifyFile(filePath);

		document = await vscode.workspace.openTextDocument(filePath);
		editor = await vscode.window.showTextDocument(document);

		// Set content to be placed into the document
		const content = `
		// This is a comment
		import { 
			// I am part of TEST
			TEST,
			// I am part of T
			T, //}
			// I am part of test
			test
		} from "TEST";
		`;

		// Replace all contents of the file with the test
		await editor.edit((editBuilder) => {
			editBuilder.replace(new vscode.Range(0, 0, document.lineCount, 0), content);
		});

		// Save the document
		await document.save();

		// Set expected content
		const expectedContent = `
		// This is a comment
		import { 
			// I am part of TEST
			TEST,
			// I am part of test
			test,
			// I am part of T
			T, //}
		} from "TEST";
		`;

		// Get the document's content
		const documentContent = document.getText().replace(/\r/g, ""); // replace(/\r/g, '') for windows compatibility

		// Test if the content is as expected
		assert.strictEqual(documentContent, expectedContent);

		// Close the document
		await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
	});

	test("Javascript Imports Test with Trailing Comments", async () => {
		// Open correct test file from test directory
		filePath = vscode.Uri.file(__dirname + "/test.js");
		// Check if the file exists, create it if it doesn't
		await createOrVerifyFile(filePath);

		document = await vscode.workspace.openTextDocument(filePath);
		editor = await vscode.window.showTextDocument(document);

		// Set content to be placed into the document
		const content = `
		import Test from "Test"; // This is a comment
		import T from "T"; // This is a comment
		import test from "test"; // This is a comment

		import { 
			TEST, // This is a comment
			T, // This is a comment
			test // This is a comment
		} from "TEST";
		`;

		// Replace all contents of the file with the test
		await editor.edit((editBuilder) => {
			editBuilder.replace(new vscode.Range(0, 0, document.lineCount, 0), content);
		});

		// Save the document
		await document.save();

		// Set expected content
		const expectedContent = `
		import T from "T"; // This is a comment
		import Test from "Test"; // This is a comment
		import test from "test"; // This is a comment

		import { 
			T, // This is a comment
			TEST, // This is a comment
			test, // This is a comment
		} from "TEST";
		`;

		// Get the document's content
		const documentContent = document.getText().replace(/\r/g, ""); // replace(/\r/g, '') for windows compatibility

		// Test if the content is as expected
		assert.strictEqual(documentContent, expectedContent);

		// Close the document
		await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
	});
});
