/**
 * @file Centralized module management for Guided Generations.
 * Combines dynamic import handling and centralized export facades to prevent circular dependencies.
 */

import { extensionName, defaultSettings } from './constants.js';
import { debugLog, debugWarn, debugError, getDebugMessagesAsText, clearDebugMessages } from './logger.js';
import { getContext } from '/scripts/extensions.js';
import { chat, saveChatConditional, addOneMessage, updateMessageBlock, redisplayChat } from '/script.js';
import { eventSource, event_types } from '/scripts/events.js';
import { extension_settings } from '../../index.js';
import { getSettings, updateSetting } from './settingsManager.js';
import { loadSettingsPanel, loadSettings, updateSettingsUI, addSettingsEventListeners } from '../settingsPanel.js';
import { 
    getPreviousImpersonateInput, 
    setPreviousImpersonateInput, 
    getLastImpersonateResult, 
    setLastImpersonateResult 
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
    loadSettings,
    updateSettingsUI,
    addSettingsEventListeners,
    // Re-export state from index.js
    getPreviousImpersonateInput,
    setPreviousImpersonateInput,
    getLastImpersonateResult,
    setLastImpersonateResult
};

// --- Guide & Logic Facades ---
// These functions lazily load the implementation to avoid load-time circular dependencies.

export const clothesGuide = async (isAuto) => (await safeImport('./scripts/persistentGuides/clothesGuide.js', 'ClothesGuide'))?.default(isAuto);
export const stateGuide = async (isAuto) => (await safeImport('./scripts/persistentGuides/stateGuide.js', 'StateGuide'))?.default(isAuto);
export const thinkingGuide = async (isAuto) => (await safeImport('./scripts/persistentGuides/thinkingGuide.js', 'ThinkingGuide'))?.default(isAuto);
export const situationalGuide = async () => (await safeImport('./scripts/persistentGuides/situationalGuide.js', 'SituationalGuide'))?.default();
export const rulesGuide = async () => (await safeImport('./scripts/persistentGuides/rulesGuide.js', 'RulesGuide'))?.default();
export const customGuide = async () => (await safeImport('./scripts/persistentGuides/customGuide.js', 'CustomGuide'))?.default();
export const customAutoGuide = async (isAuto) => (await safeImport('./scripts/persistentGuides/customAutoGuide.js', 'CustomAutoGuide'))?.default(isAuto);
export const funGuide = async () => (await safeImport('./scripts/persistentGuides/funGuide.js', 'FunGuide'))?.default();

export const executeTracker = async (trackerId) => (await safeImport('./scripts/persistentGuides/trackerLogic.js', 'TrackerLogic'))?.executeTracker(trackerId);
export const checkAndExecuteTracker = async () => (await safeImport('./scripts/persistentGuides/trackerLogic.js', 'TrackerLogic'))?.checkAndExecuteTracker();
export const createTrackerNote = async () => (await safeImport('./scripts/persistentGuides/trackerLogic.js', 'TrackerLogic'))?.createTrackerNote();

export const flushGuides = async () => (await safeImport('./scripts/persistentGuides/flushGuides.js', 'FlushGuides'))?.default();
export const showGuides = async () => (await safeImport('./scripts/persistentGuides/showGuides.js', 'ShowGuides'))?.default();
export const editGuides = async () => (await safeImport('./scripts/persistentGuides/editGuides.js', 'EditGuides'))?.default();


// --- Tool Facades ---

export const clearInput = async () => (await safeImport('./scripts/tools/clearInput.js', 'ClearInput'))?.default();
export const corrections = async () => (await safeImport('./scripts/tools/corrections.js', 'Corrections'))?.corrections();
export const editIntros = async () => (await safeImport('./scripts/tools/editIntros.js', 'EditIntros'))?.default();
export const spellchecker = async () => (await safeImport('./scripts/tools/spellchecker.js', 'Spellchecker'))?.spellchecker();

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
    
    // Modify global chat array in place
    chat.length = 0;
    chat.push(...contextSlice);
    
    debugLog(`[Context] Truncated chat for generation. Original length: ${fullBackup.length}, New length: ${chat.length}`);
    
    return () => {
        chat.length = 0;
        chat.push(...fullBackup);
        debugLog(`[Context] Restored chat. Length: ${chat.length}`);
    };
}


