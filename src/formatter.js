const path = require("node:path");
const { Parser, Language } = require("web-tree-sitter");
const { LANGUAGES } = require("./languages");
const { collectEdits } = require("./imports");

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
		try {
			parser.setLanguage(language);
			tree = parser.parse(source);
			return tree ? collectEdits(source, tree.rootNode, definition, order) : [];
		} finally {
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
