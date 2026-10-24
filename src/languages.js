const javascript = { grammar: "javascript", family: "javascript", imports: ["import_statement"] };
const typescript = { ...javascript, grammar: "typescript" };

/** @type {Readonly<Record<string, {grammar: string, family: string, imports: string[]}>>} */
const LANGUAGES = Object.freeze({
	python: {
		grammar: "python",
		family: "python",
		imports: ["import_statement", "import_from_statement", "future_import_statement"],
	},
	javascript,
	javascriptreact: javascript,
	typescript,
	typescriptreact: { ...typescript, grammar: "tsx" },
	java: { grammar: "java", family: "java", imports: ["import_declaration"] },
});

module.exports = { LANGUAGES };
