// scripts/guidedImpersonate.js
import { getContext, extension_settings, extensionName, debugLog, getPreviousImpersonateInput, setPreviousImpersonateInput, getLastImpersonateResult, setLastImpersonateResult, truncateChatForContext } from './persistentGuides/guideExports.js'; // Import from central hub
import { chat, redisplayChat } from '../../../../../script.js';

/**
 * Consolidated Guided Impersonate function.
 * @param {string} templateId - The ID of the template to use.
 */
const guidedImpersonate = async (templateId = '1st') => {
    // Get template from global GuidedGenerations (set up in index.js)
    const template = (typeof window.GuidedGenerations !== 'undefined' && typeof window.GuidedGenerations.getImpersonateTemplate === 'function')
        ? window.GuidedGenerations.getImpersonateTemplate(templateId)
        : null;

    const templateName = template ? template.name : templateId;
    const logPrefix = `[Impersonate-${templateName}]`;
    
    const textarea = document.getElementById('send_textarea');
    if (!textarea) {
        console.error(`[GuidedGenerations] ${logPrefix} Textarea #send_textarea not found.`);
        return;
    }

    // Check for target message
    let targetIndex = -1;
    if (typeof window.GuidedGenerations !== 'undefined' && typeof window.GuidedGenerations.getGuidedGenerationTargetMessageId === 'function') {
        const manualTarget = window.GuidedGenerations.getGuidedGenerationTargetMessageId();
        if (manualTarget !== null && manualTarget !== undefined) {
             const parsedTarget = parseInt(manualTarget);
             if (!isNaN(parsedTarget) && parsedTarget >= 0 && parsedTarget < chat.length) {
                 targetIndex = parsedTarget;
                 debugLog(`${logPrefix} Using manually set target message index: ${targetIndex}`);
             }
        }
    }

    const currentInputText = textarea.value;
    const lastGeneratedText = getLastImpersonateResult(); // Use getter

    // Check if the current input matches the last generated text (only for standard mode)
    if (targetIndex === -1 && lastGeneratedText && currentInputText === lastGeneratedText) {
        textarea.value = getPreviousImpersonateInput(); // Use getter
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        return; // Restoration done, exit
    }

    // --- If not restoring, proceed with impersonation ---
    setPreviousImpersonateInput(currentInputText); // Use setter

    const promptTemplate = template ? template.content : (templateId === '1st' ? 'Write in first Person perspective from {{user}}. {{input}}' : (templateId === '2nd' ? 'Write in second Person perspective from {{user}}. {{input}}' : 'Write in third Person perspective from {{user}}. {{input}}'));
    const filledPrompt = promptTemplate.replace('{{input}}', currentInputText);

    // Build STScript
    const stscriptCommand = `/impersonate await=true ${filledPrompt} |`;
    const fullScript = `// Impersonate guide (${templateName})|\n${stscriptCommand}`;

    try {
        const context = getContext();
        if (typeof context.executeSlashCommandsWithOptions === 'function') {
            debugLog(`${logPrefix} Executing STScript...`);
            
            // Apply Context Limit Truncation
            // If targetIndex is -1 (default), we truncate to the last message (chat.length - 1)
            const activeTargetIndex = targetIndex > -1 ? targetIndex : chat.length - 1;
            const restore = truncateChatForContext(activeTargetIndex);

            try {
                if (targetIndex > -1) {
                    // --- SWIPE LOGIC ---
                    // Execute /impersonate (writes to textarea and likely adds to truncated chat)
                    textarea.value = ''; 
                    await context.executeSlashCommandsWithOptions(fullScript); 
                    
                    // Capture result
                    const generatedText = textarea.value;
                    
                    // Cleanup temporary message from truncated chat before restoring
                    if (chat.length > 0) {
                        chat.length = 0; 
                    }

                    if (generatedText) {
                        setLastImpersonateResult(generatedText);
                        
                        // Restore full chat
                        restore();
                        
                        // Apply as swipe to the targeted message
                        const targetMessage = chat[targetIndex];
                        if (targetMessage) {
                            if (!Array.isArray(targetMessage.swipes)) targetMessage.swipes = [targetMessage.mes];
                            if (!Array.isArray(targetMessage.swipe_info)) targetMessage.swipe_info = targetMessage.swipes.map(() => ({}));

                            targetMessage.swipes.push(generatedText);
                            targetMessage.swipe_info.push({
                                send_date: new Date().toLocaleString(),
                                gen_started: new Date().toISOString(),
                                gen_finished: new Date().toISOString(),
                                extra: {}
                            });

                            targetMessage.swipe_id = targetMessage.swipes.length - 1;
                            targetMessage.mes = generatedText;
                            
                            // Redisplay
                            if (typeof redisplayChat === 'function') {
                                await redisplayChat(chat, targetIndex);
                            }
                        }
                    } else {
                        restore();
                    }
                } else {
                    // --- STANDARD LOGIC ---
                    // Execute the command
                    await context.executeSlashCommandsWithOptions(fullScript); 
                    
                    // Capture result
                    setLastImpersonateResult(textarea.value);
                    
                    // Restore chat
                    restore();
                    
                    debugLog(`${logPrefix} STScript executed, new input stored in shared state.`);
                }
            } finally {
                // Ensure restore is called if not already
                restore();
            }
        } else {
            console.error(`[GuidedGenerations] ${logPrefix} context.executeSlashCommandsWithOptions not found!`);
        }
    } catch (error) {
        console.error(`[GuidedGenerations] ${logPrefix} Error: ${error}`);
        setLastImpersonateResult(''); // Use setter to clear shared state on error
    }
};

// Export the function
export { guidedImpersonate };
