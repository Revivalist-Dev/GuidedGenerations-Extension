import { getContext } from '/scripts/extensions.js';
import { extensionName } from './utils/constants.js';
import { debugLog, debugError, debugWarn } from './utils/logger.js';
import { getSettings } from './utils/settingsManager.js';
import { handleSwitching, chat, saveChatConditional, updateMessageBlock, redisplayChat } from './utils/moduleManager.js';
import { getTokenCountAsync } from '/scripts/tokenizers.js';

import { diffWords, renderDiffToHtml } from './utils/diffViewer.js';

// --- Global State ---
let rewriteHistory = {}; // Stores history of rewrites per message for undo

/**
 * Shows the diff preview popup and returns a promise that resolves to true (apply) or false (cancel)
 */
async function showDiffPreview(oldText, newText) {
    return new Promise(async (resolve) => {
        let popup = document.getElementById('gg-diff-popup');
        if (!popup) {
            try {
                const response = await fetch('/scripts/extensions/third-party/GuidedGenerations-Extension/html/diffPopup.html');
                if (response.ok) {
                    const html = await response.text();
                    document.body.insertAdjacentHTML('beforeend', html);
                    popup = document.getElementById('gg-diff-popup');
                }
            } catch (err) {
                debugError('Failed to load diff popup HTML:', err);
                resolve(true); // Fallback to auto-apply if popup fails to load
                return;
            }
        }

        if (!popup) {
            resolve(true);
            return;
        }

        const container = popup.querySelector('#gg-diff-container');
        const confirmBtn = popup.querySelector('#gg-diff-confirm');
        const cancelBtn = popup.querySelector('#gg-diff-cancel');
        const closeBtn = popup.querySelector('.gg-popup-close');

        // Generate and render diff
        const diff = diffWords(oldText, newText);
        container.innerHTML = '';
        container.appendChild(renderDiffToHtml(diff));

        // Bring popup to foreground and prevent scrolling interference
        popup.style.display = 'flex';
        document.body.classList.add('gg-popup-open');

        const cleanup = (result) => {
            popup.style.display = 'none';
            document.body.classList.remove('gg-popup-open');
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
            closeBtn.onclick = null;
            resolve(result);
        };

        confirmBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            debugLog('Diff Popup: Confirm clicked');
            cleanup(true);
        };
        
        cancelBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            debugLog('Diff Popup: Cancel clicked');
            cleanup(false);
        };

        closeBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            cleanup(false);
        };
    });
}

/**
 * Decoupled Rewrite Logic
 */
export async function performRewrite(mode, selectionInfo, customInput = '') {
    // STRICT EDIT MODE: We only work with raw indices
    const { start, end, fullMessage, selectedText } = selectionInfo;
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
            // STRICT REPLACEMENT: Slice and splice using exact indices
            // This is 100% reliable because we got start/end from the textarea directly
            const newMessage = fullMessage.substring(0, start) + resultText + fullMessage.substring(end);

            return { success: true, newMessage, resultText, originalRaw: selectedText };
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
        // This is now expected if not in Edit Mode
        debugLog(`[${extensionName}] Rewrite aborted: No valid raw text selection.`);
        toastr.warning("Please edit the message (Pencil Icon) and select text inside the editor to use Guided Rewrite.", "Raw Text Selection Required");
        return;
    }

    // UI: Show Placeholder (This is tricky in a Textarea, might skip or insert visual marker)
    // For raw text editing, we probably shouldn't mess with the textarea content until we have the result
    // to avoid losing undo history or cursor position if the user keeps typing.
    // Instead, we'll just show a toast or loader.
    const toastId = toastr.info("Generating rewrite...", "Guided Rewrite", { timeOut: 0, extendedTimeOut: 0 });

    // Logic: Perform Rewrite
    const result = await performRewrite(mode, selectionInfo, customInput);
    
    toastr.clear(toastId);

    if (result.success) {
        const settings = getSettings();

        // --- STRATEGY: APPLY FIRST, UNDO IF CANCELLED ---
        debugLog(`[${extensionName}] Applying rewrite result immediately to editor...`);
        applyRewriteChange(selectionInfo, result.newMessage);

        if (settings.showDiffView) {
            // UI: Show Diff Preview
            const confirmed = await showDiffPreview(selectionInfo.selectedText, result.resultText);
            
            if (!confirmed) {
                debugLog(`[${extensionName}] Diff rejected. Reverting change...`);
                // Restore original content
                undoRewrite(selectionInfo.mesId, selectionInfo.fullMessage); 
            } else {
                debugLog(`[${extensionName}] Diff confirmed. Keeping change.`);
            }
        }
    }
}


