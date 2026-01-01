import { getContext } from '/scripts/extensions.js';
import { extensionName, debugLog } from '../index.js';
import { getSettings } from './utils/settingsManager.js';
import { handleSwitching } from './utils/exportManager.js';

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
    if (mode === 'Custom') {
        finalPrompt = finalPrompt.replace('{{input}}', customInput);
    }

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
            // 4. Construct New Message
            const rawStartOffset = selectionInfo.rawStartOffset;
            const rawEndOffset = selectionInfo.rawEndOffset;

            const newMessage = 
                fullMessage.substring(0, rawStartOffset) +
                resultText +
                fullMessage.substring(rawEndOffset);

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
export async function handleGuidedRewrite(mode, customInput = '') {
    const selectionInfo = getSelectedTextInfo();
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
    const context = getContext();
    const chat = context.chat;
    const settings = getSettings();

    // Save History
    saveRewriteChange(mesId, swipeId, fullMessage, newMessage);

    // Update Chat Object
    chat[mesId].mes = newMessage;
    if (chat[mesId].swipes && chat[mesId].swipes[swipeId] !== undefined) {
        chat[mesId].swipes[swipeId] = newMessage;
    }

    // UI: Finalize Visuals
    setTimeout(() => {
        // Ideally we'd re-render the specific message here safely
        // For now, we rely on the placeholder transition or a soft reload
        context.saveChat();
        
        // Only if we want to force re-render immediately (optional, might break streaming effect)
        // updateMessageDisplay(mesId, newMessage); 
    }, settings.highlightDuration || 2000);
}


// --- DOM Helpers ---

function getSelectedTextInfo() {
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
    const chat = context.chat;
    const messageData = chat[mesId];
    if (!messageData) return null;
    
    // Current swipe handling
    let swipeId = messageData.swipe_id !== undefined ? messageData.swipe_id : 0;
    const fullMessage = messageData.mes;
    const selectedText = selection.toString();

    // Map DOM range to raw text indices
    const rawStartOffset = fullMessage.indexOf(selectedText);
    if (rawStartOffset === -1) {
        console.warn("Could not map selection to raw message. Markdown structure might differ significantly from rendered HTML.");
        return null;
    }
    
    return {
        mesId,
        swipeId,
        selectedText,
        fullMessage,
        rawStartOffset,
        rawEndOffset: rawStartOffset + selectedText.length
    };
}

function createStreamingPlaceholder(selectionInfo) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return null;
    
    const range = selection.getRangeAt(0);
    range.deleteContents();
    
    const span = document.createElement('span');
    span.className = 'animated-highlight';
    span.textContent = '...'; 
    range.insertNode(span);
    
    selection.removeAllRanges();
    return span;
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
    const context = getContext();
    if (!rewriteHistory[mesId] || rewriteHistory[mesId].length === 0) return;

    const lastChange = rewriteHistory[mesId].pop();
    const chat = context.chat;
    
    // Revert content
    chat[mesId].mes = lastChange.oldContent;
    if (chat[mesId].swipes && chat[mesId].swipes[lastChange.swipeId] !== undefined) {
        chat[mesId].swipes[lastChange.swipeId] = lastChange.oldContent;
    }

    // Update UI
    const mesDiv = document.querySelector(`.mes[mesid="${mesId}"] .mes_text`);
    if (mesDiv) {
        mesDiv.innerHTML = context.messageFormatting(lastChange.oldContent, mesId, false, false);
    }
    
    context.saveChat();

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
