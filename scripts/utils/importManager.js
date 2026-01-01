import { extensionName, debugLog, debugWarn, debugError } from '../../index.js';

// Base URL detection for consistent path resolution
const scriptUrl = document.currentScript?.src || import.meta.url;
const baseUrl = scriptUrl.substring(0, scriptUrl.lastIndexOf('/') + 1);

/**
 * Resolves a path relative to the extension's root directory.
 * @param {string} path - Relative path (e.g., 'scripts/utils/settingsManager.js')
 * @returns {string} Absolute or root-relative URL
 */
export function resolvePath(path) {
    // Remove leading ./ or /
    const cleanPath = path.replace(/^\.?\//, '');
    return new URL(cleanPath, baseUrl).href;
}

/**
 * Centralized import wrapper for Guided Generations.
 * Handles dynamic imports with standardized error logging.
 */
export async function safeImport(path, componentName) {
    try {
        // Use resolvePath only if path starts with ./ or ../ (relative)
        const finalPath = (path.startsWith('./') || path.startsWith('../')) 
            ? resolvePath(path) 
            : path;

        const module = await import(finalPath);
        return module;
    } catch (error) {
        debugError(`[${extensionName}] Failed to import ${componentName} from ${path}:`, error);
        return null;
    }
}
