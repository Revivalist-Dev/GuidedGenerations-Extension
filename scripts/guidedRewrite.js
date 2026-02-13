import { getContext } from '/scripts/extensions.js';
import { extensionName } from '../index.js';
import { debugLog, debugError, debugWarn } from './utils/logger.js';
import { getSettings } from './utils/settingsManager.js';
import { handleSwitching, chat, saveChatConditional, updateMessageBlock, redisplayChat } from './utils/moduleManager.js';
import { getTokenCountAsync } from '/scripts/tokenizers.js';

import { showDiffPreview, showLoading, hideLoading } from './ui/diffManager.js';
import { rewriteHistoryManager } from './utils/rewriteHistory.js';

// --- Global State ---


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
        case 'Instruct': promptTemplate = settings.promptInstruct; break;
        default: promptTemplate = settings.promptRewrite;
    }

    // --- CONTEXT FETCHING ---
    let contextString = '';
    const contextCount = settings.rewriteContextCount || 0;
    const mesId = parseInt(selectionInfo.mesId);

    if (contextCount > 0 && !isNaN(mesId)) {
        let globalChat = (typeof chat !== 'undefined') ? chat : window.chat;
        if (!globalChat && typeof SillyTavern !== 'undefined') globalChat = SillyTavern.chat;

        if (globalChat) {
            // Include messages leading up to the current one
            // We include the current message's text up to the selection start if possible
            // but for simplicity we'll just take N previous messages.
            const startIdx = Math.max(0, mesId - contextCount);
            const contextMessages = [];
            
            for (let i = startIdx; i <= mesId; i++) {
                if (globalChat[i]) {
                    const name = globalChat[i].name || (globalChat[i].is_user ? 'User' : 'Character');
                    let content = globalChat[i].mes;

                    // If it's the current message being edited, only include text UP TO the selection start
                    // This provides the immediate lead-in without polluting context with the text we want to change
                    if (i === mesId) {
                         content = fullMessage.substring(0, start);
                         // If there is no lead-in (start of message), skip adding this empty line unless it's the only context
                         if (!content && i !== startIdx) continue;
                    }

                    contextMessages.push(`${name}: ${content}`);
                }
            }
            contextString = contextMessages.join('\n\n');
        }
    }

    let finalPrompt = promptTemplate.replace('{{rewrite}}', selectedText);
    finalPrompt = finalPrompt.replace('{{context}}', contextString || 'No additional context provided.');
    let instruction = '';
    
    // Prefer customInput if passed (e.g. from popup input)
    if (customInput && customInput.trim()) {
        instruction = customInput.trim();
    } else {
        // Fallback: Try to grab from main input if not provided via arguments
        const textarea = document.getElementById('send_textarea');
        if (textarea) {
            instruction = textarea.value.trim();
        }
    }

    if (mode === 'Instruct') {
        if (!instruction) {
            debugLog(`[${extensionName}] Custom rewrite aborted: No instruction provided.`);
            toastr.warning("Please enter instructions in the main chat input or the popup before using Instruct.", "No Instructions Provided");
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

    // Prepare "Following Text" for context
    const followingText = fullMessage.substring(end);
    
    // Variance feature removed. Strategies are no longer loaded.

    let resultText = '';
    try {
        // 3. Generate (N candidates)
        const candidateCount = settings.rewriteCandidateCount || 4;
        
        // Random temperature offset generator
        const baseTemp = settings.rewriteTemperature || 1.0; 
        
        const generatePromise = async (index) => {
            // Temperature variation
            const tempOffset = (index * 0.15); 
            const dynamicTemp = Math.min(2.0, Math.max(0.1, baseTemp + tempOffset)); // Clamp 0.1 - 2.0
            
            // Replace placeholders
            let currentPrompt = finalPrompt.replace('{{variance}}', ''); // Remove placeholder if it exists
            currentPrompt = currentPrompt.replace('{{after}}', followingText || "No following text.");

            const result = await context.generateRaw({
                prompt: currentPrompt,
                max_tokens: settings.maxRewriteTokens || 500,
                temperature: dynamicTemp, // Pass temp override
                top_p: 0.95, // Ensure high diversity
                top_k: 40,
                repetition_penalty: 1.15
            });

            return {
                text: result
            };
        };

        debugLog(`[${extensionName}] Generating ${candidateCount} rewrite candidates...`);

        // Run concurrently
        let rawResults = [];
        try {
            rawResults = await Promise.all(Array(candidateCount).fill().map((_, i) => generatePromise(i)));
        } catch (err) {
            console.error(`[${extensionName}] One or more generations failed:`, err);
            // ... (rest of error handling logic remains similar but needs to handle object return) ...
             if (Promise.allSettled) {
                 const settled = await Promise.allSettled(Array(candidateCount).fill().map((_, i) => generatePromise(i)));
                 rawResults = settled.map(r => r.status === 'fulfilled' ? r.value : null);
            } else {
                 // Fallback
                 rawResults = await Promise.all(Array(candidateCount).fill().map((_, i) => generatePromise(i).catch(e => null)));
            }
        }
    
        // Process results
        const candidates = [];

        for (let resultObj of rawResults) {
            if (!resultObj || !resultObj.text) continue;

            let resultText = resultObj.text;
            let analysisContent = null;

            // --- PARSE ANALYSIS / CHAIN OF THOUGHT ---
            const analysisMatch = resultText.match(/\[ANALYSIS\]([\s\S]*?)\[\/ANALYSIS\]/i);
            if (analysisMatch) {
                analysisContent = analysisMatch[1].trim();
                // Remove analysis block from result to get clean text
                resultText = resultText.replace(/\[ANALYSIS\][\s\S]*?\[\/ANALYSIS\]/i, '').trim();
            }

            // --- PARSE RESULT BLOCK (If present) ---
            const resultMatch = resultText.match(/\[RESULT\]([\s\S]*?)\[\/RESULT\]/i);
            if (resultMatch) {
                resultText = resultMatch[1].trim();
            } else {
                // Cleanup: If tags are present but malformed, or if only tags exist
                resultText = resultText.replace(/\[RESULT\]/i, '').replace(/\[\/RESULT\]/i, '').trim();
            }

            // Clean up common artifacts
            // 1. Remove wrapping triple quotes (model mirroring the prompt delimiters)
            if (resultText.startsWith('"""') && resultText.endsWith('"""') && resultText.length >= 6) {
                resultText = resultText.substring(3, resultText.length - 3).trim();
            }
            
            candidates.push({
                text: resultText,
                analysis: analysisContent
            });
        }

        if (candidates.length > 0) {
            // --- TOKEN COUNTING (OUTPUT - Average) ---
            // We'll just log the first one for simplicity or average
            const firstOutputTokens = await getTokenCountAsync(candidates[0].text);
            debugLog(`Output Token Count (${mode} - First Candidate): ${firstOutputTokens}`);

            return { success: true, candidates, originalRaw: selectedText };
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
    
    // Show loading overlay
    await showLoading(`Generating ${mode} rewrite variations...`);

    // Logic: Perform Rewrite
    const result = await performRewrite(mode, selectionInfo, customInput);
    
    toastr.clear(toastId);
    hideLoading();

        if (result.success) {
        const settings = getSettings();

        // --- STRATEGY: PREVIEW FIRST, APPLY ONLY IF CONFIRMED ---
        // We always show the diff view now to allow the user to confirm the edit
        // even if they don't want to "edit" it manually, they must confirm the AI's result.
        debugLog(`[${extensionName}] Showing diff preview before applying...`);
        // UI: Show Diff Preview - returns confirmed text or null
        const confirmedText = await showDiffPreview(selectionInfo.selectedText, result.candidates);
        
        if (confirmedText !== null) {
            debugLog(`[${extensionName}] Diff confirmed. Applying change.`);
            // Construct the full message with the (potentially edited) confirmed text
            const finalNewMessage = selectionInfo.fullMessage.substring(0, selectionInfo.start) + 
                                   confirmedText + 
                                   selectionInfo.fullMessage.substring(selectionInfo.end);
            applyRewriteChange(selectionInfo, finalNewMessage);
        } else {
            debugLog(`[${extensionName}] Diff rejected. No changes made.`);
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
    
    // Log to history
    rewriteHistoryManager.addEntry(mesId, selectionInfo.fullMessage, newMessage);

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
