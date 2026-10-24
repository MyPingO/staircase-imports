const { createHash } = require("node:crypto");
const { COMMENTS, tokens, memberList, importOwner, commentText, bindingName } = require("./syntax");

/** @typedef {import("web-tree-sitter").Node} SyntaxNode */

/**
 * Keep non-import syntax in order and import bindings in their original scope.
 * Lists and declarations may be reordered; punctuation used only for import
 * layout may change. Comment contents and literal spellings must survive.
 * @param {SyntaxNode} root
 * @param {{family: string, imports: string[]}} language
 */
function fingerprint(root, language) {
	const hash = createHash("sha256");
	const owners = new Map(root.descendantsOfType(language.imports).map((node) => [importOwner(node).id, node]));
	/** @param {SyntaxNode} node */
	function visit(node) {
		if (COMMENTS.has(node.type) || node.type === "line_continuation") return;
		if (language.family === "python" && node.type === ";") return;
		hash.update("(" + node.type);
		if (["string", "string_literal"].includes(node.type) || !node.childCount) {
			hash.update(JSON.stringify(node.text));
		} else {
			/** @type {string[]} */
			let imports = [];
			/** @type {Map<string, string[]>} */
			const bindings = new Map();
			const flush = () => {
				if (imports.length) hash.update(JSON.stringify(imports.sort()));
				const shadowed = [...bindings]
					.filter(([, records]) => records.length > 1)
					.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
				if (shadowed.length) hash.update(JSON.stringify(shadowed));
				imports = [];
				bindings.clear();
			};
			for (const child of node.children) {
				const imported = owners.get(child.id);
				if (imported) {
					const records = importRecords(imported, language.family);
					imports.push(...records);
					if (language.family === "python")
						memberList(imported, language.family)?.members.forEach((member, index) => {
							const name = bindingName(member);
							const earlier = bindings.get(name) || [];
							earlier.push(records[index]);
							bindings.set(name, earlier);
						});
				} else if (
					!COMMENTS.has(child.type) &&
					child.type !== "line_continuation" &&
					!(language.family === "python" && child.type === ";")
				) {
					flush();
					visit(child);
				}
			}
			flush();
		}
		hash.update(")");
	}
	visit(root);
	const comments = root.descendantsOfType([...COMMENTS]).map((node) => [node.type, commentText(node)]);
	hash.update(JSON.stringify(comments.map((comment) => JSON.stringify(comment)).sort()));
	return hash.digest("hex");
}

/** @param {SyntaxNode} node */
function semanticTokens(node) {
	return tokens(node)
		.filter((token) => !COMMENTS.has(token.type) && token.type !== ";")
		.map((token) => [token.type, token.text]);
}

/** @param {SyntaxNode} node @param {string} family */
function importRecords(node, family) {
	const list = memberList(node, family);
	if (family === "python" && list) {
		const prefix = list.plain
			? [["import", "import"]]
			: node.children
					.filter((child) => child.endIndex <= list.members[0]?.startIndex)
					.flatMap(semanticTokens)
					.filter(([type]) => !["(", ")", ","].includes(type));
		return list.members.map((member) => JSON.stringify([prefix, semanticTokens(member)]));
	}
	const owner = importOwner(node);
	/** @param {SyntaxNode} current @returns {unknown[]} */
	function content(current) {
		if (current.id === list?.node.id)
			return [
				[
					"named_imports",
					list.members
						.map(semanticTokens)
						.map((member) => JSON.stringify(member))
						.sort(),
				],
			];
		if (COMMENTS.has(current.type) || current.type === "line_continuation" || current.type === ";") return [];
		if (["string", "string_literal"].includes(current.type) || !current.childCount)
			return [[current.type, current.text]];
		return current.children.flatMap(content);
	}
	return [JSON.stringify(content(owner))];
}

module.exports = { fingerprint };