/**
 * Applies the change to the chat and saves history
 */
function applyRewriteChange(selectionInfo, newMessage) {
    const { mesId, swipeId, textarea } = selectionInfo;
    const context = getContext();

    debugLog(`[${extensionName}] applyRewriteChange: Updating message ${mesId}`);
    
    // 1. Update the Textarea directly if it's still there
    if (textarea && document.body.contains(textarea)) {
        // Preserve cursor position? Or select the new text?
        // Let's try to update value and dispatch input
        textarea.value = newMessage;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        debugLog(`[${extensionName}] Textarea value updated.`);
    }

    // 2. Update Global Chat Object (as backup and for persistence)
    // Access global chat safely to ensure we are modifying the source of truth
    let globalChat = (typeof chat !== 'undefined') ? chat : window.chat;
    if (!globalChat && typeof SillyTavern !== 'undefined') globalChat = SillyTavern.chat;

    if (globalChat && globalChat[mesId]) {
        // Update message and swipe
        // Note: SillyTavern might auto-update chat from textarea input event, but we do this to be safe
        globalChat[mesId].mes = newMessage;
        if (globalChat[mesId].swipes && globalChat[mesId].swipes[swipeId] !== undefined) {
            globalChat[mesId].swipes[swipeId] = newMessage;
        }
    }
}


// --- DOM Helpers ---

export function getSelectedTextInfo() {
    // STRICT MODE: Only check active textarea/input
    const activeElement = document.activeElement;
    
    if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
        const start = activeElement.selectionStart;
        const end = activeElement.selectionEnd;
        const value = activeElement.value;
        const selectedText = value.substring(start, end);

        if (start === end || !selectedText) {
            debugLog(`[${extensionName}] Textarea found but no text selected.`);
            return null;
        }

        // Try to find mesId
        // The edit textarea is usually injected into the .mes-edit-box or similar
        // We need to walk up to find .mes[mesid]
        let current = activeElement;
        let mesId = null;
        while (current) {
            if (current.classList && current.classList.contains('mes') && current.hasAttribute('mesid')) {
                mesId = current.getAttribute('mesid');
                break;
            }
            current = current.parentElement;
        }

        // If we can't find mesId, we can still proceed if we just rely on the textarea
        // But for undo/history we might need it. 
        // Fallback: If no mesId found, we might be in the main chat input? 
        // We usually don't rewrite user input in the main box via this tool, but maybe?
        
        let swipeId = 0;
        if (mesId) {
             let globalChat = (typeof chat !== 'undefined') ? chat : window.chat;
             if (globalChat && globalChat[mesId]) {
                 swipeId = globalChat[mesId].swipe_id || 0;
             }
        }

        return {
            mesId,
            swipeId,
            start,
            end,
            selectedText,
            fullMessage: value,
            textarea: activeElement // Keep reference to update it
        };
    }

    return null;
}

// Placeholder functions no longer needed for Raw Edit Mode
function createStreamingPlaceholder(selectionInfo) { return null; }
function revertStreamingPlaceholder(span, originalText) { }


// --- Undo Logic ---

export function undoRewrite(mesId, originalContent) {
    // In Raw Edit Mode, undoing means setting the textarea back to originalContent
    // We assume the textarea is still open/active
    
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
        // We should verify this is the SAME textarea if possible, or just trust the user hasn't clicked away
        // Simple check: does it look like we are editing the same message?
        // For simplicity, just update the value
        activeElement.value = originalContent;
        activeElement.dispatchEvent(new Event('input', { bubbles: true }));
        debugLog(`[${extensionName}] Undo: Reverted textarea content.`);
    }
    
    // Also revert global chat object
    if (mesId !== null && mesId !== undefined) {
        let globalChat = (typeof chat !== 'undefined') ? chat : window.chat;
        if (globalChat && globalChat[mesId]) {
             globalChat[mesId].mes = originalContent;
             let swipeId = globalChat[mesId].swipe_id || 0;
             if (globalChat[mesId].swipes && globalChat[mesId].swipes[swipeId] !== undefined) {
                globalChat[mesId].swipes[swipeId] = originalContent;
            }
        }
    }
}

export function initRewriteUndo() {
    if (!window.GuidedGenerations) window.GuidedGenerations = {};
    window.GuidedGenerations.undoRewrite = undoRewrite;
}


