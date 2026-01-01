/**
 * @file Central import/export hub for all GuidedGenerations extension modules.
 * This file serves as a single point of entry for all imports, eliminating path depth issues.
 */

// External dependencies (SillyTavern)
import { getContext, extension_settings, renderExtensionTemplateAsync } from '../../../../../extensions.js';
import { chat, eventSource, event_types, saveChatConditional, addOneMessage } from '../../../../../../script.js';

// Core extension constants and functions (defined locally to avoid circular dependency)
const extensionName = "GuidedGenerations-Extension";

// Conditional logging utility that only logs when debug mode is enabled
function debugLog(...args) {
    if (extension_settings[extensionName]?.debugMode) {
        console.log(`[${extensionName}][DEBUG]`, ...args);
    }
}

// Conditional warning utility that only logs when debug mode is enabled
function debugWarn(...args) {
    if (extension_settings[extensionName]?.debugMode) {
        console.warn(`[${extensionName}][DEBUG]`, ...args);
    }
}

// Shared state functions for impersonate input management
let previousImpersonateInput = '';
let lastImpersonateResult = '';

function setPreviousImpersonateInput(input) {
    previousImpersonateInput = input;
}

function getPreviousImpersonateInput() {
    return previousImpersonateInput;
}

function setLastImpersonateResult(result) {
    lastImpersonateResult = result;
}

function getLastImpersonateResult() {
    return lastImpersonateResult;
}

/**
 * Temporarily truncates the global chat array to limit context for AI generation.
 * @param {number} targetIndex The index of the message to treat as the "last" message.
 * @returns {Function} A function to restore the chat to its original state.
 */
function truncateChatForContext(targetIndex) {
    const limit = extension_settings[extensionName]?.contextMessageCount ?? 0;
    const fullBackup = [...chat];
    
    // Determine the slice we want to keep as context
    const start = (limit > 0) ? Math.max(0, targetIndex - limit + 1) : 0;
    const end = targetIndex + 1;
    const contextSlice = chat.slice(start, end);
    
    // Modify global chat array in place
    chat.length = 0;
    chat.push(...contextSlice);
    
    debugLog(`[Context] Truncated chat for generation. Original length: ${fullBackup.length}, Context start: ${start}, Target index: ${targetIndex}, New length: ${chat.length}`);
    
    return () => {
        chat.length = 0;
        chat.push(...fullBackup);
        debugLog(`[Context] Restored chat. Length: ${chat.length}`);
    };
}

// Group chat detection function
function isGroupChat() {
    const context = getContext();
    return context && context.groupId && context.groups;
}

// Settings management functions - imported from index.js
import { loadSettings, updateSettingsUI, addSettingsEventListeners, debugProfileSystem, getDebugMessages, clearDebugMessages, getDebugMessagesAsText, debugError } from '../../index.js';

// Default settings object
const defaultSettings = {
    autoTriggerClothes: false,
    autoTriggerState: false,
    autoTriggerThinking: false,
    enableAutoCustomAutoGuide: false,
    showImpersonate: true,
    showGuidedContinue: false,
    showGuidedResponse: true,
    showGuidedSwipe: true,
    showSimpleSendButton: false,
    showRecoverInputButton: false,
    showEditIntrosButton: false,
    showCorrectionsButton: false,
    showSpellcheckerButton: false,
    showClearInputButton: false,
    showUndoButton: false,
    showRevertButton: false,
    integrateQrBar: true,
    debugMode: false,
    injectionEndRole: 'system',
    profileRewrite: '',
    presetRewrite: '',
    promptRewrite: '[INST]Rewrite this section of text: """{{rewrite}}""" while keeping the same content, general style and length. Do not list alternatives and only print the result without prefix or suffix.[/INST]',
    promptShorten: '[INST]Rewrite this section of text: """{{rewrite}}""" while keeping the same content, general style. Do not list alternatives and only print the result without prefix or suffix. Shorten it by roughly 20%.[/INST]',
    promptExpand: '[INST]Rewrite this section of text: """{{rewrite}}""" while keeping the same content, general style. Do not list alternatives and only print the result without prefix or suffix. Lengthen it by roughly 20%.[/INST]',
    promptCustom: '[INST]Rewrite this section of text: """{{rewrite}}""" according to the following instructions: "{{input}}". Keep the general style. Do not list alternatives and only print the result without prefix or suffix.[/INST]',
    highlightDuration: 3000
};

