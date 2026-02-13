// scripts/guidedImpersonate.js
import { getContext, extension_settings, extensionName, debugLog, debugWarn, getPreviousImpersonateInput, setPreviousImpersonateInput, getLastImpersonateResult, setLastImpersonateResult, truncateChatForContext, getImpersonateTemplate, getIsGuideGenerationInProgress, setIsGuideGenerationInProgress } from './utils/moduleManager.js'; // Import from central hub
import { chat, redisplayChat } from '/script.js';
/**
 * Consolidated Guided Impersonate function.
 * @param {string} templateId - The ID of the template to use.
 */
const guidedImpersonate = async (templateId = '1st') => {
    if (getIsGuideGenerationInProgress()) {
        debugWarn("[GuidedGenerations] Generation already in progress, skipping...");
        return;
    }

    const template = getImpersonateTemplate(templateId);


    const templateName = template ? template.name : templateId;
    const logPrefix = `[Impersonate-${templateName}]`;
    
    const textarea = document.getElementById('send_textarea');
    if (!textarea) {
        console.error(`[GuidedGenerations] ${logPrefix} Textarea #send_textarea not found.`);
        return;
    }

    const currentInputText = textarea.value;
    const lastGeneratedText = getLastImpersonateResult(); // Use getter

    // Check if the current input matches the last generated text
    if (lastGeneratedText && currentInputText === lastGeneratedText) {
        textarea.value = getPreviousImpersonateInput(); // Use getter
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        return; // Restoration done, exit
    }

    // --- If not restoring, proceed with impersonation ---
    setPreviousImpersonateInput(currentInputText); // Use setter

    const promptTemplate = extension_settings.promptImpersonate || (template ? template.content : (templateId === '1st' ? 'Write in first Person perspective from {{user}}. {{input}}' : (templateId === '2nd' ? 'Write in second Person perspective from {{user}}. {{input}}' : 'Write in third Person perspective from {{user}}. {{input}}')));
    
    // Process input: If it contains pipes, they must be escaped for STScript
    const escapedInput = currentInputText.replace(/\|/g, '\\|');
    
    // Check if promptTemplate actually has {{input}}. If not, append it.
    let filledPrompt;
    if (promptTemplate.includes('{{input}}')) {
        filledPrompt = promptTemplate.replace('{{input}}', escapedInput);
    } else {
        // Append input as a new OOC instruction if {{input}} is missing
        filledPrompt = promptTemplate + (escapedInput ? `\n[OOC: ${escapedInput}][/OOC]` : '');
    }

    // Build STScript - Ensure the entire prompt is passed correctly
    const stscriptCommand = `/impersonate await=true ${filledPrompt} |`;
    const fullScript = `// Impersonate guide (${templateName})|\n${stscriptCommand}`;

    try {
        const context = getContext();
        if (typeof context.executeSlashCommandsWithOptions === 'function') {
            setIsGuideGenerationInProgress(true);
            debugLog(`${logPrefix} Executing STScript...`);
            
            // Apply Context Limit Truncation (always to the last message for impersonate)
            const activeTargetIndex = chat.length - 1;
            const restore = truncateChatForContext(activeTargetIndex);

            try {
                // --- STANDARD LOGIC ONLY ---
                // Execute the command
                await context.executeSlashCommandsWithOptions(fullScript);
                
                // Capture result
                setLastImpersonateResult(textarea.value);
                
                // Restore chat IMMEDIATELY
                restore();
                
                debugLog(`${logPrefix} STScript executed, new input stored in shared state.`);
            } finally {
                // Ensure restore is called if not already
                restore();
                setIsGuideGenerationInProgress(false);
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


