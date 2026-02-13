import { getContext, extensionName, debugLog, getIsGuideGenerationInProgress } from './moduleManager.js';

/**
 * Event Manager for Guided Generations.
 * Centralizes SillyTavern event subscriptions to prevent redundant listeners.
 */

let isInitialized = false;


/**
 * Initializes all event listeners for the extension.
 */
export function initializeEventListeners() {
    if (isInitialized) return;

    const context = getContext();
    const eventSource = context.eventSource;
    const eventTypes = context.eventTypes;

    debugLog(`Registering SillyTavern event listeners.`);

    // Map events to handlers
    const eventHandlers = {
        [eventTypes.PROFILE_LOADED]: [handleProfileLoaded],
        [eventTypes.PRESET_CHANGED]: [handlePresetChanged],
    };

    for (const [eventName, handlers] of Object.entries(eventHandlers)) {
        if (!eventName || eventName === 'undefined') continue;
        
        eventSource.on(eventName, (...args) => {
            handlers.forEach(handler => handler(...args));
        });
    }

    isInitialized = true;
    debugLog(`Event Manager initialized.`);
}



function handleProfileLoaded(profileName) {
    debugLog(`Profile change detected: "${profileName}"`);
    window.dispatchEvent(new CustomEvent('gg-profile-changed', { detail: { profileName } }));
}

function handlePresetChanged(presetInfo) {
    debugLog(`Preset change detected:`, presetInfo);
    window.dispatchEvent(new CustomEvent('gg-preset-changed', { detail: { presetInfo } }));
}


