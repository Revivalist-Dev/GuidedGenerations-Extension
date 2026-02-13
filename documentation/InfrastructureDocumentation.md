# Infrastructure Documentation

## Centralized Module Management

This project utilizes a centralized module management system to handle imports and dependencies across various JavaScript files. The core of this system is `scripts/utils/moduleManager.js`. This approach helps in:

*   **Reducing Redundancy**: Avoiding repetitive import statements in multiple files.
*   **Simplifying Updates**: Changes to a module's location or name can be updated in one central place.
*   **Enhancing Readability**: Providing a clear overview of the project's dependencies.

### How it Works

Instead of direct imports like:

```javascript
import { someFunction } from '../../path/to/someModule.js';
```

Modules are imported from `moduleManager.js`:

```javascript
import { someFunction } from './utils/moduleManager.js';
```

The `moduleManager.js` file then handles the actual import of `someFunction` from its real location. This allows for easier refactoring and a more organized codebase.

### Example

To import `extension_settings`, `extensionName`, and `debugLog`:

Previously (Direct Imports):
```javascript
import { extension_settings } from '/scripts/extensions.js';
import { extensionName } from './utils/constants.js';
import { debugLog } from './utils/logger.js';
```

Now (Centralized via moduleManager.js):
```javascript
import { extension_settings, extensionName, debugLog } from './utils/moduleManager.js';
```

This documentation should be kept up-to-date with any significant architectural changes, especially regarding module imports and exports.

## Asset Loading in Extensions

When loading assets (like JSON files, images, etc.) within a SillyTavern extension, it is crucial to use the correct pathing for `fetch` requests. The base path for extension assets, as served by the SillyTavern server, is generally:

```
/scripts/extensions/third-party/<extension-name>/
```

Where `<extension-name>` is the name of your extension's folder (e.g., `GuidedGenerations-Extension`).

### Example: Loading `impersonateTemplates.json`

To load a file like `impersonateTemplates.json` located within your extension at `scripts/templates/impersonateTemplates.json`, the correct `fetch` call would be:

```javascript
const extensionName = "GuidedGenerations-Extension"; // Or dynamically retrieved
const response = await fetch(`/scripts/extensions/third-party/${extensionName}/scripts/templates/impersonateTemplates.json`);
if (response.ok) {
    const data = await response.json();
    // Process data
}
```

Attempting to use relative paths or incorrect absolute paths (e.g., `/extensions/<extension-name>/...`) will result in `404 Not Found` errors. Always ensure the full, correct path including `/scripts/extensions/third-party/` is used.

## Template Loading and URL Paths

When working with HTML templates or static assets within the extension, strict adherence to URL path formation is required to ensure compatibility with the host application's routing.

### `renderExtensionTemplateAsync`

The utility function `renderExtensionTemplateAsync` (and its synchronous counterpart) automatically prefixes paths. 

**Correct Usage:**
When calling `renderExtensionTemplateAsync`, provide the relative path from `scripts/extensions/<extensionName>/`.

```javascript
// Correct: The system expands this to `scripts/extensions/${extensionName}/${templateId}.html`
renderExtensionTemplateAsync(extensionName, 'settings-main'); 
```

**Incorrect Usage:**
Do not manually include the `scripts/extensions/...` prefix when using these helper functions.

```javascript
// Incorrect: This will result in a double path and 404 error
renderExtensionTemplateAsync(`scripts/extensions/${extensionName}`, 'settings-main');
```

### Direct `fetch` Calls

When making direct `fetch` calls for JSON or other assets, you **MUST** provide the full server-relative path.

**Correct Usage:**
```javascript
fetch(`/scripts/extensions/third-party/${extensionName}/path/to/file.json`)
```

**Incorrect Usage:**
Using relative paths (e.g., `./file.json`) or omitting the full extension path will fail because the execution context (the browser page) is at the root `http://localhost:8000/`.