# Bundled grammars

These files are copied from `@vscode/tree-sitter-wasm@0.3.1`, maintained at [microsoft/vscode-tree-sitter-wasm](https://github.com/microsoft/vscode-tree-sitter-wasm).

Run `npm run grammars:update` after installing the locked dependencies to reproduce the bundled files. Only Java, JavaScript, Python, TypeScript, and TSX are copied. JSX uses the JavaScript grammar.

The parser runtime is the separately pinned `web-tree-sitter` dependency. Both the runtime and grammars are exercised by tests in Node and real VS Code hosts. License notices are in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
