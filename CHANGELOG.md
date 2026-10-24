# Change Log

All notable changes to the "staircase-imports" extension will be documented in this file.

## 0.6.0

-   Replaced duplicated line scanners with a shared syntax-tree-based formatter.
-   Fixed recursive saves, background document formatting, and switching between previously loaded languages.
-   Added the undoable **Staircase Imports: Format Imports** command, including support for unsaved documents.
-   Added working JSX and TSX activation and grammars.
-   Preserved comments, blank-line groups, Python scopes and future imports, Java static imports, line endings, and final newlines.
-   Kept JavaScript imports used only for side effects in place as group boundaries.
-   Supported multiline imports with opening braces on a separate line and closing delimiters on the last member's line.
-   Made settings document-scoped and logged formatting failures without interrupting saves.
-   Updated the parser and bundled grammars, removed the unused grammar collection from runtime dependencies, and added a reproducible grammar update script.
-   Added fast Node regression tests, isolated VS Code integration tests, strict type checks, linting, CI, and VSIX packaging.

## Release Notes

-3/6/2024

-   Integrated AST Tree Parsing for robustness and better handling of edge cases.
-   Bug fix for multiline strings including import statements

-   2 / 24 / 2024

    -   Added support for Java.
    -   (Developers Only) Added tests for Java formatting.

-   2 / 23 / 2024

    -   Refactored Python formatting to be cleaner and more robust in handling different edge cases.
    -   Bug fixes mentioned in the README for python formatting have been resolved.
    -   New known issue for general formatting has been added to the README.
    -   (Developers Only) Added tests for Python formatting.

-   2 / 22 / 2024

    -   Refactored JavaScript/TypeScript formatting to be cleaner and more robust in handling different edge cases.
    -   Added known issues for Python formatting to the README.
    -   (Developers Only) Added tests for JavaScript/TypeScript formatting.
    -   (Developers Only) Added prettier to format codebase.

-   2 / 18 / 2024

    -   Support for JavaScript/TypeScript.

-   2 / 15 / 2024
    -   Initial release of Staircase Imports.
    -   Support for Python.
    -   Support for enabling and disabling the extension.
    -   Support for formatting imports in ascending or descending order.
