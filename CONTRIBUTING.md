# Contributing

Clone the repository and create a branch for your change. Use Node.js 22 or newer, then install the locked dependencies:

```sh
npm ci
```

## Architecture

-   `extension.js` connects VS Code saves and the explicit command to the formatter. Settings are read for the document being formatted. Save edits are returned through `event.waitUntil()`; formatting does not save recursively.
-   `src/formatter.js` loads and caches grammars, then gives each request its own parser. Trees and parsers are released in `finally`. Its API accepts source text, a VS Code language ID, and a sort order, and returns edits with UTF-16 offsets.
-   `src/imports.js` groups complete import declarations within syntax containers and sorts logical entries. Python inline suites, wildcard imports, shadowed bindings, and side effect imports retain the required boundaries.
-   `src/members.js` formats import members and normalizes arbitrary layouts. `src/syntax.js` supplies token-aware printing, opaque literals/comments, and syntax helpers.
-   `src/invariants.js` validates the reparsed output: import bindings and scopes, ordering across intervening code and shadowed bindings, comment contents, literals, and non-import syntax must survive. Keep replacements small, nonoverlapping, and idempotent.
-   `src/languages.js` maps language IDs to grammar files and import node types.
-   `grammars/` contains the five grammars needed at runtime. Development and packaging work offline once dependencies and test hosts have been downloaded.

When extending formatting, preserve comments, blank-line groups, scope, special import categories, and source outside the import ranges. Handle layout through syntax nodes and tokens; do not reject valid parsed imports because of physical line placement. Files the grammar cannot parse are left untouched. Keep side effect imports in their original position.

## Checks

```sh
npm run format
npm run check
npm run test:integration
npm run package
```

`npm run check` runs ESLint, strict JavaScript type checking, Prettier, and Node tests. Tests live in `test/unit/` and `test/integration/`; `test/fixtures/legacy.json` retains the original 17 examples with an annotated correction for Python shadowed bindings. The layout suite exercises 3,072 seeded formatting checks across all language IDs and both sort orders, including idempotence and TypeScript's independent parser.

Integration tests use temporary files and an isolated VS Code profile. They check the first save's on-disk contents, background and concurrent saves, settings, CRLF, and the undoable command. On headless Linux, run them with `xvfb-run -a npm run test:integration`.

Set `VSCODE_VERSION=1.85.2` in your shell to check the minimum supported minor version. CI tests the minimum version and current stable VS Code, and runs the source checks on Windows and Linux.

The development tools have scoped npm overrides: VSCE uses a compatible Azure Identity version outside the affected MSAL range, its MSAL dependency uses a patched UUID release, and the VS Code test runner uses patched `diff` and `serialize-javascript` releases. Review these pins when updating the tools, run `npm audit`, and verify both integration hosts before removing them.

Press F5 in VS Code to launch an Extension Development Host for manual testing. To install a build in your own editor, use **Extensions: Install from VSIX...** on the package produced by `npm run package`.

## Grammar updates

Grammars come from the pinned `@vscode/tree-sitter-wasm` development dependency. Runtime only depends on `web-tree-sitter`; unused grammars are excluded from the package.

After intentionally updating the grammar dependency:

```sh
npm run grammars:update
npm run check
npm run test:integration
```

Commit the lockfile and updated WASM files together. Verify both supported VS Code test hosts before changing the parser runtime or grammar version. Review the upstream grammar licenses and update `THIRD_PARTY_NOTICES.md` if needed.

Open a pull request describing the problem, resulting behavior, and checks you ran. Bug fixes should include an example that would have failed before the change.
