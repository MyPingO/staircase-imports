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

-   Adjacent, single-line import statements are sorted by their full line length, including inline comments. Equal lengths retain their original order.
-   In multiline Python and JavaScript/TypeScript import lists, members are sorted when each member occupies its own line. Missing commas are added before comments when needed for reordering.
-   Comments immediately above an import or member move with it. File directives and shebangs stay in place.
-   Blank lines, intervening code, Python scopes, Python future imports, and Java static imports define separate groups.
-   JavaScript imports used only for side effects, including `import "./setup"` and `import {} from "./setup"`, stay in place and separate groups.
-   Strings, templates, comments, and dynamic `import()` calls are never treated as import declarations.
-   Line endings, indentation, and the presence or absence of a final newline are preserved.

For example:

```typescript
import { a, medium, longestName } from "library";
```

Opening braces may appear on the line after `import`; closing delimiters may share the last member's line.
Compact lists, mixed inline layouts, split aliases, and malformed import declarations are kept as written.
Multiline declarations remain in their original position while their members are formatted.

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
