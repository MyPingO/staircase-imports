const fs = require("node:fs");
const path = require("node:path");
const { LANGUAGES } = require("../src/languages");

const source = path.dirname(require.resolve("@vscode/tree-sitter-wasm/package.json"));
for (const grammar of new Set(Object.values(LANGUAGES).map((language) => language.grammar))) {
	const name = `tree-sitter-${grammar}.wasm`;
	const destination = path.join(__dirname, "..", "grammars", name);
	fs.copyFileSync(path.join(source, "wasm", name), destination);
	// The npm archive marks these binaries executable on Unix. They are data
	// files, so normalize their mode to match the repository on every platform.
	fs.chmodSync(destination, 0o644);
}
console.log("Updated bundled grammars from @vscode/tree-sitter-wasm.");
