import { eventSource, saveSettingsDebounced } from '/script.js';
import { getContext, loadExtensionSettings, extension_settings, renderExtensionTemplateAsync } from '/scripts/extensions.js';

// Centralized Utility Managers
import { getSettings, updateSetting, initializeSettings } from './scripts/utils/settingsManager.js';
import { initializeEventListeners } from './scripts/utils/eventManager.js';
import { safeImport } from './scripts/utils/moduleManager.js';

// Functional module imports
import { simpleSend } from './scripts/simpleSend.js';
import { recoverInput } from './scripts/inputRecovery.js';
import { guidedResponse } from './scripts/guidedResponse.js';
import { guidedSwipe } from './scripts/guidedSwipe.js';
import { guidedContinue, undoLastGuidedAddition, revertToOriginalGuidedContinue, initGuidedContinueListeners } from './scripts/guidedContinue.js';
import { guidedImpersonate } from './scripts/guidedImpersonate.js';
import { getPresetManager } from '/scripts/preset-manager.js';
import { loadSettingsPanel } from './scripts/settingsPanel.js';

import { getProfileList, handleGuidedRewrite } from './scripts/utils/moduleManager.js';

// Logging (now from logger.js)
import { debugLog, debugWarn, debugError, getDebugMessagesAsText, clearDebugMessages } from './scripts/utils/logger.js';

// Constants
export const extensionName = "GuidedGenerations-Extension";


// Shared State (Impersonation)
let previousImpersonateInputs = [];
let lastImpersonateResult = '';
let impersonateTemplates = [];
let isGuideGenerationInProgress = false;

// Re-export logging for compatibility
export { debugLog, debugWarn, debugError, getDebugMessagesAsText, clearDebugMessages };

export function getIsGuideGenerationInProgress() { return isGuideGenerationInProgress; }
export function setIsGuideGenerationInProgress(value) { isGuideGenerationInProgress = value; }

// Default Settings (imported to avoid duplication if we want, but keeping here for legacy compatibility)
import { defaultSettings } from './scripts/utils/defaultSettings.js';




/**
 * Load impersonate templates with dynamic path resolution.
 */
async function loadImpersonateTemplates() {
    try {
        const response = await fetch(`/scripts/extensions/third-party/${extensionName}/scripts/templates/impersonateTemplates.json`);
        if (response.ok) {
            impersonateTemplates = await response.json();
            debugLog(`Loaded ${impersonateTemplates.length} impersonate templates.`);
        } else {
            debugError(`Failed to load impersonate templates: ${response.statusText}`);
        }
    } catch (error) {
        debugError(`Error loading impersonate templates:`, error);
    }
}

export function getImpersonateTemplate(id) {
    return impersonateTemplates.find(t => t.id === id);
}

// --- SHARED STATE GETTERS/SETTERS ---
export function getPreviousImpersonateInput() {
    return previousImpersonateInputs.length > 0 ? previousImpersonateInputs[previousImpersonateInputs.length - 1] : '';
}
export function setPreviousImpersonateInput(value) {
    if (!value || !value.trim()) return;
    // Don't add if it's the same as the last one
    if (previousImpersonateInputs.length > 0 && previousImpersonateInputs[previousImpersonateInputs.length - 1] === value) return;
    
    previousImpersonateInputs.push(value);
    // Keep a reasonable limit
    if (previousImpersonateInputs.length > 50) {
        previousImpersonateInputs.shift();
    }
}
export function popPreviousImpersonateInput() {
    return previousImpersonateInputs.pop() || '';
}
export function getLastImpersonateResult() { return lastImpersonateResult; }
export function setLastImpersonateResult(value) { lastImpersonateResult = value; }

/**
 * Main Setup function
 */
async function setup() {
    debugLog(`[${extensionName}] Starting setup function.`);
    await initializeSettings();
    debugLog(`[${extensionName}] Loading impersonate templates...`);
    await loadImpersonateTemplates();
    debugLog(`[${extensionName}] Impersonate templates loaded.`);


    
    // Core UI Logic initialization
    debugLog(`[${extensionName}] Initializing UI Manager...`);
    const { initializeUI } = await safeImport('./scripts/ui/uiManager.js', 'UI Manager') || {};
    if (initializeUI) {
        await initializeUI();
        debugLog(`[${extensionName}] UI Manager initialized.`);
    } else {
        debugError("Failed to import UI Manager. Extension UI may not load correctly.");
    }
    
    debugLog(`[${extensionName}] Initializing Guided Continue Listeners...`);
    initGuidedContinueListeners();
    debugLog(`[${extensionName}] Guided Continue Listeners initialized.`);
    debugLog(`[${extensionName}] Initializing Event Listeners...`);
    initializeEventListeners(); // centralize all ST events
    debugLog(`[${extensionName}] Event Listeners initialized.`);
    


    // Auto-expanding edit textarea
    $(document).on('input focus', '#curEditTextarea', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        $(this).css('overflow-y', 'hidden');
    });

     // Load Settings Panel (delayed to ensure context)
    debugLog(`[${extensionName}] Loading settings panel...`);
    setTimeout(() => loadSettingsPanel(getContext()), 1000);
    debugLog(`[${extensionName}] Settings panel loading initiated.`);
}

/**
 * Message target state
 */
let guidedGenerationTargetMessageId = null;
export function setGuidedGenerationTargetMessageId(id) {
    $('.guided-generation-target').removeClass('guided-generation-target');
    $('.guided_target_button.active').removeClass('active');
    guidedGenerationTargetMessageId = id;
    if (id !== null) {
        const $targetRow = $(`#chat .mes`).filter((_, el) => el.getAttribute('mesid') == id);
        if ($targetRow.length) {
            $targetRow.addClass('guided-generation-target');
            $targetRow.find('.guided_target_button').addClass('active');
        }
    }
}
export function getGuidedGenerationTargetMessageId() {
    return guidedGenerationTargetMessageId;
}



$(document).ready(async function () {
    await setup();
});

// Expose to global for UI and ST compatibility
window.GuidedGenerations = {
    simpleSend,
    guidedSwipe,
    guidedContinue,
    undoLastGuidedAddition,
    revertToOriginalGuidedContinue,
    guidedResponse,
    guidedImpersonate,

    setGuidedGenerationTargetMessageId,
    getGuidedGenerationTargetMessageId
};

// Re-export for sub-modules
export { updateSettingsUI, addSettingsEventListeners } from './scripts/settingsPanel.js';
export { extension_settings };

