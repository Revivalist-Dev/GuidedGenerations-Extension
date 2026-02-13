/**
 * @file Centralized module management for Guided Generations.
 * Combines dynamic import handling and centralized export facades to prevent circular dependencies.
 */


import { debugLog, debugWarn, debugError, getDebugMessagesAsText, clearDebugMessages } from './logger.js';
import { defaultSettings } from './defaultSettings.js';
import { getContext } from '/scripts/extensions.js';
import { chat, saveChatConditional, addOneMessage, updateMessageBlock, redisplayChat } from '/script.js';
import { eventSource, event_types } from '/scripts/events.js';
import { extension_settings, extensionName, getImpersonateTemplate, getGuidedGenerationTargetMessageId } from '../../index.js';
import { getSettings, updateSetting } from './settingsManager.js';
import { loadSettingsPanel, updateSettingsUI, addSettingsEventListeners } from '../settingsPanel.js';
import { 
    getPreviousImpersonateInput,
    setPreviousImpersonateInput,
    popPreviousImpersonateInput,
    getLastImpersonateResult,
    setLastImpersonateResult,
    getIsGuideGenerationInProgress,
    setIsGuideGenerationInProgress
} from '../../index.js';
import * as presetUtils from './presetUtils.js';

// --- Import Management Logic ---

// Base URL detection for consistent path resolution (resolves to extension root)
const scriptUrl = document.currentScript?.src || import.meta.url;
const baseUrl = new URL('../../', scriptUrl).href;

/**
 * Resolves a path relative to the extension's root directory.
 * @param {string} path - Path relative to extension root (e.g., './scripts/utils/settingsManager.js')
 * @returns {string} Absolute or root-relative URL
 */
export function resolvePath(path) {
    // Ensure path is treated as relative to the base if it starts with ./ or ../
    return new URL(path, baseUrl).href;
}

/**
 * Centralized import wrapper for Guided Generations.
 * Handles dynamic imports with standardized error logging.
 */
export async function safeImport(path, componentName) {
    try {
        // Always resolve relative paths against the extension root
        const finalPath = (path.startsWith('./') || path.startsWith('../')) 
            ? resolvePath(path) 
            : path;

        const module = await import(finalPath);
        return module;
    } catch (error) {
        debugError(`[${extensionName}] Failed to import ${componentName} from ${path} (resolved to ${resolvePath(path)}):`, error);
        return null;
    }
}

// --- Export Management & Facades ---

export {
    getContext,
    extensionName,
    debugLog,
    debugWarn,
    debugError,
    extension_settings,
    defaultSettings,
    getDebugMessagesAsText,
    clearDebugMessages,
    getSettings,
    updateSetting,
    // Re-export from /script.js
    chat,
    saveChatConditional,
    addOneMessage,
    updateMessageBlock,
    redisplayChat,
    // Re-export from /scripts/events.js
    eventSource,
    event_types,
    // Re-export from settingsPanel.js
    loadSettingsPanel,
    updateSettingsUI,
    addSettingsEventListeners,
    // Re-export state from index.js
    getPreviousImpersonateInput,
    setPreviousImpersonateInput,
    popPreviousImpersonateInput,
    getLastImpersonateResult,
    setLastImpersonateResult,
    getIsGuideGenerationInProgress,
    setIsGuideGenerationInProgress,
    getImpersonateTemplate,
    getGuidedGenerationTargetMessageId
};

// --- Guide & Logic Facades ---
// These functions lazily load the implementation to avoid load-time circular dependencies.

// All persistent guides have been archived for re-implementation.


// --- Tool Facades ---

export const generateNewSwipe = async () => (await safeImport('./scripts/guidedSwipe.js', 'GuidedSwipe'))?.generateNewSwipe();
export const guidedCorrections = async () => (await safeImport('./scripts/guidedCorrections.js', 'GuidedCorrections'))?.guidedCorrections();



export const handleGuidedRewrite = async (mode, input, selectionInfo) => (await safeImport('./scripts/guidedRewrite.js', 'GuidedRewrite'))?.handleGuidedRewrite(mode, input, selectionInfo);
export const getSelectedTextInfo = async () => (await safeImport('./scripts/guidedRewrite.js', 'GuidedRewrite'))?.getSelectedTextInfo();


// --- Preset Utils Re-exports ---
export const handleSwitching = presetUtils.handleSwitching;
export const getProfileApiType = presetUtils.getProfileApiType;
export const getPresetsForApiType = presetUtils.getPresetsForApiType;
export const getCurrentProfile = presetUtils.getCurrentProfile;
export const getProfileList = presetUtils.getProfileList;
export const switchToProfile = presetUtils.switchToProfile;
export const switchToPreset = presetUtils.switchToPreset;
export const withProfile = presetUtils.withProfile;

/**
 * Returns the avatar URL for a given name, checking the main character and the user.
 * Assumes the name is the display name, which matches the name property of the character/user object.
 * @param {string} name - The name of the speaker.
 * @returns {string|null} The avatar URL or null if not found.
 */
export function getAvatarUrlForName(name) {
    const context = getContext();
    if (!context) {
        debugWarn('[Avatar] Context not available.');
        return null;
    }

    // Check main character
    if (context.character && context.character.name === name) {
        debugLog(`[Avatar] Found avatar for main character: ${context.character.avatar}`);
        // Return relative path to character's avatar
        return context.character.avatar || null;
    }

    // Check user
    // NOTE: context.user might not always exist or have an avatar in all ST setups, but we check anyway.
    if (context.user && context.user.name === name) {
        debugLog(`[Avatar] Found avatar for user: ${context.user.avatar}`);
        // Return relative path to user's avatar
        return context.user.avatar || null;
    }

    debugLog(`[Avatar] No avatar found for name: ${name}`);
    return null;
}

export const isGroupChat = () => !!getContext().groupId;

/**
 * Temporarily truncates the global chat array to limit context for AI generation.
 */
export function truncateChatForContext(targetIndex) {
    const limit = getSettings()?.contextMessageCount ?? 0;
    const fullBackup = [...chat];
    
    // Determine the slice we want to keep as context
    const start = (limit > 0) ? Math.max(0, targetIndex - limit + 1) : 0;
    const end = targetIndex + 1;
    const contextSlice = chat.slice(start, end);
    
    // The error "Message with id X not found" occurs because SillyTavern's UI components
    // (like the message list) often react to array changes or look up messages by index
    // while the truncation is active. If a tool or ST core logic tries to access 
    // chat[originalIndex] while chat is truncated, it fails.
    
    // We must ensure the chat array is RESTORED before ANY UI re-display or ST core logic 
    // that might depend on the full chat array runs.
    
    chat.splice(0, chat.length, ...contextSlice);
    
    debugLog(`[Context] Truncated chat for generation. Original length: ${fullBackup.length}, New length: ${chat.length}`);
    
    let isRestored = false;
    return () => {
        if (isRestored) return;
        
        // Find if new messages were added to the end of the truncated chat
        const newMessages = chat.slice(contextSlice.length);
        
        // Restore full chat plus any new messages
        chat.splice(0, chat.length, ...fullBackup, ...newMessages);
        
        isRestored = true;
        debugLog(`[Context] Restored chat. Length: ${chat.length}. Preserved ${newMessages.length} new messages.`);
    };
}


