const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function host(format) {
	let listener;
	const logs = [];
	const subscriptions = [];
	const document = {
		languageId: "python",
		uri: { toString: () => "test.py" },
		isClosed: false,
		version: 1,
		getText: () => "import longest\nimport a",
		positionAt: (offset) => offset,
	};
	const settings = { enabled: "enabled", order: "ascending" };
	const vscode = {
		workspace: {
			getConfiguration: (section, scope) => {
				assert.equal(section, "Staircase Import Formatter");
				assert.equal(scope, document, "settings must be scoped to the document being formatted");
				return { get: (key) => settings[key] };
			},
			onWillSaveTextDocument: (handler) => {
				listener = handler;
				return { dispose() {} };
			},
		},
		window: { createOutputChannel: () => ({ appendLine: (message) => logs.push(message), dispose() {} }) },
		commands: { registerCommand: () => ({ dispose() {} }) },
		Range: class {
			constructor(start, end) {
				this.start = start;
				this.end = end;
			}
		},
		TextEdit: { replace: (range, newText) => ({ range, newText }) },
	};
	class FakeFormatter {
		static supports(language) {
			return language === "python";
		}
		getEdits(...args) {
			return format(...args);
		}
		dispose() {}
	}
	const module = { exports: {} };
	vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../../extension.js"), "utf8"), {
		module,
		require: (name) => {
			if (name === "vscode") return vscode;
			if (name === "./src/formatter") return { ImportFormatter: FakeFormatter };
			throw new Error(`Unexpected require: ${name}`);
		},
	});
	module.exports.activate({ subscriptions });
	return {
		document,
		settings,
		logs,
		save() {
			let dispatching = true;
			let pending;
			listener({
				document,
				waitUntil(promise) {
					assert.ok(dispatching, "waitUntil must be called synchronously");
					pending = promise;
				},
			});
			dispatching = false;
			return pending;
		},
	};
}

test("registers synchronous save participation and uses document-scoped settings", async () => {
	const instance = host(async (source, language, order) => {
		assert.equal(source, "import longest\nimport a");
		assert.equal(language, "python");
		assert.equal(order, "descending");
		return [{ start: 0, end: source.length, newText: "formatted" }];
	});
	instance.settings.order = "descending";
	const edits = await instance.save();
	assert.equal(edits.length, 1);
	assert.equal(edits[0].newText, "formatted");
});

for (const change of ["version", "isClosed"]) {
	test(`ignores asynchronous edits when the document changes: ${change}`, async () => {
		let resolve;
		const instance = host(
			() =>
				new Promise((done) => {
					resolve = done;
				}),
		);
		const pending = instance.save();
		instance.document[change] = change === "version" ? 2 : true;
		resolve([{ start: 0, end: 1, newText: "wrong" }]);
		assert.equal((await pending).length, 0);
	});
}

test("format failures are logged and do not prevent saving", async () => {
	const instance = host(async () => {
		throw new Error("missing grammar");
	});
	assert.equal((await instance.save()).length, 0);
	assert.match(instance.logs[0], /test.py.*missing grammar/);
});

test("disabled formatting does not load a parser", async () => {
	const instance = host(() => assert.fail("formatter must not be called"));
	instance.settings.enabled = "disabled";
	assert.equal((await instance.save()).length, 0);
});

test("unsupported saves do not participate in the save event", () => {
	const instance = host(() => assert.fail("formatter must not be called"));
	instance.document.languageId = "plaintext";
	assert.equal(instance.save(), undefined);
});
