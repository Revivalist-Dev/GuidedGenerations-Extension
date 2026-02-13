import { getSettings } from './settingsManager.js';
import { extensionName } from '../../index.js';

let debugMessages = [];
const MAX_DEBUG_MESSAGES = 1000;

/**
 * Conditional logging utilities using the centralized settings.
 */
function addToDebugBuffer(level, ...args) {
    const timestamp = new Date().toLocaleTimeString();
    const message = args.map(arg => {
        try {
            return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
        } catch (e) {
            return '[Unserializable Object]';
        }
    }).join(' ');
    
    const formattedMsg = `[${level}] ${message}`;
    debugMessages.push(`${timestamp} ${formattedMsg}`);
    
    if (debugMessages.length > MAX_DEBUG_MESSAGES) {
        debugMessages.shift();
    }
}

export function debugLog(...args) {
    if (getSettings().debugMode) {
        console.log(`[${extensionName}][DEBUG]`, ...args);
    }
    addToDebugBuffer('DEBUG', ...args);
}

export function debugWarn(...args) {
    if (getSettings().debugMode) {
        console.warn(`[${extensionName}][WARN]`, ...args);
    }
    addToDebugBuffer('WARN', ...args);
}

export function debugError(...args) {
    if (getSettings().debugMode) {
        console.error(`[${extensionName}][ERROR]`, ...args);
    }
    addToDebugBuffer('ERROR', ...args);
}

export function getDebugMessagesAsText() {
    return debugMessages.join('\n');
}

export function clearDebugMessages() {
    debugMessages = [];
}


