const fs = require("node:fs");
const path = require("node:path");
const { LANGUAGES } = require("../src/languages");

const source = path.dirname(require.resolve("@vscode/tree-sitter-wasm/package.json"));
for (const grammar of new Set(Object.values(LANGUAGES).map((language) => language.grammar))) {
	const name = `tree-sitter-${grammar}.wasm`;
	fs.copyFileSync(path.join(source, "wasm", name), path.join(__dirname, "..", "grammars", name));
}
console.log("Updated bundled grammars from @vscode/tree-sitter-wasm.");
