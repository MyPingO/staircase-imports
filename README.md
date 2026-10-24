# Staircase Imports

A VS Code extension that arranges imports by line length to create a staircase.
Supports Python, JavaScript, TypeScript, JSX, TSX, and Java.

Save a supported file to format its imports, or run **Staircase Imports: Format Imports** from the Command Palette.
The command also works in unsaved documents and can be undone with a single Undo.

```python
# Before
import pathlib
import os
import collections

# After
import os
import pathlib
import collections
```

## How formatting works

-   Import declarations are grouped by syntax, so shared lines, split statements, unusual whitespace, comments between tokens, and explicit Python continuations are supported.
-   Groups are sorted by rendered width, including inline comments. For a multiline declaration, its width is the longest physical line. Equal widths retain their original order.
-   Python imports such as `import longest, a` become separate import statements. Python `from` lists and JavaScript/TypeScript named import lists become a staircase even when their members were inline, mixed across lines, or used split aliases and commas on separate lines.
-   Comments immediately above an import or member move with it. File directives and shebangs stay in place.
-   Blank lines, intervening code, Python scopes, Python future imports, and Java static imports define separate groups. Python wildcard imports remain binding boundaries, and imports that bind the same Python name retain their effective order.
-   JavaScript imports used only for side effects, including `import "./setup"` and `import {} from "./setup"`, stay in place and separate groups.
-   Strings, templates, comments, and dynamic `import()` calls are never treated as import declarations.
-   Existing one-member-per-line layouts retain their spacing. Other layouts use the existing indentation where available, or a four-space continuation indent. New lines use the file's line ending; the presence or absence of a final newline is preserved.
-   Python suites such as `if ready: import longest; import a` stay inside that suite. TypeScript namespace import aliases and `import X = require("x")` declarations are supported.
-   Before edits are applied, the output is parsed again and checked for matching import bindings, scope, comment contents, literal spellings, and surrounding code.

For example:

<!-- prettier-ignore -->
```typescript
import {
  a,
  medium,
  longestName,
} from "library";
```

Opening braces may appear on the line after `import`; closing delimiters may share the last member's line. Multiple import declarations may share a physical line. Formatting operates on complete declarations and members rather than treating a line as an import.

The bundled language grammars determine which language-version syntax is recognized. Files with syntax errors or syntax the grammar cannot recognize are left unchanged. Dynamic `import()` expressions and CommonJS `require()` calls are executable expressions and are not reordered.

Importing a module can execute code in Python and JavaScript. Use separate groups when import order matters. Avoid running another import sorter with a different ordering rule on the same save.

## Settings

Existing settings remain compatible. Set them in User, Workspace, or Workspace Folder settings:

```json
{
	"Staircase Import Formatter.enabled": "enabled",
	"Staircase Import Formatter.order": "ascending"
}
```

| Setting                              | Values                        | Default       |
| ------------------------------------ | ----------------------------- | ------------- |
| `Staircase Import Formatter.enabled` | `"enabled"`, `"disabled"`     | `"enabled"`   |
| `Staircase Import Formatter.order`   | `"ascending"`, `"descending"` | `"ascending"` |

Ascending puts shorter imports first; descending puts longer imports first.
Disabling the extension's setting disables both automatic formatting and its command.

## Installation

Search for **Staircase Imports** in VS Code's Extensions view.
To try a locally built version, run `npm run package`, then choose **Extensions: Install from VSIX...** and select the generated `.vsix` file.
Requires VS Code 1.85 or newer. No external language toolchain or network connection is needed for formatting.

If formatting fails, the file still saves. Details appear in the **Staircase Imports** Output channel.

## Development

Requires Node.js 22 or newer and npm.

```sh
npm ci
npm run check
npm run test:integration
npm run package
```

`npm test` runs fast tests in Node, including the original regression examples. Integration tests download and launch an isolated VS Code host, then verify real saves and commands. On headless Linux, use `xvfb-run -a npm run test:integration`.
To test an older host, set the `VSCODE_VERSION` environment variable, for example to `1.85.2`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the architecture and grammar update workflow, and [CHANGELOG.md](CHANGELOG.md) for release notes.

## License

[MIT](LICENSE.md). Bundled grammar credits and licenses are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
