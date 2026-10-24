/** @typedef {import("web-tree-sitter").Node} SyntaxNode */

const COMMENTS = new Set(["comment", "line_comment", "block_comment"]);
const DIRECTIVE = /^(?:#!|#.*coding\s*[:=]|\/\/\s*(?:@ts-|@flow|<reference)|.*\b(?:eslint|prettier|isort|fmt)\b)/;
const BREAK = /[\r\n\u2028\u2029]/;

/** @param {string} source @param {number} index */
function lineStart(source, index) {
	while (index > 0 && !BREAK.test(source[index - 1])) index--;
	return index === 0 && source[0] === "\uFEFF" ? 1 : index;
}

/** @param {string} source @param {number} index */
function lineEnd(source, index) {
	while (index < source.length && !BREAK.test(source[index])) index++;
	return index;
}

/** @param {string} source @param {number} index */
function indentation(source, index) {
	return source.slice(lineStart(source, index), index).match(/^[^\S\r\n\u2028\u2029]*/)?.[0] || "";
}

/** @param {string} text */
function hasBlankLine(text) {
	return /\n[^\S\n]*\n/.test(text.replace(/\r\n|\r|\u2028|\u2029/g, "\n"));
}

/** @param {SyntaxNode} node @returns {SyntaxNode[]} */
function tokens(node) {
	const result = [];
	const stack = [node];
	while (stack.length) {
		const current = stack.pop();
		if (!current || current.type === "line_continuation") continue;
		if (COMMENTS.has(current.type) || ["string", "string_literal"].includes(current.type) || !current.childCount)
			result.push(current);
		else
			for (let index = current.childCount - 1; index >= 0; index--) {
				const child = current.child(index);
				if (child) stack.push(child);
			}
	}
	return result;
}

/** @param {SyntaxNode} node */
function bindingName(node) {
	return (node.childForFieldName("alias")?.text || node.firstNamedChild?.text || node.text).normalize("NFKC");
}

/** @param {string[]} names */
function duplicateBindings(names) {
	return new Set(names).size !== names.length;
}

/**
 * Print complete tokens, keeping strings and comments opaque. Whitespace and
 * explicit Python continuations can change without guessing at their contents.
 * @param {SyntaxNode | SyntaxNode[]} node
 * @param {string} indent
 * @param {string} eol
 */
function printSyntax(node, indent, eol) {
	const leaves = (Array.isArray(node) ? node : [node]).flatMap(tokens);
	let text = "";
	/** @type {SyntaxNode | undefined} */
	let previous;
	for (const token of leaves) {
		if (previous) {
			if (isLineComment(previous)) {
				text += eol + indent;
			} else if (needsSpace(previous, token)) {
				text += " ";
			}
		}
		text += commentText(token);
		previous = token;
	}
	return text;
}

/** @param {SyntaxNode} node */
function isLineComment(node) {
	return COMMENTS.has(node.type) && /^(?:#|\/\/)/.test(node.text);
}

/** @param {SyntaxNode} node */
function commentText(node) {
	// Some grammars include CR in line-comment nodes; it belongs to CRLF,
	// rather than to the comment's content.
	return isLineComment(node) ? node.text.replace(/\r$/, "") : node.text;
}

/** @param {SyntaxNode} previous @param {SyntaxNode} next */
function needsSpace(previous, next) {
	if (COMMENTS.has(previous.type) || COMMENTS.has(next.type)) return true;
	if (previous.text === "from" && /^\.+$/.test(next.text)) return true;
	if ([",", ";", ".", ")", "]"].includes(next.text)) return false;
	if (/^\.+$/.test(previous.text) || ["(", "["].includes(previous.text)) return false;
	if (next.text === ":") return false;
	if (next.text === "(" && previous.text === "require") return false;
	if (next.text === "}") return previous.text !== "{";
	if (previous.text === "{") return next.text !== "}";
	return true;
}

/** @param {SyntaxNode} node @param {string} family */
function memberList(node, family) {
	if (family === "java") return;
	if (family === "python") {
		const module = node.childForFieldName("module_name");
		const members = node.namedChildren.filter(
			(child) =>
				["dotted_name", "aliased_import", "wildcard_import"].includes(child.type) && child.id !== module?.id,
		);
		const open = node.children.find((child) => child.type === "(");
		const close = node.children.find((child) => child.type === ")");
		return { node, members, open, close, plain: node.type === "import_statement" };
	}
	const list = node.descendantsOfType("named_imports")[0];
	if (!list) return;
	return {
		node: list,
		members: list.namedChildren.filter((child) => child.type === "import_specifier"),
		open: list.children[0],
		close: list.children[list.childCount - 1],
		plain: false,
	};
}

/** @param {SyntaxNode} node */
function importOwner(node) {
	return node.parent?.type === "export_statement" ? node.parent : node;
}

/** @param {SyntaxNode} node @param {string} source */
function inlineSuite(node, source) {
	const parent = node.parent;
	if (parent?.type !== "block") return false;
	let colon = parent.previousSibling;
	while (colon && (colon.type === "line_continuation" || COMMENTS.has(colon.type))) colon = colon.previousSibling;
	return colon?.type === ":" && !BREAK.test(source.slice(colon.endIndex, parent.startIndex).replace(/\\\r?\n/g, ""));
}

module.exports = {
	COMMENTS,
	DIRECTIVE,
	BREAK,
	lineStart,
	lineEnd,
	indentation,
	hasBlankLine,
	tokens,
	printSyntax,
	isLineComment,
	commentText,
	memberList,
	importOwner,
	inlineSuite,
	bindingName,
	duplicateBindings,
};
