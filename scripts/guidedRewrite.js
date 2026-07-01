import { getContext, extension_settings } from '../../../../extensions.js';
import { extensionName, debugLog, debugWarn, debugError } from '../index.js';
import { requestCompletion } from './utils/llmClient.js';
import { showDiffPreview, showLoading, hideLoading } from './ui/diffManager.js';
import { getTokenCountAsync } from '../../../../tokenizers.js';

/**
 * Decoupled Rewrite Logic
 */
export async function performRewrite(mode, selectionInfo, customInput = '') {
    // STRICT EDIT MODE: We only work with raw indices
    const { start, end, fullMessage, selectedText } = selectionInfo;
    const settings = extension_settings[extensionName];
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

    if (!promptTemplate) {
        debugWarn(`[${extensionName}] No prompt template found for mode: ${mode}`);
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
            const startIdx = Math.max(0, mesId - contextCount);
            const contextMessages = [];
            
            for (let i = startIdx; i <= mesId; i++) {
                if (globalChat[i]) {
                    const name = globalChat[i].name || (globalChat[i].is_user ? 'User' : 'Character');
                    let content = globalChat[i].mes;

                    // If it's the current message being edited, only include text UP TO the selection start
                    if (i === mesId) {
                         content = fullMessage.substring(0, start);
                         if (!content && i !== startIdx) continue;
                    }

                    contextMessages.push(`${name}: ${content}`);
                }
            }
            contextString = contextMessages.join('\n\n');
        }
    }

    let finalPrompt = (promptTemplate || '').replace('{{rewrite}}', selectedText);
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

    // 2. Prepare Generation parameters
    const profileValue = settings.profileRewrite?.trim() || '';
    const presetValue = settings.presetRewrite?.trim() || '';

    // Prepare "Following Text" for context
    const followingText = fullMessage.substring(end);
    
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

            const result = await requestCompletion({
                profileName: profileValue,
                presetName: presetValue,
                prompt: currentPrompt,
                maxTokens: settings.maxRewriteTokens || 500,
                temperature: dynamicTemp,
                debugLabel: `rewrite:${mode}:${index}`
            });

            return {
                text: result
            };
        };

        debugLog(`[${extensionName}] Generating ${candidateCount} rewrite candidates...`);

        // Run concurrently
        let rawResults = [];
        if (Promise.allSettled) {
             const settled = await Promise.allSettled(Array(candidateCount).fill().map((_, i) => generatePromise(i)));
             rawResults = settled.map(r => r.status === 'fulfilled' ? r.value : null);
        } else {
             // Fallback
             rawResults = await Promise.all(Array(candidateCount).fill().map((_, i) => generatePromise(i).catch(e => null)));
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
            if (resultText.startsWith('"""') && resultText.endsWith('"""') && resultText.length >= 6) {
                resultText = resultText.substring(3, resultText.length - 3).trim();
            }
            
            candidates.push({
                text: resultText,
                analysis: analysisContent
            });
        }

        if (candidates.length > 0) {
            const firstOutputTokens = await getTokenCountAsync(candidates[0].text);
            debugLog(`Output Token Count (${mode} - First Candidate): ${firstOutputTokens}`);

            return { success: true, candidates, originalRaw: selectedText };
        }
    } catch (err) {
        console.error(`[${extensionName}] Rewrite generation failed:`, err);
        return { success: false, error: err };
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
        debugLog(`[${extensionName}] Rewrite aborted: No valid raw text selection.`);
        toastr.warning("Please edit the message (Pencil Icon) and select text inside the editor to use Guided Rewrite.", "Raw Text Selection Required");
        return;
    }

    const toastId = toastr.info("Generating rewrite...", "Guided Rewrite", { timeOut: 0, extendedTimeOut: 0 });
    await showLoading(`Generating ${mode} rewrite variations...`);

    const result = await performRewrite(mode, selectionInfo, customInput);
    
    toastr.clear(toastId);
    hideLoading();

    if (result.success) {
        debugLog(`[${extensionName}] Showing diff preview before applying...`);
        const confirmedText = await showDiffPreview(selectionInfo.selectedText, result.candidates);
        
        if (confirmedText !== null) {
            debugLog(`[${extensionName}] Diff confirmed. Applying change.`);
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
 * Applies the change to the chat
 */
function applyRewriteChange(selectionInfo, newMessage) {
    const { mesId, swipeId, textarea } = selectionInfo;

    debugLog(`[${extensionName}] applyRewriteChange: Updating message ${mesId}`);
    
    // 1. Update the Textarea directly if it's still there
    if (textarea && document.body.contains(textarea)) {
        textarea.value = newMessage;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        debugLog(`[${extensionName}] Textarea value updated.`);
    }

    // 2. Update Global Chat Object
    let globalChat = (typeof chat !== 'undefined') ? chat : window.chat;
    if (!globalChat && typeof SillyTavern !== 'undefined') globalChat = SillyTavern.chat;

    if (globalChat && globalChat[mesId]) {
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
        let current = activeElement;
        let mesId = null;
        while (current) {
            if (current.classList && current.classList.contains('mes') && current.hasAttribute('mesid')) {
                mesId = current.getAttribute('mesid');
                break;
            }
            current = current.parentElement;
        }

        let swipeId = 0;
        if (mesId) {
             let globalChat = (typeof chat !== 'undefined') ? chat : window.chat;
             if (!globalChat && typeof SillyTavern !== 'undefined') globalChat = SillyTavern.chat;
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
