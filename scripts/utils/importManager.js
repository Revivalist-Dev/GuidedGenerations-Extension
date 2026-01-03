import { extensionName } from './constants.js';
import { debugLog, debugWarn, debugError } from './logger.js';

// Base URL detection for consistent path resolution (resolves to extension root)
const scriptUrl = document.currentScript?.src || import.meta.url;
const baseUrl = new URL('../../', scriptUrl).href;

/**
 * Resolves a path relative to the extension's root directory.
 * @param {string} path - Path relative to extension root (e.g., './scripts/utils/settingsManager.js')
 * @returns {string} Absolute or root-relative URL
 */
export function resolvePath(path) {
    // Ensure path is treated as relative to the base if it starts with ./ or ../
    return new URL(path, baseUrl).href;
}

/**
 * Centralized import wrapper for Guided Generations.
 * Handles dynamic imports with standardized error logging.
 */
export async function safeImport(path, componentName) {
    try {
        // Always resolve relative paths against the extension root
        const finalPath = (path.startsWith('./') || path.startsWith('../')) 
            ? resolvePath(path) 
            : path;

        const module = await import(finalPath);
        return module;
    } catch (error) {
        debugError(`[${extensionName}] Failed to import ${componentName} from ${path} (resolved to ${resolvePath(path)}):`, error);
        return null;
    }
}
