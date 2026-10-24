const assert = require("node:assert/strict");
const { test, after } = require("node:test");
const ts = require("typescript");
const { Parser } = require("web-tree-sitter");
const { ImportFormatter } = require("../../src/formatter");
const { LANGUAGES } = require("../../src/languages");
const { fingerprint } = require("../../src/invariants");

const formatter = new ImportFormatter();
after(() => formatter.dispose());

async function rewrite(language, input, order = "ascending") {
	let edits;
	try {
		edits = await formatter.getEdits(input, language, order);
	} catch (error) {
		throw new Error(`${error.message}: ${JSON.stringify({ language, input, order })}`);
	}
	for (let index = 1; index < edits.length; index++) assert.ok(edits[index - 1].end <= edits[index].start);
	const output = edits.reduceRight(
		(text, edit) => text.slice(0, edit.start) + edit.newText + text.slice(edit.end),
		input,
	);
	let repeated;
	try {
		repeated = await formatter.getEdits(output, language, order);
	} catch (error) {
		throw new Error(`${error.message}: ${JSON.stringify({ language, input, output, order })}`);
	}
	assert.deepEqual(repeated, [], `not idempotent: ${JSON.stringify({ input, output })}`);
	if (LANGUAGES[language].family === "javascript") {
		const kind = {
			javascript: ts.ScriptKind.JS,
			typescript: ts.ScriptKind.TS,
			javascriptreact: ts.ScriptKind.JSX,
			typescriptreact: ts.ScriptKind.TSX,
		}[language];
		const document = ts.createSourceFile("fixture", output, ts.ScriptTarget.Latest, true, kind);
		assert.equal(document.parseDiagnostics.length, 0, "TypeScript's independent parser must accept the output");
	}
	return output;
}

const cases = [
	[
		"javascript",
		"same-line declarations",
		'import Long from "long"; import A from "a";\n',
		'import A from "a";\nimport Long from "long";\n',
	],
	[
		"java",
		"split qualified import",
		"package x; import java\n .util.ArrayList; import a.B; class C {}\n",
		"package x; import a.B;\nimport java.util.ArrayList; class C {}\n",
	],
	["python", "semicolon declarations", "import longest; import a\n", "import a\nimport longest\n"],
	[
		"python",
		"direct multi-imports",
		"import longest as Alias, a; import bb\n",
		"import a\nimport bb\nimport longest as Alias\n",
	],
	[
		"python",
		"inline conditional suite",
		"if ready: import longest; import a; run()\n",
		"if ready: import a; import longest; run()\n",
	],
	[
		"python",
		"inline suite trailing comment",
		"if ready: import longest; import a # suite\n",
		"if ready: import a; import longest # suite\n",
	],
	[
		"python",
		"nested inline suite",
		"def f():\n    if ready: import longest, a; import bb; run()\n",
		"def f():\n    if ready: import a; import bb; import longest; run()\n",
	],
	[
		"python",
		"from import without parentheses",
		"from pkg import longest, a\n",
		"from pkg import (\n    a,\n    longest,\n)\n",
	],
	["python", "backslash continuation", "from pkg import longest, \\\n a\n", "from pkg import (\n a,\n longest,\n)\n"],
	[
		"python",
		"relative import and split alias",
		"from \\\n ..pkg \\\n import longest \\\n as Alias, a\n",
		"from ..pkg import (\n    a,\n    longest as Alias,\n)\n",
	],
	[
		"javascript",
		"mixed member layout",
		'import { longest,\n  a } from "x";\n',
		'import {\n  a,\n  longest,\n} from "x";\n',
	],
	[
		"javascript",
		"several members per line",
		'import { longest, a, medium } from "x";\n',
		'import {\n    a,\n    medium,\n    longest,\n} from "x";\n',
	],
	[
		"javascript",
		"split alias",
		'import {longest\n as Alias, a} from "x";\n',
		'import {\n    a,\n    longest as Alias,\n} from "x";\n',
	],
	["javascript", "empty named import", 'import {\n} from "x";\n', 'import {} from "x";\n'],
	[
		"typescript",
		"internal import aliases",
		"namespace N { import LongAlias = X.Y.Z; import A = X.Y; }\n",
		"namespace N { import A = X.Y;\nimport LongAlias = X.Y.Z; }\n",
	],
	[
		"typescript",
		"external import aliases",
		'import LongAlias = require(\n "long"\n); import A = require("a");\n',
		'import A = require("a");\nimport LongAlias = require("long");\n',
	],
];

for (const [language, name, input, expected] of cases) {
	test(`arbitrary layout: ${language}: ${name}`, async () => {
		assert.equal(await rewrite(language, input), expected);
	});
}

const unusual = [
	[
		"javascript",
		'import/* header */Default, /* named */ {longest /* in */ as /*alias*/ Alias, "x/*" as x, /* lead */ a /*end*/,} from /* source */ "pkg" with {type:"json"}; // end\n',
	],
	["javascript", 'import // header\n{ // opening\n longest, // long\n a // short\n // footer\n} from "x";\n'],
	["javascript", 'import {longest // before alias\n as Alias, a} from "x";\n'],
	["python", "from pkg import (\n # first\n long_name # trailing\n , # comma comment\n # second\n a\n # end\n )\n"],
	["python", "if ready: from pkg import longest, a; import z; run()\n"],
	["python", "if ready: \\\n import longest; import a # suite\n"],
	["python", "import longest \\\n as Alias, a # modules\n"],
	["java", "import /* one */ static /* two */ java . util . Collections .*;\nimport static a.B.X;\n"],
	["java", "import java // scope\n .util.LongName; import a.B;\n"],
	["typescript", 'import type {Longest as Alias, type A, "x" as B} from "types";\n'],
	["typescriptreact", 'import {Longest as Alias, a} from "x";\nconst value = <Alias attr="import x"/>;\n'],
];

