const assert = require("node:assert/strict");
const path = require("node:path");
const { test, after } = require("node:test");
const { ImportFormatter } = require("../../src/formatter");
const legacy = require("../fixtures/legacy.json");

const formatter = new ImportFormatter();
after(() => formatter.dispose());

async function format(input, language, order = "ascending", instance = formatter) {
	const edits = await instance.getEdits(input, language, order);
	for (let index = 0; index < edits.length; index++) {
		assert.ok(edits[index].start >= 0 && edits[index].end <= input.length);
		assert.ok(edits[index].start < edits[index].end);
		if (index) assert.ok(edits[index - 1].end <= edits[index].start, "edits must not overlap");
	}
	return edits.reduceRight((text, edit) => text.slice(0, edit.start) + edit.newText + text.slice(edit.end), input);
}

async function check(language, input, expected, order = "ascending") {
	const actual = await format(input, language, order);
	assert.equal(actual, expected);
	assert.deepEqual(await formatter.getEdits(actual, language, order), [], "formatting must be idempotent");
}

for (const fixture of legacy) {
	test(`original examples: ${fixture.language}: ${fixture.name}`, async () => {
		await check(fixture.language, fixture.input, fixture.expected);
	});
}

test("all supported language IDs, including JSX and TSX", () => {
	for (const language of ["python", "javascript", "javascriptreact", "typescript", "typescriptreact", "java"]) {
		assert.ok(ImportFormatter.supports(language));
	}
	for (const language of ["plaintext", "rust", "toString", "__proto__"]) {
		assert.ok(!ImportFormatter.supports(language));
	}
});

test("ascending and descending orders retain the order of equal lengths", async () => {
	const lines = ["import longest_name", "import aa", "import bb", "import x"];
	await check("python", lines.join("\n"), [lines[3], lines[1], lines[2], lines[0]].join("\n"));
	await check("python", lines.join("\n"), [lines[0], lines[1], lines[2], lines[3]].join("\n"), "descending");
});

test("blank lines and code delimit independent import groups", async () => {
	await check(
		"python",
		"import longest\nimport z\n\nimport bbbb\nimport a\nrun()\nimport longer\nimport q\n",
		"import z\nimport longest\n\nimport a\nimport bbbb\nrun()\nimport q\nimport longer\n",
	);
});

test("nested Python imports stay in their original suites", async () => {
	await check(
		"python",
		"def run():\n    import longest\n    import a\n    if enabled:\n        import longer\n        import b\n    else:\n        import cc\n        import d\n    import untouched\n",
		"def run():\n    import a\n    import longest\n    if enabled:\n        import b\n        import longer\n    else:\n        import d\n        import cc\n    import untouched\n",
	);
});

test("Python future imports stay above ordinary imports", async () => {
	await check(
		"python",
		"from __future__ import annotations\nfrom __future__ import division\nimport longest\nimport x\n",
		"from __future__ import division\nfrom __future__ import annotations\nimport x\nimport longest\n",
	);
});

test("Java static imports remain separate from ordinary imports", async () => {
	await check(
		"java",
		"package example;\nimport longpackage.LongClass;\nimport a.B;\nimport static longpackage.C.FIELD;\nimport static a.B.X;\nclass Test {}\n",
		"package example;\nimport a.B;\nimport longpackage.LongClass;\nimport static a.B.X;\nimport static longpackage.C.FIELD;\nclass Test {}\n",
	);
});

for (const barrier of ['import "./setup";', 'import {} from "./setup";']) {
	test(`JavaScript side effect boundary: ${barrier}`, async () => {
		await check(
			"javascript",
			`import Long from "long";\nimport A from "a";\n${barrier}\nimport Longer from "longer";\nimport B from "b";\n`,
			`import A from "a";\nimport Long from "long";\n${barrier}\nimport B from "b";\nimport Longer from "longer";\n`,
		);
	});
}

test("comments follow their imports without contributing to their lengths", async () => {
	await check(
		"javascript",
		'/* header */\n\n// Long\nimport Long from "long"; // inline\n/* A longer description\n   for a shorter import. */\nimport A from "a";\n// footer\nrun();\n',
		'/* header */\n\n/* A longer description\n   for a shorter import. */\nimport A from "a";\n// Long\nimport Long from "long"; // inline\n// footer\nrun();\n',
	);
});

test("shebangs, encoding cookies and file directives stay in place", async () => {
	await check(
		"python",
		"#!/usr/bin/env python\n# coding: utf-8\nimport longest\nimport x\n",
		"#!/usr/bin/env python\n# coding: utf-8\nimport x\nimport longest\n",
	);
	await check(
		"typescript",
		'// @ts-check\nimport Long from "long";\nimport A from "a";\n',
		'// @ts-check\nimport A from "a";\nimport Long from "long";\n',
	);
});

test("UTF-16 offsets preserve emoji, Unicode text and a byte-order mark", async () => {
	await check(
		"javascript",
		'\uFEFF// 🪜\n\nimport Long from "café🪜";\nimport A from "é";\nconst text = "🪜";\n',
		'\uFEFF// 🪜\n\nimport A from "é";\nimport Long from "café🪜";\nconst text = "🪜";\n',
	);
});

for (const eol of ["\n", "\r\n"]) {
	for (const finalNewline of ["", eol]) {
		test(`preserves ${JSON.stringify(eol)} and final newline ${!!finalNewline}`, async () => {
			await check(
				"python",
				`import longest${eol}import a${finalNewline}`,
				`import a${eol}import longest${finalNewline}`,
			);
		});
	}
}

