const {
	COMMENTS,
	BREAK,
	lineStart,
	lineEnd,
	hasBlankLine,
	printSyntax,
	isLineComment,
	commentText,
	memberList,
	bindingName,
	duplicateBindings,
} = require("./syntax");

/** @typedef {import("web-tree-sitter").Node} SyntaxNode */
/** @typedef {{body: string, leading: string[], trailing: SyntaxNode[], node: SyntaxNode, group: number}} Member */

/**
 * @param {SyntaxNode} node
 * @param {string} source
 * @param {string} family
 * @param {"ascending" | "descending"} order
 * @param {string} indent
 * @param {string} eol
 * @returns {string[]}
 */
function renderImport(node, source, family, order, indent, eol) {
	const list = memberList(node, family);
	if (!list?.members.length) {
		return [BREAK.test(node.text) ? printSyntax(node, indent, eol) : node.text];
	}
	const { members, open, close, plain } = list;
	const preserveOrder = family === "python" && duplicateBindings(members.map(bindingName));
	if (plain && members.length === 1) {
		return [BREAK.test(node.text) ? printSyntax(node, indent, eol) : node.text];
	}
	if (
		!plain &&
		members.length === 1 &&
		!BREAK.test(members[0].text) &&
		open &&
		close &&
		!source.slice(lineStart(source, members[0].startIndex), members[0].startIndex).trim()
	)
		return [node.text];
	if (!plain && members.length === 1 && !BREAK.test(node.text)) return [node.text];

	// Preserve established one-member-per-line layouts exactly; normalize the
	// other layouts from syntax tokens into the same sortable representation.
	const conventional =
		!!open &&
		!!close &&
		members.length > 1 &&
		members.every((member, index) => {
			const start = lineStart(source, member.startIndex);
			const end = lineEnd(source, member.endIndex);
			let next = member.nextSibling;
			while (next && COMMENTS.has(next.type)) next = next.nextSibling;
			return (
				!BREAK.test(member.text) &&
				start > open.endIndex &&
				!source.slice(start, member.startIndex).trim() &&
				(!index || start > lineEnd(source, members[index - 1].endIndex)) &&
				(next?.type !== "," || next.startIndex < end)
			);
		});
	if (conventional) {
		const result = renderConventional(node, list, source, order, eol, preserveOrder);
		if (result !== undefined) return [result];
	}

	const step = inferStep(source);
	const memberIndent =
		members
			.map((member) => {
				const prefix = source.slice(lineStart(source, member.startIndex), member.startIndex);
				return prefix && !prefix.trim() && member.startIndex > (open?.endIndex || node.startIndex)
					? prefix
					: "";
			})
			.find(Boolean) || indent + step;
	const entries = collectMembers(list, source, memberIndent, eol);
	const sorted = preserveOrder ? entries.members : sortMembers(entries.members, order);
	if (plain) {
		return sorted.map((entry) => renderEntry(entry, indent, eol, false, "import "));
	}
	const prefix = open
		? source.slice(node.startIndex, open.endIndex)
		: printSyntax(
				node.children.filter((child) => child.endIndex <= members[0].startIndex && !COMMENTS.has(child.type)),
				indent,
				eol,
			) + " (";
	const suffix = close ? source.slice(close.startIndex, node.endIndex) : ")";
	const header = entries.header.map((comment) => " " + commentText(comment)).join("");
	let previousGroup = sorted[0]?.group;
	const rows = sorted.map((entry) => {
		const blank = previousGroup !== entry.group ? eol : "";
		previousGroup = entry.group;
		return blank + memberIndent + renderEntry(entry, memberIndent, eol, true);
	});
	const footer = entries.footer.map((comment) => memberIndent + commentText(comment)).join(eol);
	const opening = prefix.replace(/\\\r?\n[\t ]*/g, " ").trimEnd();
	return [opening + header + eol + rows.join(eol) + (footer ? eol + footer : "") + eol + indent + suffix];
}

/** @param {string} source */
function inferStep(source) {
	const match = source.match(/(?:^|\n)(\t+| {2,})\S/);
	return match ? (match[1].includes("\t") ? "\t" : " ".repeat(Math.min(match[1].length, 4))) : "    ";
}

/**
 * @param {NonNullable<ReturnType<typeof memberList>>} list
 * @param {string} source
 * @param {string} indent
 * @param {string} eol
 */
