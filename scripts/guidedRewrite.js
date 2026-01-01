import { getContext } from '/scripts/extensions.js';
import { extensionName, debugLog, extension_settings } from '../index.js';
import { handleSwitching } from './persistentGuides/guideExports.js';

// --- Global State ---
let streamingSpan = null;
let rewriteHistory = {}; // Stores history of rewrites per message for undo

/**
 * Main entry point for guided rewrites from the context menu
 * @param {string} mode - 'Rewrite', 'Shorten', 'Expand', 'Custom'
 * @param {string} [customInput] - Optional input for custom mode
 */
export async function handleGuidedRewrite(mode, customInput = '') {
    const selectionInfo = getSelectedTextInfo();
    if (!selectionInfo) {
        debugLog(`[${extensionName}] Rewrite aborted: No valid selection info.`);
        return;
    }

    const { mesId, swipeId, selectedText } = selectionInfo;
    debugLog(`[${extensionName}] Starting ${mode} rewrite for message ${mesId}`);

    // Create streaming placeholder
    createStreamingPlaceholder(selectionInfo);

    // Prepare prompt based on mode
    const settings = extension_settings[extensionName];
    let promptTemplate = '';
    
    switch (mode) {
        case 'Rewrite': promptTemplate = settings.promptRewrite; break;
        case 'Shorten': promptTemplate = settings.promptShorten; break;
        case 'Expand': promptTemplate = settings.promptExpand; break;
        case 'Custom': promptTemplate = settings.promptCustom; break;
    }

    let finalPrompt = promptTemplate.replace('{{rewrite}}', selectedText);
    if (mode === 'Custom') {
        finalPrompt = finalPrompt.replace('{{input}}', customInput);
    }

    const context = getContext();
    const chat = context.chat;
    
    // Find effective target index for context truncation
    let targetIndex = parseInt(mesId); 
    
    // Check manual target
    if (window.GuidedGenerations && typeof window.GuidedGenerations.getGuidedGenerationTargetMessageId === 'function') {
        const manualTargetId = window.GuidedGenerations.getGuidedGenerationTargetMessageId();
        if (manualTargetId !== null) {
            const manualIndex = chat.findIndex(m => m.mesid == manualTargetId);
            if (manualIndex !== -1 && manualIndex < targetIndex) {
                targetIndex = manualIndex;
            }
        }
    }

    // Switch to rewrite profile if set
    const profileValue = settings.profileRewrite?.trim() || '';
    const presetValue = settings.presetRewrite?.trim() || '';
    const { switch: switchPreset, restore } = await handleSwitching(profileValue || null, presetValue || null);

    let resultText = '';
    
    try {
        if (profileValue || presetValue) {
            await switchPreset();
        }

        // Use generateRaw for the rewrite operation
        const result = await context.generateRaw({
            prompt: finalPrompt,
            max_tokens: settings.maxRewriteTokens || 500,
        });
        
        resultText = result;
        updateStreamingPlaceholder(resultText);

        // Finalize
        if (resultText) {
            const newMessage = 
                selectionInfo.fullMessage.substring(0, selectionInfo.rawStartOffset) +
                resultText +
                selectionInfo.fullMessage.substring(selectionInfo.rawEndOffset);

            // Create undo entry
            saveRewriteChange(mesId, swipeId, selectionInfo.fullMessage, newMessage);

            chat[mesId].mes = newMessage;
            if (chat[mesId].swipes && chat[mesId].swipes[swipeId] !== undefined) {
                chat[mesId].swipes[swipeId] = newMessage;
            }

            // Remove highlight after duration
            setTimeout(() => {
                const textNode = document.createTextNode(resultText);
                if (streamingSpan.parentNode) {
                    streamingSpan.parentNode.replaceChild(textNode, streamingSpan);
                }
                context.saveChat();
            }, settings.highlightDuration || 2000);
        }

    } catch (err) {
        console.error(`[${extensionName}] Rewrite failed:`, err);
        // Revert placeholder
        if (streamingSpan && streamingSpan.parentNode) {
            streamingSpan.outerHTML = selectedText;
        }
    } finally {
        if (profileValue || presetValue) {
            await restore();
        }
    }
}

function getSelectedTextInfo() {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return null;

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    
    // Find parent message div
    const mesDiv = container.nodeType === 1 ? container.closest('.mes') : container.parentElement.closest('.mes');
    if (!mesDiv) return null;

    const mesId = mesDiv.getAttribute('mesid');
    const mesTextDiv = mesDiv.querySelector('.mes_text');
    if (!mesTextDiv) return null;

    // Get chat data
    const context = getContext();
    const chat = context.chat;
    const messageData = chat[mesId];
    if (!messageData) return null;
    
    // Current swipe handling
    let swipeId = 0;
    if (messageData.swipe_id !== undefined) {
        swipeId = messageData.swipe_id;
    }
    
    const fullMessage = messageData.mes;
    const selectedText = selection.toString();

    // Map DOM range to raw text indices
    const rawStartOffset = fullMessage.indexOf(selectedText);
    if (rawStartOffset === -1) {
        console.warn("Could not map selection to raw message. Markdown structure might differ significantly from rendered HTML.");
        return null;
    }
    
    // Ambiguity check
    if (fullMessage.indexOf(selectedText, rawStartOffset + 1) !== -1) {
        console.warn("Ambiguous selection: Phrase appears multiple times. Defaulting to first occurrence.");
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
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    range.deleteContents();
    
    streamingSpan = document.createElement('span');
    streamingSpan.className = 'animated-highlight';
    streamingSpan.textContent = '...'; // Initial loader
    range.insertNode(streamingSpan);
    
    selection.removeAllRanges();
}

function updateStreamingPlaceholder(text) {
    if (streamingSpan) {
        streamingSpan.textContent = text;
    }
}

// --- Undo Logic (Called by index.js buttons) ---

/**
 * Saves a change to history for undo functionality
 * @param {string|number} mesId - Message ID
 * @param {string|number} swipeId - Swipe ID
 * @param {string} oldContent - Content before change
 * @param {string} newContent - Content after change
 */
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

    // Show undo button for this message
    const undoBtn = document.querySelector(`.mes[mesid="${mesId}"] .guided_undo_rewrite_button`);
    if (undoBtn) {
        undoBtn.style.display = 'inline-block';
    }
}

/**
 * Undoes the last rewrite for a specific message
 * @param {string|number} mesId - Message ID to undo
 */
export function undoRewrite(mesId) {
    const context = getContext();
    if (!rewriteHistory[mesId] || rewriteHistory[mesId].length === 0) {
        console.warn(`[GuidedGenerations] No rewrite history for message ${mesId}`);
        return;
    }

    const lastChange = rewriteHistory[mesId].pop();
    const chat = context.chat;
    
    // Check if current content matches what we expect (conflict detection)
    const currentMes = chat[mesId].mes;
    if (currentMes !== lastChange.newContent) {
        console.warn(`[GuidedGenerations] Message content has changed since last rewrite. Undo might have unexpected results.`);
    }

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

    // Hide button if no history left
    if (rewriteHistory[mesId].length === 0) {
        const undoBtn = document.querySelector(`.mes[mesid="${mesId}"] .guided_undo_rewrite_button`);
        if (undoBtn) {
            undoBtn.style.display = 'none';
        }
    }
}

// Initial export for global access (called from index.js if needed)
export function initRewriteUndo() {
    if (!window.GuidedGenerations) window.GuidedGenerations = {};
    window.GuidedGenerations.saveRewriteChange = saveRewriteChange;
    window.GuidedGenerations.undoRewrite = undoRewrite;
}
