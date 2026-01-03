/**
 * @file Central import/export hub for all GuidedGenerations extension modules.
 * Refactored to act as a Facade for internal logic, preventing circular dependencies.
 */

// Core imports from centralized managers
import { getContext } from '/scripts/extensions.js';
import { chat, saveChatConditional, addOneMessage, updateMessageBlock, redisplayChat } from '/script.js'; // Added updateMessageBlock and redisplayChat
import { eventSource, event_types } from '/scripts/events.js';
import { extensionName, defaultSettings } from './constants.js';
import { 
    debugLog, 
    debugWarn, 
    debugError,
    getDebugMessagesAsText, 
    clearDebugMessages 
} from './logger.js';
import { extension_settings } from '../../index.js'; // Keep for now as it might be initialized there, or consider moving to settingsManager if it holds the state
import { getSettings, updateSetting } from '../utils/settingsManager.js';
import { safeImport } from '../utils/importManager.js';
import { loadSettingsPanel, loadSettings, updateSettingsUI, addSettingsEventListeners } from '../settingsPanel.js';

// Re-export context utilities
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
    updateMessageBlock, // Re-exported
    redisplayChat,      // Re-exported
    // Re-export from /scripts/events.js
    eventSource,
    event_types,
    // Re-export from settingsPanel.js
    loadSettingsPanel,
    loadSettings,
    updateSettingsUI,
    addSettingsEventListeners
};

/**
 * Shared state functions for impersonate input management
 * (Migrated from index.old logic)
 */
import { 
    getPreviousImpersonateInput, 
    setPreviousImpersonateInput, 
    getLastImpersonateResult, 
    setLastImpersonateResult 
} from '../../index.js';

export {
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
// These are stateless utility functions, safe to re-export directly if module side-effects are managed.
import * as presetUtils from '../utils/presetUtils.js';

export const handleSwitching = presetUtils.handleSwitching;
export const getProfileApiType = presetUtils.getProfileApiType;
export const getPresetsForApiType = presetUtils.getPresetsForApiType;
export const getCurrentProfile = presetUtils.getCurrentProfile;
export const getProfileList = presetUtils.getProfileList;
export const switchToProfile = presetUtils.switchToProfile;
export const switchToPreset = presetUtils.switchToPreset;
export const withProfile = presetUtils.withProfile;



export const isGroupChat = () => !!getContext().groupId;



// --- Helper Functions ---

/**
 * Temporarily truncates the global chat array to limit context for AI generation.
 * (Moved here or imported from a utils file if preferred, keeping for compatibility)
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
