# Staircase Imports for VSCode

## Staircase Imports is currently in development. Expect bugs and missing features.

Contributions and suggestions are welcome! Feel free to open an issue or submit a pull request on our [GitHub repository](https://github.com/MyPingO/staircase-imports).  
You can find the contribution guidelines [here](CONTRIBUTING.md).

![Staircase Imports Showcase GIF](https://github.com/MyPingO/staircase-imports/raw/master/media/Demo.gif)

## Overview

Staircase Imports formats your import statements into a staircase like structure, ensuring that your imports are organized and look cool.

## Usage

Simply work on your Python files as usual. When you save your file, Staircase Imports automatically formats the import statements in your file, organizing them into a neat structure.

## Supported Languages

- Python (fully supported)
- JavaScript/TypeScript (fully supported)
- Java (fully supported)
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

**1. When declaring multi-line imports, pay attention to where you place opening/closing brackets or parentheses.**  

The extension will skip over multi-line imports that don't use the correct bracket placement.  
Examples of incorrect bracket placement are shown below:

**Incorrect bracket placement:**

```javascript
//JavaScript/TypeScript

import // <-- Nothing comes after the import statement
{ // <--- This bracket placement is not currently supported
  something,
  somethingElse,
  anotherThing
} from 'somewhere';
```

**Correct bracket placement:**

```javascript
//JavaScript/TypeScript

import { // <-- Correct bracket placement
  something,
  somethingElse,
  anotherThing
} from 'somewhere';
```

Same goes for Python:

**Incorrect bracket placement:**

```python
#Python

from library import (
  something,
  somethingElse,
  anotherThing ) # <-- Incorrect bracket placement
```

**Correct bracket placement:**

```python
#Python

from library import (
  something,
  somethingElse,
  anotherThing 
) # <-- Correct bracket placement
```

---
<br>

**Enjoy!**
