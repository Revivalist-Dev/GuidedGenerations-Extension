import { getContext } from '/scripts/extensions.js';
import { extensionName } from './utils/constants.js';
import { debugLog } from './utils/logger.js';
import { getSettings } from './utils/settingsManager.js';
import { handleSwitching, chat, saveChatConditional, updateMessageBlock } from './utils/exportManager.js';
import { getTokenCountAsync } from '/scripts/tokenizers.js';

// --- Global State ---
let rewriteHistory = {}; // Stores history of rewrites per message for undo

/**
 * Decoupled Rewrite Logic
 */
export async function performRewrite(mode, selectionInfo, customInput = '') {
    const { mesId, swipeId, selectedText, fullMessage } = selectionInfo;
    const settings = getSettings();
    const context = getContext();

    // 1. Prepare Prompt
    let promptTemplate = '';
    switch (mode) {
        case 'Rewrite': promptTemplate = settings.promptRewrite; break;
        case 'Shorten': promptTemplate = settings.promptShorten; break;
        case 'Expand': promptTemplate = settings.promptExpand; break;
        case 'Custom': promptTemplate = settings.promptCustom; break;
        default: promptTemplate = settings.promptRewrite;
    }

    let finalPrompt = promptTemplate.replace('{{rewrite}}', selectedText);
    let instruction = '';
    if (mode === 'Custom') {
        // If customInput is provided (e.g. from textarea), use it.
        // Otherwise, try to find the textarea and get the value.
        instruction = customInput;
        if (!instruction) {
            const textarea = document.getElementById('send_textarea');
            if (textarea) {
                instruction = textarea.value;
            }
        }
        
        if (!instruction) {
            debugLog(`[${extensionName}] Custom rewrite aborted: No instruction provided.`);
            return { success: false, error: "No instruction provided" };
        }

        finalPrompt = finalPrompt.replace('{{input}}', instruction);
    }

    // --- TOKEN COUNTING (INPUT) ---
    const inputTokens = await getTokenCountAsync(instruction || selectedText);
    debugLog(`Input Token Count (${mode}): ${inputTokens}`);

    // 2. Handle Profile Switching
    const profileValue = settings.profileRewrite?.trim() || '';
    const presetValue = settings.presetRewrite?.trim() || '';
    
    // Switch profile/preset if configured
    const { switch: switchPreset, restore } = await handleSwitching(profileValue || null, presetValue || null);
    if (profileValue || presetValue) await switchPreset();

    let resultText = '';
    try {
        // 3. Generate
        resultText = await context.generateRaw({
            prompt: finalPrompt,
            max_tokens: settings.maxRewriteTokens || 500,
        });

        if (resultText) {
            // --- TOKEN COUNTING (OUTPUT) ---
            const outputTokens = await getTokenCountAsync(resultText);
            debugLog(`Output Token Count (${mode}): ${outputTokens}`);

            // 4. Construct New Message
            // Robust Replacement Logic:
            // 1. Try exact replacement first
            let newMessage = fullMessage.replace(selectedText, resultText); 
            
            // 2. If exact replacement fails, try trimmed replacement
            if (newMessage === fullMessage) {
                 const trimmedSelection = selectedText.trim();
                 newMessage = fullMessage.replace(trimmedSelection, resultText);
            }

            // 3. If trimmed replacement fails, try finding unique occurrence ignoring whitespace
            if (newMessage === fullMessage) {
                // Escape special regex chars
                const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
                // Create a pattern that allows flexible whitespace between words
                const flexiblePattern = escapeRegExp(selectedText.trim()).replace(/\s+/g, '\\s+');
                const regex = new RegExp(flexiblePattern);
                newMessage = fullMessage.replace(regex, resultText);
            }

            return { success: true, newMessage, resultText };
        }
    } catch (err) {
        console.error(`[${extensionName}] Rewrite generation failed:`, err);
        return { success: false, error: err };
    } finally {
        if (profileValue || presetValue) await restore();
    }
    return { success: false };
}


/**
 * Main Entry Point (UI Handler)
 */
export async function handleGuidedRewrite(mode, customInput = '', selectionInfo = null) {
    if (!selectionInfo) {
        selectionInfo = getSelectedTextInfo();
    }
    
    if (!selectionInfo) {
        debugLog(`[${extensionName}] Rewrite aborted: No valid selection info.`);
        return;
    }

    // UI: Show Placeholder
    const placeholder = createStreamingPlaceholder(selectionInfo);

    // Logic: Perform Rewrite
    const result = await performRewrite(mode, selectionInfo, customInput);

    if (result.success) {
        // UI: Update Placeholder & Save
        updateStreamingPlaceholder(placeholder, result.resultText);
        
        applyRewriteChange(selectionInfo, result.newMessage, result.resultText);
    } else {
        // UI: Revert
        revertStreamingPlaceholder(placeholder, selectionInfo.selectedText);
    }
}


/**
 * Applies the change to the chat and saves history
 */
