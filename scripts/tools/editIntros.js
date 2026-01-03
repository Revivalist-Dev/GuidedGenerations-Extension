/**
 * Provides a tool to edit character intros with various formatting options using a popup UI
 * 
 * @returns {Promise<void>}
 */
import editIntrosPopup from './editIntrosPopup.js';

export default async function editIntros() {
    const extensionName = "GuidedGenerations-Extension";
    
    // Initialize and open the popup
    await editIntrosPopup.init();
    editIntrosPopup.open();
}

/**
 * Helper function to execute ST-Script commands
 * @param {string} stscript - The ST-Script command to execute
 */
function executeSTScript(stscript) {
    const extensionName = "GuidedGenerations-Extension";
    try {
        // Handle preset switching using PresetManager
        const presetValue = extension_settings[extensionName]?.presetEditIntros ?? '';
        let originalPresetId = null;
        let targetPresetId = null;
        
        if (presetValue) {
            try {
                const presetManager = getContext()?.getPresetManager?.();
                if (presetManager) {
                    const availablePresets = presetManager.getPresetList();
                    
                    // Check if it's a valid ID
                    const validPresetIds = availablePresets.map(p => p.id);
                    if (validPresetIds.includes(presetValue)) {
                        targetPresetId = presetValue;
                    } else {
                        // Check if it's a legacy name that matches a preset
                        const matchingPreset = availablePresets.find(p => p.name === presetValue);
                        if (matchingPreset) {
                            targetPresetId = matchingPreset.id;
                        } else {
                            console.warn(`${extensionName}: Preset '${presetValue}' not found in available presets. Skipping preset switch.`);
                        }
                    }
                    
                    if (targetPresetId) {
                        originalPresetId = presetManager.getSelectedPreset();
                        if (targetPresetId !== originalPresetId) {
                            presetManager.selectPreset(targetPresetId);
                        }
                    }
                }
            } catch (error) {
                console.error(`${extensionName}: Error switching preset for edit intros:`, error);
            }
        }

        // Use the context executeSlashCommandsWithOptions method
        if (typeof SillyTavern !== 'undefined' && typeof SillyTavern.getContext === 'function') {
            const context = SillyTavern.getContext();
            // Send the combined script via context
            context.executeSlashCommandsWithOptions(stscript);
        } else {
            console.error(`${extensionName}: SillyTavern.getContext function not found.`);
        }
    } catch (error) {
        console.error(`${extensionName}: Error executing ST-Script:`, error);
    }
}


