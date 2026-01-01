import { getContext } from '/scripts/extensions.js';
import { extensionName, debugLog, handleAutoTrigger } from '../../index.js';

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
        [eventTypes.CHAT_CHANGED]: [reapplyTargetVisuals, updateCounter],
        [eventTypes.CHARACTER_MESSAGE_RENDERED]: [reapplyTargetVisuals, updateCounter],
        [eventTypes.USER_MESSAGE_RENDERED]: [reapplyTargetVisuals, updateCounter],
        [eventTypes.APP_READY]: [updateCounter],
        [eventTypes.CHAT_CREATED]: [updateCounter],
        [eventTypes.WORLD_INFO_ACTIVATED]: [updateCounter],
        [eventTypes.GENERATION_STARTED]: [updateCounter],
        [eventTypes.GENERATION_ENDED]: [updateCounter],
        [eventTypes.GENERATION_STOPPED]: [updateCounter],
        [eventTypes.GENERATION_AFTER_COMMANDS]: [handleGenerationAfterCommands, updateCounter],
        [eventTypes.CONNECTION_PROFILE_LOADED]: [handleProfileLoaded, updateCounter],
        [eventTypes.PRESET_CHANGED]: [handlePresetChanged, updateCounter],
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

async function updateCounter() {
    if (window.GuidedGenerations?.updatePersistentGuideCounter) {
        window.GuidedGenerations.updatePersistentGuideCounter();
    }
}

function reapplyTargetVisuals() {
    if (window.GuidedGenerations?.getGuidedGenerationTargetMessageId) {
        const targetId = window.GuidedGenerations.getGuidedGenerationTargetMessageId();
        if (targetId) {
            window.GuidedGenerations.setGuidedGenerationTargetMessageId(targetId);
        }
    }
}

async function handleGenerationAfterCommands(type, generateArgsObject, dryRun) {
    await handleAutoTrigger(type, generateArgsObject, dryRun);
}

function handleProfileLoaded(profileName) {
    debugLog(`Profile change detected: "${profileName}"`);
    window.dispatchEvent(new CustomEvent('gg-profile-changed', { detail: { profileName } }));
}

function handlePresetChanged(presetInfo) {
    debugLog(`Preset change detected:`, presetInfo);
    window.dispatchEvent(new CustomEvent('gg-preset-changed', { detail: { presetInfo } }));
}
