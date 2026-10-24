const {
	COMMENTS,
	DIRECTIVE,
	BREAK,
	lineStart,
	lineEnd,
	indentation,
	hasBlankLine,
	importOwner,
	inlineSuite,
	isLineComment,
	memberList,
	bindingName,
	duplicateBindings,
} = require("./syntax");
const { renderImport } = require("./members");

/** @typedef {import("web-tree-sitter").Node} SyntaxNode */
/** @typedef {{start: number, end: number, newText: string}} ImportEdit */
/** @typedef {{text: string, width: number, bindings: string[]}} Entry */
/** @typedef {{node: SyntaxNode, start: number, end: number, indent: string, entries: Entry[], kind: string, inline: boolean, footer: string}} Unit */

/**
 * Group logical declarations in the same syntax container. Physical lines are
 * only used to preserve comments and intentional blank-line boundaries.
 * @param {string} source
 * @param {SyntaxNode} root
 * @param {{family: string, imports: string[]}} language
 * @param {"ascending" | "descending"} order
 * @returns {ImportEdit[]}
 */
function collectEdits(source, root, language, order) {
	const eol = source.match(/\r\n|\n|\r/)?.[0] || "\n";
	/** @type {ImportEdit[]} */
	const edits = [];
	/** @type {Unit[]} */
	let group = [];
	const flush = () => {
		if (!group.length) return;
		const entries = group.flatMap((unit) => unit.entries);
		const direction = order === "descending" ? -1 : 1;
		const preserveOrder = duplicateBindings(entries.flatMap((entry) => entry.bindings));
		const separator = group[0].inline ? "; " : eol + group[0].indent;
		const text =
			[...entries]
				.sort((a, b) => (preserveOrder ? 0 : direction * (a.width - b.width)))
				.map((entry) => entry.text)
				.join(separator) + group.map((unit) => unit.footer).join("");
		appendEdit(group[0].start, group[group.length - 1].end, text, source, edits);
		group = [];
	};

	for (const node of root.descendantsOfType(language.imports)) {
		const owner = importOwner(node);
		const parent = owner.parent;
		if (node.hasError || !parent || !["module", "block", "program", "statement_block"].includes(parent.type)) {
			flush();
			continue;
		}
		const unit = createUnit(node, owner, source, language.family, order, eol);
		const previous = group[group.length - 1];
		if (
			previous &&
			(previous.node.parent?.id !== parent.id ||
				previous.kind !== unit.kind ||
				previous.inline !== unit.inline ||
				!onlySeparators(source.slice(previous.end, unit.start)) ||
				hasBlankLine(source.slice(previous.end, unit.start)))
		)
			flush();

		if (["side-effect", "wildcard"].includes(unit.kind)) {
			flush();
			appendEdit(
				unit.start,
				unit.end,
				unit.entries.map((entry) => entry.text).join(eol + unit.indent) + unit.footer,
				source,
				edits,
			);
		} else {
			group.push(unit);
		}
	}
	flush();
	return edits.sort((a, b) => a.start - b.start);
}

/** @param {string} text */
function onlySeparators(text) {
	return /^(?:\s|;|\\\r?\n)*$/.test(text);
}

/**
 * @param {SyntaxNode} node
 * @param {SyntaxNode} owner
 * @param {string} source
 * @param {string} family
 * @param {"ascending" | "descending"} order
 * @param {string} eol
 * @returns {Unit}
 */
function createUnit(node, owner, source, family, order, eol) {
	const indent = indentation(source, owner.startIndex);
	const inline = family === "python" && inlineSuite(owner, source);
	let start = owner.startIndex;
	let end = owner.endIndex;
	let previous = owner.previousNamedSibling;
	while (
		previous &&
		COMMENTS.has(previous.type) &&
		!DIRECTIVE.test(previous.text) &&
		!source.slice(lineStart(source, previous.startIndex), previous.startIndex).trim() &&
		!source.slice(previous.endIndex, start).trim() &&
		!hasBlankLine(source.slice(previous.endIndex, start))
	) {
		start = previous.startIndex;
		previous = previous.previousNamedSibling;
	}
	let next = owner.nextSibling;
	let lineComment = false;
	while (
		next &&
		COMMENTS.has(next.type) &&
		!BREAK.test(source.slice(end, next.startIndex)) &&
		!source.slice(end, next.startIndex).trim()
	) {
		end = next.endIndex;
		lineComment ||= isLineComment(next);
		next = next.nextSibling;
	}
	if (lineComment && source[end - 1] === "\r") end--;
	const physicalEnd = lineEnd(source, end);
	if (!source.slice(end, physicalEnd).trim()) end = physicalEnd;
	const leading = source.slice(start, owner.startIndex);
	let tail = source.slice(owner.endIndex, end);
	const footer = inline && lineComment ? tail : "";
	if (footer) tail = "";
	const exported = source.slice(owner.startIndex, node.startIndex);
	const bodies = renderImport(node, source, family, order, indent, eol);
	const list = family === "python" ? memberList(node, family) : undefined;
	const entries = bodies.map((body, index) => {
		const suffix = index === bodies.length - 1 ? tail : "";
		return {
			text: (index ? "" : leading) + exported + body + suffix,
			width: (exported + body + suffix)
				.split(/\r\n|[\n\r\u2028\u2029]/)
				.reduce((width, line) => Math.max(width, line.length), 0),
			bindings: list ? (list.plain ? [bindingName(list.members[index])] : list.members.map(bindingName)) : [],
		};
	});
	return { node: owner, start, end, indent, entries, kind: importKind(node, family, !!exported), inline, footer };
}

/** @param {SyntaxNode} node @param {string} family @param {boolean} exported */
function importKind(node, family, exported) {
	if (family === "python")
		return node.namedChildren.some((child) => child.type === "wildcard_import")
			? "wildcard"
			: node.type === "future_import_statement"
				? "future"
				: "import";
	if (family === "java") return node.children.some((child) => child.type === "static") ? "static" : "import";
	if (node.type === "import_alias") return exported ? "exported-alias" : "import";
	if (node.namedChildren.some((child) => child.type === "import_require_clause"))
		return exported ? "exported-require" : "import";
	const clause = node.namedChildren.find((child) => child.type === "import_clause");
	return clause &&
		(clause.descendantsOfType("import_specifier").length ||
			clause.namedChildren.some((child) => ["identifier", "namespace_import"].includes(child.type)))
		? "import"
		: "side-effect";
}

/** @param {number} start @param {number} end @param {string} newText @param {string} source @param {ImportEdit[]} edits */
function appendEdit(start, end, newText, source, edits) {
	if (source.slice(start, end) !== newText) edits.push({ start, end, newText });
}

module.exports = { collectEdits };