function collectMembers(list, source, indent, eol) {
	/** @type {Member[]} */
	const entries = list.members.map((node) => ({
		node,
		body: printSyntax(node, indent, eol),
		leading: [],
		trailing: [],
		group: 0,
	}));
	/** @type {SyntaxNode[]} */
	const header = [];
	/** @type {SyntaxNode[]} */
	const footer = [];
	let group = 0;
	for (let index = 0; index < entries.length; index++) {
		if (index && hasBlankLine(source.slice(entries[index - 1].node.endIndex, entries[index].node.startIndex)))
			group++;
		entries[index].group = group;
	}
	for (const comment of list.node.namedChildren.filter((child) => COMMENTS.has(child.type))) {
		if (list.open && comment.startIndex < list.open.endIndex) continue;
		const following = entries.findIndex((entry) => entry.node.startIndex > comment.startIndex);
		const previous = entries.filter((entry) => entry.node.endIndex <= comment.startIndex).at(-1);
		let comma = previous?.node.nextSibling;
		while (comma && COMMENTS.has(comma.type)) comma = comma.nextSibling;
		const afterComma =
			comma?.type === "," &&
			comma.endIndex <= comment.startIndex &&
			!BREAK.test(source.slice(comma.endIndex, comment.startIndex));
		const inlineLead =
			following >= 0 &&
			!isLineComment(comment) &&
			afterComma &&
			!BREAK.test(source.slice(comment.endIndex, entries[following].node.startIndex));
		if (
			!previous &&
			list.open &&
			!BREAK.test(source.slice(list.open.endIndex, comment.startIndex)) &&
			isLineComment(comment)
		) {
			header.push(comment);
		} else if (
			previous &&
			!inlineLead &&
			(!BREAK.test(source.slice(previous.node.endIndex, comment.startIndex)) || afterComma)
		) {
			previous.trailing.push(comment);
		} else if (following >= 0) {
			entries[following].leading.push(commentText(comment));
		} else {
			footer.push(comment);
		}
	}
	return { members: entries, header, footer };
}

/** @param {Member[]} entries @param {"ascending" | "descending"} order */
function sortMembers(entries, order) {
	return [...entries].sort(
		(a, b) => a.group - b.group || (order === "descending" ? -1 : 1) * (memberWidth(a) - memberWidth(b)),
	);
}

/** @param {Member} entry */
function memberWidth(entry) {
	return entry.body.length + entry.trailing.reduce((width, comment) => width + 1 + commentText(comment).length, 0);
}

/** @param {Member} entry @param {string} indent @param {string} eol @param {boolean} comma @param {string} [prefix] */
function renderEntry(entry, indent, eol, comma, prefix = "") {
	const leading = entry.leading.map((comment) => comment + eol + indent).join("");
	let body = prefix + entry.body + (comma ? "," : "");
	let previousLineComment = false;
	for (const comment of entry.trailing) {
		body += (previousLineComment ? eol + indent : " ") + commentText(comment);
		previousLineComment = isLineComment(comment);
	}
	return leading + body;
}

/**
 * @param {SyntaxNode} node
 * @param {NonNullable<ReturnType<typeof memberList>>} list
 * @param {string} source
 * @param {"ascending" | "descending"} order
 * @param {string} eol
 * @param {boolean} preserveOrder
 */
function renderConventional(node, list, source, order, eol, preserveOrder) {
	if (!list.close) return;
	/** @type {{start: number, end: number, text: string, width: number, group: number}[]} */
	const rows = [];
	let group = 0;
	for (const member of list.members) {
		let start = lineStart(source, member.startIndex);
		let end = Math.min(lineEnd(source, member.endIndex), list.close.startIndex);
		if (end === list.close.startIndex) {
			while (end > member.endIndex && /[\t ]/.test(source[end - 1])) end--;
		}
		let cursor = member.endIndex;
		let next = member.nextSibling;
		let comma = false;
		while (next && next.startIndex < end) {
			if (source.slice(cursor, next.startIndex).trim()) return;
			if (next.type === "," && !comma) comma = true;
			else if (!COMMENTS.has(next.type) || BREAK.test(next.text)) return;
			cursor = next.endIndex;
			next = next.nextSibling;
		}
		if (source.slice(cursor, end).trim()) return;
		let previous = member.previousNamedSibling;
		while (
			previous &&
			COMMENTS.has(previous.type) &&
			!source.slice(previous.endIndex, start).trim() &&
			!hasBlankLine(source.slice(previous.endIndex, start)) &&
			!source.slice(lineStart(source, previous.startIndex), previous.startIndex).trim()
		) {
			start = lineStart(source, previous.startIndex);
			previous = previous.previousNamedSibling;
		}
		let text = source.slice(start, end);
		let width = end - lineStart(source, member.startIndex);
		if (!comma) {
			const offset = member.endIndex - start;
			text = text.slice(0, offset) + "," + text.slice(offset);
			width++;
		}
		if (rows.length && hasBlankLine(source.slice(rows[rows.length - 1].end, start))) group++;
		rows.push({ start, end, text, width, group });
	}
	let result = source.slice(node.startIndex, node.endIndex);
	for (let index = group; index >= 0; index--) {
		const part = rows.filter((row) => row.group === index);
		if (part.length < 2) continue;
		const text = [...part]
			.sort((a, b) => (preserveOrder ? 0 : (order === "descending" ? -1 : 1) * (a.width - b.width)))
			.map((row) => row.text)
			.join(eol);
		const start = part[0].start - node.startIndex;
		const end = part[part.length - 1].end - node.startIndex;
		result = result.slice(0, start) + text + result.slice(end);
	}
	return result;
}

module.exports = { renderImport };
