/**
 * @file Contains the logic for the Corrections tool.
 */
import { getContext, extension_settings, extensionName, debugLog, setPreviousImpersonateInput, generateNewSwipe, handleSwitching } from '../utils/exportManager.js';

// Helper function for delays (copied from guidedSwipe.js)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Provides a tool to modify the last message based on user's instructions
 * 
 * @returns {Promise<void>}
 */
export default async function corrections() {
    console.log('[GuidedGenerations][Corrections] Tool activated.');
    const textarea = document.getElementById('send_textarea');
    if (!textarea) {
        console.error('[GuidedGenerations][Corrections] Textarea #send_textarea not found.');
        return;
    }
    const originalInput = textarea.value; // Get current input

    // Save the input state using the shared function
    setPreviousImpersonateInput(originalInput);
    console.log(`[GuidedGenerations][Corrections] Original input saved: "${originalInput}"`);

    // Use user-defined corrections prompt override
    const isRaw = extension_settings[extensionName]?.rawPromptCorrections ?? false;
    const promptTemplate = extension_settings[extensionName]?.promptCorrections ?? '';
    const filledPrompt = promptTemplate.replace('{{input}}', originalInput);

    // Determine target profile and preset from settings
    const profileKey = 'profileCorrections';
    const presetKey = 'presetCorrections';
    const profileValue = extension_settings[extensionName]?.[profileKey] ?? '';
    const targetPreset = extension_settings[extensionName]?.[presetKey] ?? '';
    console.log(`[GuidedGenerations][Corrections] Using profile: ${profileValue || 'current'}, preset: ${targetPreset || 'none'}`);

    // Capture the original profile BEFORE any switching happens
    const context = getContext();
    let originalProfile = '';
    if (context && typeof context.executeSlashCommandsWithOptions === 'function') {
        try {
            // Get current profile before any switching
            const { getCurrentProfile } = await import('../utils/exportManager.js');
            originalProfile = await getCurrentProfile();
            debugLog(`[Corrections] Captured original profile before switching: "${originalProfile}"`);
        } catch (error) {
            debugLog(`[Corrections] Could not get original profile:`, error);
        }
    }

    // Handle profile and preset switching using unified utility
    const { switch: switchProfileAndPreset, restore } = await handleSwitching(profileValue, targetPreset, originalProfile);

    // --- Part 1: Execute STscript for Injections --- 
    const instructionInjection = isRaw ? filledPrompt : `[${filledPrompt}]`;
    const depth = extension_settings[extensionName]?.depthPromptCorrections ?? 0;
    const stscriptPart1 = `
        // Inject assistant message to rework and instructions|
        /inject id=msgtorework position=chat ephemeral=true scan=true depth=${depth} role=assistant {{lastMessage}}|
        // Inject instructions using user override prompt|
        /inject id=instruct position=chat ephemeral=true scan=true depth=${depth} ${instructionInjection}|
    `;
    
    try {
        console.log('[GuidedGenerations][Corrections] About to switch profile and preset...');
        
        // Switch profile and preset before executing
        await switchProfileAndPreset();
        
        console.log('[GuidedGenerations][Corrections] Profile and preset switch complete, executing STScript...');
        
        // Execute STScript Part 1 (Injections)
        console.log('[GuidedGenerations][Corrections] Executing STScript Part 1 (Injections)...');
        await executeSTScript(stscriptPart1); // Use the helper for STscript
        console.log('[GuidedGenerations][Corrections] STScript Part 1 executed.');

        // --- Part 2: Execute JS Swipe Logic --- 
        console.log('[GuidedGenerations][Corrections] Starting JS Swipe Logic...');
        const jQueryRef = (typeof $ !== 'undefined') ? $ : jQuery;
        if (!jQueryRef) {
            console.error("[GuidedGenerations][Corrections] jQuery not found.");
            alert("Corrections Tool Error: jQuery not available.");
            return; 
        }

        console.log("[GuidedGenerations][Corrections] Attempting to generate new swipe using generateNewSwipe()...");
        const swipeSuccess = await generateNewSwipe(); // Call the imported function

        if (swipeSuccess) {
            console.log("[GuidedGenerations][Corrections] generateNewSwipe() reported success.");
        } else {
            console.error("[GuidedGenerations][Corrections] generateNewSwipe() reported failure or an issue occurred.");
            // generateNewSwipe() itself often alerts on failure. If it throws, the main catch block will also alert.
        }

        console.log('[GuidedGenerations][Corrections] JS Swipe Logic finished.');

    } catch (error) {
        console.error("[GuidedGenerations][Corrections] Error during Corrections tool execution:", error);
        alert(`Corrections Tool Error: ${error.message || 'An unexpected error occurred.'}`);
    } finally {
        // Always restore the original profile and preset using utility restore function
        console.log('[GuidedGenerations][Corrections] Restoring original profile and preset...');
        await restore();
        console.log('[GuidedGenerations][Corrections] Profile restore complete');
        console.log('[GuidedGenerations][Corrections] Corrections tool finished.');
    }
}

/**
 * Helper function to execute ST-Script commands
 * @param {string} stscript - The ST-Script command to execute
 */
async function executeSTScript(stscript) { // Make helper async
    if (!stscript || stscript.trim() === '') {
        console.log('[GuidedGenerations][Corrections] executeSTScript: No script provided, skipping.');
        return;
    }
    try {
        // Use the context executeSlashCommandsWithOptions method
        const context = getContext(); // Get context via imported function
        // Send the combined script via context
        console.log(`[GuidedGenerations][Corrections] Executing STScript: ${stscript}`);
        await context.executeSlashCommandsWithOptions(stscript);
        console.log(`${extensionName}: Corrections ST-Script executed successfully.`);
    } catch (error) {
        console.error(`${extensionName}: Corrections Error executing ST-Script:`, error);
         // Optional: Re-throw or handle differently if needed
    }
}

// Export the function
export { corrections };
