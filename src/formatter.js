const path = require("node:path");
const { Parser, Language } = require("web-tree-sitter");
const { LANGUAGES } = require("./languages");
const { collectEdits } = require("./imports");
const { fingerprint } = require("./invariants");

/** @type {Promise<void> | undefined} */
let initialization;

class ImportFormatter {
	/** @param {string} grammarDirectory */
	constructor(grammarDirectory = path.join(__dirname, "..", "grammars")) {
		this.grammarDirectory = grammarDirectory;
		/** @type {Map<string, Promise<import("web-tree-sitter").Language>>} */
		this.languages = new Map();
		this.disposed = false;
	}

	/** @param {string} languageId */
	static supports(languageId) {
		return Object.hasOwn(LANGUAGES, languageId);
	}

	/** @param {string} grammar */
	async loadLanguage(grammar) {
		if (!initialization) {
			initialization = Parser.init().catch((error) => {
				initialization = undefined;
				throw error;
			});
		}
		await initialization;
		let language = this.languages.get(grammar);
		if (!language) {
			language = Language.load(path.join(this.grammarDirectory, `tree-sitter-${grammar}.wasm`)).catch((error) => {
				this.languages.delete(grammar);
				throw error;
			});
			this.languages.set(grammar, language);
		}
		return language;
	}

	/**
	 * @param {string} source
	 * @param {string} languageId
	 * @param {"ascending" | "descending"} [order]
	 * @returns {Promise<import("./imports").ImportEdit[]>}
	 */
	async getEdits(source, languageId, order = "ascending") {
		if (this.disposed || !ImportFormatter.supports(languageId)) return [];
		const definition = LANGUAGES[languageId];
		const language = await this.loadLanguage(definition.grammar);
		if (this.disposed) return [];
		// Each request owns its parser, including during concurrent saves.
		const parser = new Parser();
		/** @type {import("web-tree-sitter").Tree | null} */
		let tree = null;
		/** @type {import("web-tree-sitter").Tree | null} */
		let verification = null;
		try {
			parser.setLanguage(language);
			tree = parser.parse(source);
			if (!tree || tree.rootNode.hasError) return [];
			const edits = collectEdits(source, tree.rootNode, definition, order);
			if (!edits.length) return [];
			const formatted = edits.reduceRight(
				(text, edit) => text.slice(0, edit.start) + edit.newText + text.slice(edit.end),
				source,
			);
			verification = parser.parse(formatted);
			if (
				!verification ||
				verification.rootNode.hasError ||
				fingerprint(tree.rootNode, definition) !== fingerprint(verification.rootNode, definition)
			) {
				throw new Error("Import formatting failed syntax or preservation checks; no edits were applied.");
			}
			return edits;
		} finally {
			verification?.delete();
			tree?.delete();
			parser.delete();
		}
	}

	dispose() {
		this.disposed = true;
		this.languages.clear();
	}
}

module.exports = { ImportFormatter };