for (let index = 0; index < unusual.length; index++) {
	const [language, input] = unusual[index];
	test(`comments and scope survive unusual ${language} layout ${index}`, async () => {
		for (const order of ["ascending", "descending"]) await rewrite(language, input, order);
	});
}

test("generated whitespace layouts are valid, stable and actually formatted", async () => {
	const jsTokens = ["import", "{", "longest", "as", "Alias", ",", "a", ",", "medium", "}", "from", '"module"', ";"];
	const javaTokens = ["import", "java", ".", "util", ".", "LongName", ";", "import", "a", ".", "B", ";"];
	const pythonTokens = ["from", "..pkg", "import", "(", "longest", "as", "Alias", ",", "a", ",", "medium", ")"];
	const whitespace = [" ", "\t", "\n", "\r\n", " /* gap */ ", " // gap\n"];
	let checked = 0;
	let random = 0x51a1ca5e;
	function choice(values) {
		random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
		return values[random % values.length];
	}
	for (const language of Object.keys(LANGUAGES)) {
		const parser = new Parser();
		parser.setLanguage(await formatter.loadLanguage(LANGUAGES[language].grammar));
		try {
			for (let variant = 0; variant < 256; variant++) {
				const family = LANGUAGES[language].family;
				const atoms = family === "python" ? pythonTokens : family === "java" ? javaTokens : jsTokens;
				const input =
					atoms
						.map((atom, index) => {
							if (!index) return atom;
							const gap =
								family === "python"
									? index < 4
										? choice([" ", "\t", " \\\n "])
										: choice([" ", "\t", "\n", "\r\n", " # gap\n", " \\\n "])
									: choice(whitespace);
							return gap + atom;
						})
						.join("") + "\n";
				const tree = parser.parse(input);
				try {
					assert.ok(
						!tree.rootNode.hasError,
						`invalid generated input: ${JSON.stringify({ language, input })}`,
					);
				} finally {
					tree.delete();
				}
				for (const order of ["ascending", "descending"]) {
					const output = await rewrite(language, input, order);
					assert.notEqual(output, input, "unusual layout must be formatted, rather than skipped");
					checked++;
				}
			}
		} finally {
			parser.delete();
		}
	}
	assert.equal(checked, 3072);
});

test("preservation validation detects changed bindings, attributes, scope, code and comments", async () => {
	const parser = new Parser();
	parser.setLanguage(await formatter.loadLanguage("python"));
	function signature(source) {
		const tree = parser.parse(source);
		try {
			return fingerprint(tree.rootNode, LANGUAGES.python);
		} finally {
			tree.delete();
		}
	}
	try {
		const source = "if ready:\n    import longest as Alias, a\n    run() # retained\n";
		const original = signature(source);
		assert.equal(
			original,
			signature("if ready:\n    import a\n    import longest as Alias\n    run() # retained\n"),
		);
		for (const changed of [
			source.replace("as Alias", "as Different"),
			source.replace("    import", "import"),
			source.replace("run()", "different()"),
			source.replace("# retained", "# lost"),
		])
			assert.notEqual(original, signature(changed));
		assert.notEqual(signature("import a\nrun()\nimport longest\n"), signature("import longest\nrun()\nimport a\n"));
		assert.notEqual(
			signature("import longest as x\nimport a as x\n"),
			signature("import a as x\nimport longest as x\n"),
		);
	} finally {
		parser.delete();
	}
});

test("Python imports with shadowed bindings retain their effective order", async () => {
	assert.equal(await rewrite("python", "import longest as x, a as x\n"), "import longest as x\nimport a as x\n");
	assert.equal(
		await rewrite("python", "from pkg import (longest as x,a as x)\n"),
		"from pkg import (\n    longest as x,\n    a as x,\n)\n",
	);
	const input = "import longest as x\nimport a as x\n";
	assert.equal(await rewrite("python", input), input);
	assert.equal(await rewrite("python", "import longest as K, a as K\n"), "import longest as K\nimport a as K\n");
});

test("Python wildcard imports stay in place as binding boundaries", async () => {
	assert.equal(
		await rewrite("python", "import longest\nimport a\nfrom pkg import *\nimport longer\nimport b\n"),
		"import a\nimport longest\nfrom pkg import *\nimport b\nimport longer\n",
	);
});

test("comments on separate comma lines stay with their preceding member", async () => {
	assert.equal(
		await rewrite("python", "from pkg import (\n longest\n , # longest\n a\n)\n"),
		"from pkg import (\n a,\n longest, # longest\n)\n",
	);
	assert.equal(
		await rewrite("javascript", 'import {longest, /* A */ a} from "x";\n'),
		'import {\n    /* A */\n    a,\n    longest,\n} from "x";\n',
	);
});

test("canonically equivalent Unicode comments are distinct preserved contents", async () => {
	assert.equal(
		await rewrite("javascript", '// é\nimport Long from "long";\n// é\nimport A from "a";\n'),
		'// é\nimport A from "a";\n// é\nimport Long from "long";\n',
	);
});
