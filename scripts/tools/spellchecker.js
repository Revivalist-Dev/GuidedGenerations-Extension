/**
 * @file Contains the logic for the Spellcheck tool.
 */
import { getContext, extension_settings, extensionName, debugLog, handleSwitching } from '../utils/moduleManager.js';

const spellchecker = async () => {
    const textarea = document.getElementById('send_textarea');
    if (!textarea) {
        console.error('[GuidedGenerations] Textarea #send_textarea not found.');
        return;
    }
    const currentInputText = textarea.value;
    
    // Capture the original profile BEFORE any switching happens
    const context = getContext();
    let originalProfile = '';
    if (context && typeof context.executeSlashCommandsWithOptions === 'function') {
        try {
            // Get current profile before any switching
            const { getCurrentProfile } = await import('../utils/moduleManager.js');
            originalProfile = await getCurrentProfile();
            debugLog(`[Spellchecker] Captured original profile before switching: "${originalProfile}"`);
        } catch (error) {
            debugLog(`[Spellchecker] Could not get original profile:`, error);
        }
    }

    // Handle profile and preset switching using unified utility
    const profileKey = 'profileSpellchecker';
    const presetKey = 'presetSpellchecker';
    const profileValue = extension_settings[extensionName]?.[profileKey] ?? '';
    const presetValue = extension_settings[extensionName]?.[presetKey] ?? '';
    
    debugLog(`[Spellchecker] Using profile: ${profileValue || 'current'}, preset: ${presetValue || 'none'}`);
    
    const { switch: switchProfileAndPreset, restore } = await handleSwitching(profileValue, presetValue, originalProfile);

    // Use user-defined spellchecker prompt override
    const promptTemplate = extension_settings[extensionName]?.promptSpellchecker ?? '';
    const filledPrompt = promptTemplate.replace('{{input}}', currentInputText);

    // Build STScript without preset switching
    const stscriptCommand = `/genraw ${filledPrompt} |`;
    const fullScript = `// Spellchecker guide|\n${stscriptCommand}`;

    try {
        const context = getContext();
        if (typeof context.executeSlashCommandsWithOptions === 'function') {
            debugLog('[Spellchecker] About to switch profile and preset...');
            
            // Switch profile and preset before executing
            await switchProfileAndPreset();
            
            debugLog('[Spellchecker] Profile and preset switch complete, about to execute STScript...');
            
            // Execute the command and wait for it to complete
            const result = await context.executeSlashCommandsWithOptions(fullScript, {
                showOutput: false,
                handleExecutionErrors: true
            });
            
            debugLog('[Spellchecker] STScript execution complete, about to restore profile...');
            
            // After completion, paste the corrected result back into the input textarea
            if (result && result.pipe != null && result.pipe !== '') {
                debugLog('[Spellchecker] Got corrected result from /genraw, pasting into textarea:', result.pipe);
                textarea.value = result.pipe;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                debugLog('[Spellchecker] Corrected result pasted into textarea successfully');
            } else {
                debugLog('[Spellchecker] No result from /genraw command, textarea unchanged');
            }
            
            // After completion, restore original profile and preset using utility restore function
            await restore();
            
            debugLog('[Spellchecker] Profile restore complete');

        } else {
            console.error('[GuidedGenerations] context.executeSlashCommandsWithOptions not found!');
        }
    } catch (error) {
        console.error(`[GuidedGenerations] Error executing Spellchecker stscript: ${error}`);
        
        debugLog('[Spellchecker] Error occurred, about to restore profile...');
        
        // Restore original profile and preset on error
        await restore();
        
        debugLog('[Spellchecker] Profile restore complete after error');
    }
};

// Export the function
export { spellchecker };




