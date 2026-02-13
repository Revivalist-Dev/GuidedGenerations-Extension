import { getContext, extension_settings } from '/scripts/extensions.js';
import { saveSettingsDebounced } from '/script.js';
import { defaultSettings } from './defaultSettings.js';
import { debugLog } from './logger.js';
import { extensionName } from '../../index.js';

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
        console.log(`[${extensionName}][DEBUG] Initializing settings with defaults.`);
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
 * Loads default templates from JSON files.
 */
export async function loadDefaultTemplates() {
    const templates = ['impersonateTemplates', 'rewriteTemplates', 'promptOverrides', 'inputAssistant'];
    const results = {};
    for (const template of templates) {
        try {
            const response = await fetch(`/scripts/extensions/third-party/${extensionName}/scripts/templates/${template}.json`);
            if (response.ok) {
                results[template] = await response.json();
            }
        } catch (error) {
            console.error(`Failed to load ${template}:`, error);
        }
    }
    return results;
}

/**
 * Asynchronously initializes settings by fetching JSON templates
 * and populating fields that are empty or require migration.
 */
export async function initializeSettings() {
    // 1. Ensure synchronous initialization happened
    const settings = getSettings();
    
    // 2. Fetch templates
    const templates = await loadDefaultTemplates();
    let madeChanges = false;

    const updateIfEmptyOrMigrate = (key, content, requireCoT = false) => {
        // Condition 1: Setting is missing or empty (init from JSON)
        if (!settings[key] || settings[key] === '') {
            debugLog(`[Settings] Initializing ${key} from JSON.`);
            settings[key] = content;
            madeChanges = true;
            return;
        }

        // Condition 2: Migration for CoT (Chain of Thought)
        // If the template requires CoT (contains [ANALYSIS]) but the user setting doesn't have it,
        // we force update it. This handles the fix for existing users.
        if (requireCoT && content.includes('[ANALYSIS]') && !settings[key].includes('[ANALYSIS]')) {
            debugLog(`[Settings] Migrating ${key} to CoT format (Analysis missing).`);
            settings[key] = content;
            madeChanges = true;
        }
    };

    // 3. Process Rewrite Templates
    if (templates.rewriteTemplates) {
        const mapping = {
            'rewrite': 'promptRewrite',
            'shorten': 'promptShorten',
            'expand': 'promptExpand',
            'instruct': 'promptInstruct'
        };

        for (const [id, key] of Object.entries(mapping)) {
            const t = templates.rewriteTemplates.find(t => t.id === id);
            if (t) {
                updateIfEmptyOrMigrate(key, t.content, true);
            }
        }
    }

    // 4. Process Prompt Overrides
    if (templates.promptOverrides) {
        const mapping = {
            'corrections': 'promptCorrections',
            'guidedResponse': 'promptGuidedResponse',
            'guidedSwipe': 'promptGuidedSwipe',
            'guidedContinue': 'promptGuidedContinue'
        };

        for (const [id, key] of Object.entries(mapping)) {
            const t = templates.promptOverrides.find(t => t.id === id);
            if (t) {
                // We don't enforce CoT migration for these yet, just init if empty
                updateIfEmptyOrMigrate(key, t.content, false);
            }
        }
    }

    // 5. Process Input Assistant Template
    if (templates.inputAssistant) {
        const mapping = {
            'input_assistant_default': 'promptInputAssistant'
        };

        for (const [id, key] of Object.entries(mapping)) {
            const t = templates.inputAssistant.find(t => t.id === id);
            if (t) {
                // CoT format not strictly required by default but handled if present
                updateIfEmptyOrMigrate(key, t.content, false);
            }
        }
    }

    // 6. Process Impersonate Template
    if (templates.impersonateTemplates) {
        const currentTemplateId = settings.impersonateTemplate || '1st';
        const t = templates.impersonateTemplates.find(t => t.id === currentTemplateId);
        if (t) {
            updateIfEmptyOrMigrate('promptImpersonate', t.content, false);
        }
    }

    if (madeChanges) {
        saveSettingsDebounced();
        debugLog('[Settings] Settings initialized and saved.');
    }
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
