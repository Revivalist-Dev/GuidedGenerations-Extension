// Import logging from the new logger util
import { debugLog, debugWarn, debugError } from '../utils/logger.js';

// Import managers
import { initializeRewriteManager } from './rewriteManager.js';
import { initializeButtonManager, updateExtensionButtons } from './buttonManager.js';
import { initializeInputAssistant } from '../inputAssistant.js';

/**
 * Main UI Initialization
 */
export async function initializeUI() {
    debugLog("Initializing UI Manager...");
    
    // Initialize Button Manager (Extension Buttons, Menus, QR Bar)
    await initializeButtonManager();
    
    // Initialize Rewrite Manager (Target Button, Rewrite Menu, etc.)
    await initializeRewriteManager();

    // Initialize Input Assistant
    await initializeInputAssistant();
    
    // Initial adjustment in case the panel is already open on load
    // adjustPopupPosition(); // Removed popup adjustment
}

// Re-export updateExtensionButtons so index.js or other modules can call it via uiManager if needed
export { updateExtensionButtons };