function applyRewriteChange(selectionInfo, newMessage, resultText) {
    const { mesId, swipeId, fullMessage } = selectionInfo;
    const settings = getSettings();

    // Save History
    saveRewriteChange(mesId, swipeId, fullMessage, newMessage);

    // Update Chat Object
    chat[mesId].mes = newMessage;
    if (chat[mesId].swipes && chat[mesId].swipes[swipeId] !== undefined) {
        chat[mesId].swipes[swipeId] = newMessage;
    }

    // 4. Update UI
    try {
        updateMessageBlock(mesId, chat[mesId]);
    } catch (e) {
        debugError(`[${extensionName}] updateMessageBlock failed:`, e);
    }
    
    // Save the chat after visual update
    saveChatConditional();
}


// --- DOM Helpers ---

export function getSelectedTextInfo() {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return null;

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    
    // Find parent message div
    const mesDiv = container.nodeType === 1 ? container.closest('.mes') : container.parentElement.closest('.mes');
    if (!mesDiv) return null;

    const mesId = mesDiv.getAttribute('mesid');
    
    // Get chat data
    const context = getContext();
    const messageData = chat[mesId];
    if (!messageData) return null;
    
    // Current swipe handling
    let swipeId = messageData.swipe_id !== undefined ? messageData.swipe_id : 0;
    const fullMessage = messageData.mes;
    const selectedText = selection.toString();

    return {
        mesId,
        swipeId,
        selectedText,
        fullMessage,
        rawStartOffset: -1, // Not used for replacement, but kept for compatibility
        rawEndOffset: -1,   // Not used for replacement, but kept for compatibility
        domRange: range.cloneRange() // Keep a reference to the DOM range for placeholder insertion if immediate
    };
}

function createStreamingPlaceholder(selectionInfo) {
    // Try to use preserved DOM range if available and still valid
    let range = selectionInfo.domRange;
    
    // Fallback to finding text if range is invalid (detached)
    if (!range || range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE && !document.contains(range.commonAncestorContainer)) {
         // Attempt to find the text again in the message div
         // This is a "best effort" recovery if the DOM changed significantly
         const mesDiv = document.querySelector(`.mes[mesid="${selectionInfo.mesId}"] .mes_text`);
         if (mesDiv) {
             // Simple text search - risky if text appears multiple times, but better than nothing
             // In a robust implementation, we might walk the tree.
             // For now, if we can't trust the range, we skip the placeholder to avoid destroying the wrong text
             debugLog(`[${extensionName}] createStreamingPlaceholder: DOM range invalid, skipping placeholder to allow background rewrite.`);
             return null;
         }
         return null;
    }

    try {
        range.deleteContents();
        
        const span = document.createElement('span');
        span.className = 'animated-highlight';
        span.textContent = '...'; 
        range.insertNode(span);
        
        // Clear selection to avoid interference
        const selection = window.getSelection();
        if (selection) selection.removeAllRanges();
        
        return span;
    } catch (e) {
        debugLog(`[${extensionName}] createStreamingPlaceholder: Failed to manipulate range.`, e);
        return null;
    }
}

function updateStreamingPlaceholder(span, text) {
    if (span) span.textContent = text;
}

function revertStreamingPlaceholder(span, originalText) {
    if (span && span.parentNode) {
        span.outerHTML = originalText;
    }
}


// --- Undo Logic ---

function saveRewriteChange(mesId, swipeId, oldContent, newContent) {
    if (!rewriteHistory[mesId]) {
        rewriteHistory[mesId] = [];
    }
    
    rewriteHistory[mesId].push({
        swipeId: swipeId,
        oldContent: oldContent,
        newContent: newContent,
        timestamp: Date.now()
    });

    // Show undo button
    const undoBtn = document.querySelector(`.mes[mesid="${mesId}"] .guided_undo_rewrite_button`);
    if (undoBtn) undoBtn.style.display = 'inline-block';
}

export function undoRewrite(mesId) {
    if (!rewriteHistory[mesId] || rewriteHistory[mesId].length === 0) return;

    const lastChange = rewriteHistory[mesId].pop();
    
    // Revert content in chat object
    chat[mesId].mes = lastChange.oldContent;
    if (chat[mesId].swipes && chat[mesId].swipes[lastChange.swipeId] !== undefined) {
        chat[mesId].swipes[lastChange.swipeId] = lastChange.oldContent;
    }

    // Update UI
    updateMessageBlock(mesId, chat[mesId]);
    
    saveChatConditional();

    // Hide button if empty
    if (rewriteHistory[mesId].length === 0) {
        const undoBtn = document.querySelector(`.mes[mesid="${mesId}"] .guided_undo_rewrite_button`);
        if (undoBtn) undoBtn.style.display = 'none';
    }
}

export function initRewriteUndo() {
    if (!window.GuidedGenerations) window.GuidedGenerations = {};
    window.GuidedGenerations.saveRewriteChange = saveRewriteChange;
    window.GuidedGenerations.undoRewrite = undoRewrite;
}