// Utility functions
import { handleSwitching, getProfileApiType, getPresetsForApiType, getCurrentProfile, getProfileList, switchToProfile, switchToPreset, withProfile, getConnectApiMap, initializeEventListeners, extractApiIdFromApiType } from '../utils/presetUtils.js';

// Guide functions
import situationalGuide from './situationalGuide.js';
import thinkingGuide from './thinkingGuide.js';
import clothesGuide from './clothesGuide.js';
import stateGuide from './stateGuide.js';
import rulesGuide from './rulesGuide.js';
import customGuide from './customGuide.js';
import customAutoGuide from './customAutoGuide.js';
import editGuides from './editGuides.js';
import showGuides from './showGuides.js';
import flushGuides from './flushGuides.js';
import funGuide from './funGuide.js';
import trackerGuide from './trackerGuide.js';
import { executeTracker, checkAndExecuteTracker, createTrackerNote } from './trackerLogic.js';
import { runGuideScript } from './runGuide.js';

// Tool functions
import { corrections } from '../tools/corrections.js';
import { spellchecker } from '../tools/spellchecker.js';
import editIntros from '../tools/editIntros.js';
import clearInput from '../tools/clearInput.js';
import { handleGuidedRewrite } from '../guidedRewrite.js';

// Main script functions
import { guidedSwipe, generateNewSwipe } from '../guidedSwipe.js';
import { guidedContinue, initGuidedContinueListeners, undoLastGuidedAddition, revertToOriginalGuidedContinue } from '../guidedContinue.js';
import { guidedResponse } from '../guidedResponse.js';
import { guidedImpersonate } from '../guidedImpersonate.js';
import { simpleSend } from '../simpleSend.js';
import { recoverInput } from '../inputRecovery.js';
import { loadSettingsPanel } from '../settingsPanel.js';

// Export everything
export {
    // Context and settings
    getContext,
    extension_settings,
    extensionName,
    debugLog,
    debugWarn,
    debugError,
    
    // SillyTavern dependencies
    chat,
    eventSource,
    event_types,
    saveChatConditional,
    addOneMessage,
    renderExtensionTemplateAsync,
    
    // Context handling
    truncateChatForContext,
    
    // Utility functions
    handleSwitching,
    getProfileApiType,
    getPresetsForApiType,
    getCurrentProfile,
    getProfileList,
    switchToProfile,
    switchToPreset,
    withProfile,
    getConnectApiMap,
    initializeEventListeners,
    extractApiIdFromApiType,
    
    // Guides
    runGuideScript,
    clothesGuide,
    stateGuide,
    thinkingGuide,
    situationalGuide,
    rulesGuide,
    customGuide,
    customAutoGuide,
    trackerGuide,
    executeTracker,
    checkAndExecuteTracker,
    createTrackerNote,
    funGuide,
    flushGuides,
    showGuides,
    editGuides,
    
    // Tools
    clearInput,
    corrections,
    editIntros,
    spellchecker,
    handleGuidedRewrite,
    
    // Main script functions
    guidedSwipe,
    generateNewSwipe,
    guidedContinue,
    initGuidedContinueListeners,
    undoLastGuidedAddition,
    revertToOriginalGuidedContinue,
    guidedResponse,
    guidedImpersonate,
    simpleSend,
    recoverInput,
    loadSettingsPanel,
    
    // Settings and other
    loadSettings,
    updateSettingsUI,
    addSettingsEventListeners,
    debugProfileSystem,
    defaultSettings,
    isGroupChat,
    setPreviousImpersonateInput,
    getPreviousImpersonateInput,
    setLastImpersonateResult,
    getLastImpersonateResult,
    
    // Debug logging functions
    getDebugMessages,
    clearDebugMessages,
    getDebugMessagesAsText,
};
