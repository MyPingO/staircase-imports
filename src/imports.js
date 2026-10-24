/** @typedef {import("web-tree-sitter").Node} SyntaxNode */
/** @typedef {{start: number, end: number, newText: string}} ImportEdit */
/** @typedef {{node: SyntaxNode, start: number, end: number, text: string, width: number, indent: string, kind: string, hasComma: boolean}} Unit */

const COMMENT_TYPES = new Set(["comment", "line_comment", "block_comment"]);
// File and tool directives belong to their position, rather than to the next import.
const DIRECTIVE = /^(?:#!|#.*coding\s*[:=]|\/\/\s*(?:@ts-|@flow|<reference)|.*\b(?:eslint|prettier|isort|fmt)\b)/;

/**
 * Work on complete syntax nodes and retain the original text around them. Offsets
 * from web-tree-sitter are UTF-16 offsets, as are VS Code's document offsets.
 * @param {string} source
 * @param {SyntaxNode} root
 * @param {{family: string, imports: string[]}} language
 * @param {"ascending" | "descending"} order
 * @returns {ImportEdit[]}
 */
function collectEdits(source, root, language, order) {
	const lines = createLines(source);
	/** @type {ImportEdit[]} */
	const edits = [];
	/** @type {Unit[]} */
	let statements = [];

	const flush = () => {
		appendSortedEdits(statements, source, order, edits);
		statements = [];
	};

	for (const node of root.descendantsOfType(language.imports)) {
		// Only actual statements in a module or Python suite may move. Recovered
		// nodes inside an ERROR must never become imports.
		const parent = node.parent;
		if (
			node.hasError ||
			!parent ||
			!(language.family === "python" ? ["module", "block"] : ["program"]).includes(parent.type)
		) {
			flush();
			continue;
		}

		const unit = createUnit(node, source, lines);
		if (!unit) {
			flush();
			continue;
		}
		if (node.startPosition.row !== node.endPosition.row) {
			flush();
			formatMembers(node, source, lines, language.family, order, edits);
			continue;
		}
		unit.kind = importKind(node, language.family);
		if (unit.kind === "side-effect") {
			flush();
			continue;
		}
		statements.push(unit);
	}
	flush();
	return edits.sort((a, b) => a.start - b.start);
}

/** @param {string} source */
function createLines(source) {
	const starts = [0];
	const ends = [];
	for (let index = 0; index < source.length; index++) {
		if (source[index] === "\n") {
			ends.push(source[index - 1] === "\r" ? index - 1 : index);
			starts.push(index + 1);
		}
	}
	ends.push(source.length);
	if (source[0] === "\uFEFF") starts[0] = 1;
	return { starts, ends };
}

/**
 * @param {SyntaxNode} node
 * @param {string} source
 * @param {ReturnType<typeof createLines>} lines
 * @param {number} [endLimit]
 * @param {boolean} [allowComma]
 * @returns {Unit | undefined}
 */
function createUnit(node, source, lines, endLimit = source.length, allowComma = false) {
	let start = lines.starts[node.startPosition.row];
	let end = Math.min(lines.ends[node.endPosition.row], endLimit);
	const indent = source.slice(start, node.startIndex);
	if (!/^[\t ]*$/.test(indent)) return;

	// If a closing delimiter shares the last member's line, leave its preceding
	// whitespace outside the replacement so that it stays with the delimiter.
	if (allowComma && end === endLimit) {
		while (end > node.endIndex && /[\t ]/.test(source[end - 1])) end--;
	}
	let cursor = node.endIndex;
	let sibling = node.nextSibling;
	let commaSeen = false;
	while (sibling && sibling.startIndex < end) {
		if (!/^[\t ]*$/.test(source.slice(cursor, sibling.startIndex))) return;
		if (allowComma && sibling.type === "," && !commaSeen) {
			commaSeen = true;
		} else if (!COMMENT_TYPES.has(sibling.type) || sibling.endPosition.row !== node.endPosition.row) {
			return;
		}
		if (sibling.endIndex > end) return;
		cursor = sibling.endIndex;
		sibling = sibling.nextSibling;
	}
	if (!/^[\t ]*$/.test(source.slice(cursor, end))) return;

	let previous = node.previousNamedSibling;
	let row = node.startPosition.row - 1;
	while (previous && COMMENT_TYPES.has(previous.type) && previous.endPosition.row === row) {
		const commentStart = lines.starts[previous.startPosition.row];
		if (
			!/^[\t ]*$/.test(source.slice(commentStart, previous.startIndex)) ||
			!/^[\t ]*$/.test(source.slice(previous.endIndex, lines.ends[row])) ||
			DIRECTIVE.test(previous.text)
		) {
			break;
		}
		start = commentStart;
		row = previous.startPosition.row - 1;
		previous = previous.previousNamedSibling;
	}
	return {
		node,
		start,
		end,
		text: source.slice(start, end),
		width: end - lines.starts[node.startPosition.row],
		indent,
		kind: "import",
		hasComma: commaSeen,
	};
}

/** @param {SyntaxNode} node @param {string} family */
function importKind(node, family) {
	if (family === "python") return node.type === "future_import_statement" ? "future" : "import";
	if (family === "java") return node.children.some((child) => child.type === "static") ? "static" : "import";
	const clause = node.namedChildren.find((child) => child.type === "import_clause");
	if (node.namedChildren.some((child) => child.type === "import_require_clause")) return "import";
	// Both `import "x"` and `import {} from "x"` can run code for its side effects.
	return clause &&
		(clause.descendantsOfType("import_specifier").length ||
			clause.namedChildren.some((child) => ["identifier", "namespace_import"].includes(child.type)))
		? "import"
		: "side-effect";
}

/**
 * Sort contiguous runs, preserving blank lines, indentation, scope, import
 * categories and any intervening code or unattached comments.
 * @param {Unit[]} units
 * @param {string} source
 * @param {"ascending" | "descending"} order
 * @param {ImportEdit[]} edits
 */
function appendSortedEdits(units, source, order, edits) {
	/** @type {Unit[]} */
	let group = [];
	const flush = () => {
		if (group.length > 1) {
			const first = group[0];
			const last = group[group.length - 1];
			const separator = source.slice(first.end, group[1].start);
			const direction = order === "descending" ? -1 : 1;
			const newText = [...group]
				.sort((a, b) => direction * (a.width - b.width))
				.map((unit) => unit.text)
				.join(separator);
			if (source.slice(first.start, last.end) !== newText) {
				edits.push({ start: first.start, end: last.end, newText });
			}
		}
		group = [];
	};
	for (const unit of units) {
		const previous = group[group.length - 1];
		if (
			previous &&
			(!/^\r?\n$/.test(source.slice(previous.end, unit.start)) ||
				previous.indent !== unit.indent ||
				previous.kind !== unit.kind ||
				previous.node.parent?.id !== unit.node.parent?.id)
		) {
			flush();
		}
		group.push(unit);
	}
	flush();
}

/**
 * @param {SyntaxNode} node
 * @param {string} source
 * @param {ReturnType<typeof createLines>} lines
 * @param {string} family
 * @param {"ascending" | "descending"} order
 * @param {ImportEdit[]} edits
 */
function formatMembers(node, source, lines, family, order, edits) {
	if (family === "java") return;
	const list = family === "python" ? node : node.descendantsOfType("named_imports")[0];
	if (!list) return;
	const open = list.children.find((child) => child.type === (family === "python" ? "(" : "{"));
	const close = list.children.find((child) => child.type === (family === "python" ? ")" : "}"));
	if (!open || !close) return;
	const members = list.namedChildren.filter(
		(child) =>
			child.startIndex >= open.endIndex && child.endIndex <= close.startIndex && !COMMENT_TYPES.has(child.type),
	);
	if (members.length < 2) return;
	/** @type {Unit[]} */
	const units = [];
	for (const member of members) {
		if (
			member.startPosition.row === open.endPosition.row ||
			member.startPosition.row !== member.endPosition.row ||
			units[units.length - 1]?.node.startPosition.row === member.startPosition.row
		) {
			return;
		}
		const unit = createUnit(member, source, lines, close.startIndex, true);
		if (!unit) return;
		let separator = member.nextSibling;
		while (separator && COMMENT_TYPES.has(separator.type)) separator = separator.nextSibling;
		if (separator?.type === "," && separator.startPosition.row !== member.endPosition.row) return;
		// Insert commas at token boundaries, before whitespace or inline comments,
		// so that moving the last member never produces invalid syntax.
		if (!unit.hasComma) {
			const offset = member.endIndex - unit.start;
			unit.text = unit.text.slice(0, offset) + "," + unit.text.slice(offset);
			unit.width++;
		}
		units.push(unit);
	}
	appendSortedEdits(units, source, order, edits);
}

module.exports = { collectEdits };