test("multiline imports accept opening braces on their own line", async () => {
	await check(
		"javascript",
		'import\n{\n  longest,\n  a\n} from "x";\n',
		'import\n{\n  a,\n  longest,\n} from "x";\n',
	);
});

test("multiline Python imports accept a closing parenthesis on the last member's line", async () => {
	await check("python", "from x import (\n  longest,\n  a ) # end\n", "from x import (\n  a,\n  longest, ) # end\n");
});

test("multiline JavaScript imports accept a closing brace on the last member's line", async () => {
	await check("javascript", 'import {\n  longest,\n  a} from "x";\n', 'import {\n  a,\n  longest,} from "x";\n');
});

test("multiline member comments and trailing comments retain their associations", async () => {
	await check(
		"typescript",
		'import type { // header\n  // Long\n  LongName as Alias, // long\n  // A\n  A // short\n  // footer\n} from "types";\n',
		'import type { // header\n  // A\n  A, // short\n  // Long\n  LongName as Alias, // long\n  // footer\n} from "types";\n',
	);
});

test("commas are inserted before comments, without splitting quoted import names", async () => {
	await check(
		"javascript",
		'import {\n  "a//b" as LongName,\n  A /* x */\n} from "./x";\n',
		'import {\n  A, /* x */\n  "a//b" as LongName,\n} from "./x";\n',
	);
});

test("blank lines inside a member list keep separate groups", async () => {
	await check(
		"python",
		"from x import (\n  longest,\n  a,\n\n  other_longest,\n  b\n)\n",
		"from x import (\n  a,\n  longest,\n\n  b,\n  other_longest,\n)\n",
	);
});

test("TypeScript imports, JSX and TSX use their corresponding grammars", async () => {
	await check(
		"typescript",
		'import type { LongType } from "types";\nimport A = require("a");\n',
		'import A = require("a");\nimport type { LongType } from "types";\n',
	);
	for (const language of ["javascriptreact", "typescriptreact"]) {
		await check(
			language,
			'import LongName from "long";\nimport A from "a";\nconst view = <div>import untouched from "x";</div>;\n',
			'import A from "a";\nimport LongName from "long";\nconst view = <div>import untouched from "x";</div>;\n',
		);
	}
});

test("import-looking text in arbitrary strings, templates, comments and regexes is untouched", async () => {
	const javascript =
		'function run() { return `\nimport Long from "long";\nimport A from "a";\n`; }\n/*\nimport Long from "long";\nimport A from "a";\n*/\nconst pattern = /import x/;\nconst dynamic = import("./x");\n';
	await check("javascript", javascript, javascript);
	const python = 'def run():\n    return r"""\nimport longest\nimport a\n"""\n';
	await check("python", python, python);
	const java = 'class Test { String get() { return """\nimport longpackage.C;\nimport a.B;\n"""; } }\n';
	await check("java", java, java);
});

test("empty, single-member, inline and malformed imports are left intact", async () => {
	for (const source of [
		'import {\n} from "x";\n',
		'import {\n  A\n} from "x";\n',
		'import { A,\n  LongName } from "x";\n',
		'import {\n  A, LongName\n} from "x";\n',
		"import {\n  LongName,\n  A\n",
		'import Long from "long"; run();\nimport A from "a";\n',
		'import Long from "long"; import A from "a";\n',
	]) {
		await check("javascript", source, source);
	}
	for (const source of [
		"",
		"from x import (\n  A\n)\n",
		"import longest; run()\nimport a\n",
		"import a, \\\n  b\n",
	]) {
		await check("python", source, source);
	}
});

test("concurrent requests and repeatedly switching languages cannot share parser state", async () => {
	const examples = [
		["python", "import longest\nimport a", "import a\nimport longest"],
		["javascript", 'import Long from "long";\nimport A from "a";', 'import A from "a";\nimport Long from "long";'],
		["java", "import longpackage.C;\nimport a.B;", "import a.B;\nimport longpackage.C;"],
		[
			"typescriptreact",
			'import Long from "long";\nimport A from "a";\nconst x = <A/>;',
			'import A from "a";\nimport Long from "long";\nconst x = <A/>;',
		],
	];
	await Promise.all(Array.from({ length: 20 }, (_, index) => check(...examples[index % examples.length])));
});

test("unsupported documents, disposed services and disposal during a grammar load return no edits", async () => {
	assert.deepEqual(await formatter.getEdits("import longest\nimport a", "plaintext"), []);
	const disposed = new ImportFormatter();
	const pending = disposed.getEdits("import longest\nimport a", "python");
	disposed.dispose();
	assert.deepEqual(await pending, []);
	assert.deepEqual(await disposed.getEdits("import longest\nimport a", "python"), []);
});

test("failed grammar loads may be retried without a rejected promise remaining cached", async () => {
	const missing = new ImportFormatter(path.join(__dirname, "missing-grammars"));
	try {
		await assert.rejects(missing.getEdits("import a", "python"), /ENOENT/);
		assert.equal(missing.languages.size, 0);
		await assert.rejects(missing.getEdits("import a", "python"), /ENOENT/);
	} finally {
		missing.dispose();
	}
});

test("commas after inline block comments are not duplicated", async () => {
	await check(
		"javascript",
		'import {\n  LongName /* long */,\n  A\n} from "x";\n',
		'import {\n  A,\n  LongName /* long */,\n} from "x";\n',
	);
});

test("commas on separate lines leave a multiline list intact", async () => {
	const input = 'import {\n  LongName,\n  A\n  ,\n} from "x";\n';
	await check("javascript", input, input);
});

test("trailing whitespace is retained, including on the final line", async () => {
	await check("python", "import longest \t\nimport a  ", "import a  \nimport longest \t");
});
