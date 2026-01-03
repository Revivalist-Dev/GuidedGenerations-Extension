/**
 * @file Contains the logic for the Fun option in the Persistent Guides menu.
 */

import funPopup from '../tools/funPopup.js';

/**
 * Fun Functionality
 * Opens a popup with various fun prompts and interactions.
 */
async function funGuide() {
    try {
        // Ensure the popup is initialized (awaits if first time)
        await funPopup.init();

        // Open the popup
        funPopup.open();

    } catch (error) {
        console.error('[GuidedGenerations] Error in funGuide:', error);
        
        // Try to inform the user via echo if context is available
        try {
            const context = SillyTavern.getContext();
            if (context) {
                await context.executeSlashCommandsWithOptions('/echo Error opening fun prompts popup. |', { showOutput: true });
            }
        } catch (echoError) {
            console.error('[GuidedGenerations] Failed to echo error message:', echoError);
        }
    }
}

// Expose the function using default export for dynamic import
export default funGuide;


