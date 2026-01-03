import { getContext, extension_settings } from '/scripts/extensions.js';
import { saveSettingsDebounced } from '/script.js';
import { extensionName, defaultSettings } from './constants.js';
import { debugLog } from './logger.js';

/**
 * Centralized settings manager for the extension.
 * Ensures settings are initialized and provides a single source of truth.
 */

/**
 * Returns the current extension settings, initializing them if necessary.
 * @returns {Object} The extension settings object.
 */
export function getSettings() {
    if (!extension_settings[extensionName]) {
        debugLog(`Initializing settings with defaults.`);
        extension_settings[extensionName] = structuredClone(defaultSettings);
    } else {
        // Ensure all default keys exist (migration / update handling)
        for (const key in defaultSettings) {
            if (extension_settings[extensionName][key] === undefined) {
                extension_settings[extensionName][key] = defaultSettings[key];
            }
        }
    }
    return extension_settings[extensionName];
}

/**
 * Updates a specific setting and saves.
 * @param {string} key - Setting key
 * @param {any} value - New value
 */
export function updateSetting(key, value) {
    const settings = getSettings();
    settings[key] = value;
    saveSettingsDebounced();
}

/**
 * Migrates existing settings to include profile fields for backward compatibility
 */
export function migrateProfileSettings() {
    const settings = getSettings();
    
    // List of all preset keys that need corresponding profile keys
    const presetKeys = [
        'presetClothes', 'presetState', 'presetThinking', 'presetSituational', 'presetRules',
        'presetCustom', 'presetCorrections', 'presetSpellchecker', 'presetEditIntros',
        'presetImpersonate1st', 'presetImpersonate2nd', 'presetImpersonate3rd',
        'presetCustomAuto', 'presetFun'
    ];
    
    presetKeys.forEach(presetKey => {
        const profileKey = presetKey.replace('preset', 'profile');
        
        // If profile key doesn't exist but preset key does, set profile to empty (current profile)
        if (settings[presetKey] !== undefined && settings[profileKey] === undefined) {
            settings[profileKey] = '';
            debugLog(`Migrated ${profileKey} to empty (current profile) for backward compatibility`);
        }
    });
}
