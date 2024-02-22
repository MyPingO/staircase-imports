# Staircase Imports for VSCode

## Staircase Imports is currently in development. Expect bugs and missing features.

Contributions and suggestions are welcome! Feel free to open an issue or submit a pull request on our [GitHub repository](https://github.com/MyPingO/staircase-imports).
While I work on handling edge cases, be sure to write your code in a proper format to avoid confusing the extension :).

![Staircase Imports Showcase GIF](https://github.com/MyPingO/staircase-imports/raw/master/media/Demo.gif)

## Overview

Staircase Imports formats your import statements into a staircase like structure, ensuring that your imports are organized and look cool.

## Usage

Simply work on your Python files as usual. When you save your file, Staircase Imports automatically formats the import statements in your file, organizing them into a neat structure.

## Supported Languages

- Python (fully supported)
- JavaScript/TypeScript (fully supported)
- Support for other languages are in the works.

## Installation

1. Open Visual Studio Code.
2. Navigate to the Extensions view.
3. Search for "Staircase Imports".
4. Click on the Install button to install the extension.

## Extension Settings

1. Choose to enable or disable the extension.
2. Choose to format your imports in ascending or descending order.

For example:
ascending:

```python
import os
import sys
import time
```

descending:

```python
import time
import sys
import os
```

### Settings Preview:

![Extension Settings Image](media/settings.png)


## License

This extension is licensed under [MIT License](LICENSE).

## Release Notes

[Check out the Changelog for all important updates!](CHANGELOG.md)

## Known Issues

### These issues are only for Python files

1. Multi-line imports should all end in a comma ',' for the extension to work properly. Otherwise the extension might format your imports incorrectly, causing an error.

Example:

Before Format:

```python
from library import ( 
  three,
  two,
  one # missing comma
)
```

After Format:

```python
from library import (
	two,
	one,
	three,
) # added an extra closing parenthesis (error)
)
```

2. In some cases, having a comment within a multi-line import might cause the extension to format the import incorrectly. Consider using inline-comments instead.

Example:

Before Format:

```python
from module import (
    # comment <-- should stay on the same line
    one,
    two,
    three
)
```

After Format:

```python
from module import (
    two,
    three,
    # comment <-- move lines (it thinks it's an import)
    one,
)
```
---
<br>

**Enjoy!**
