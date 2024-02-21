# Staircase Imports for VSCode

## **I am working on making this extension less buggy and more robust using a new method that implements AST Parser's. Please be patient as I work on refactoring the codebase. Thank you!**

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

## Contributing
We welcome contributions and suggestions! Feel free to open an issue or submit a pull request on our [GitHub repository](https://github.com/MyPingO/staircase-imports).

## License
This extension is licensed under [MIT License](LICENSE).

## Release Notes
[Check out the Changelog for all updates](CHANGELOG.md)

## Known Issues
1. Multi-line imports should all end in a comma ',' for the extension to work properly. Otherwise the extension might format your imports with a missing comma, causing an error.

Example: 

Before:
```javascript
import {
  three,
  two,
  one // missing comma (no error)
} from 'module';
```

After:
```javascript
import {
  one // missing comma (error)
  two,
  three,
} from 'module';
```

2. In some cases, having a comment within a multi-line import might cause the extension to format the import incorrectly. Consider using inline-comments instead.

Example:

Before:
```python
from module import (
    # comment
    one,
    two,
    three
)
```

After:
```python
from module import (
    two,
    three,
    # comment
    one,
)
# weird formatting because of the comment (has to do with no trailing comma)
```


<br>

**Enjoy!**
