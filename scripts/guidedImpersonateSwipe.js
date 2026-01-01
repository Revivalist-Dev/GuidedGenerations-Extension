// scripts/guidedImpersonateSwipe.js
import { getContext, debugLog, setLastImpersonateResult, saveChatConditional, truncateChatForContext } from './utils/exportManager.js'; // Import from central hub
import { chat, redisplayChat } from '/script.js';

/**
 * Generates an impersonated response and applies it as a swipe to a user message.
 * @param {number} targetIndex The index of the user message to swipe on.
 * @param {string} filledPrompt The prompt to use for /impersonate.
 * @returns {Promise<boolean>} True if successful.
 */
export async function guidedImpersonateSwipe(targetIndex, filledPrompt) {
    const textarea = document.getElementById('send_textarea');
    if (!textarea) {
        console.error('[GuidedGenerations][ImpersonateSwipe] Textarea not found.');
        return false;
    }

    const originalInputText = textarea.value;
    const context = getContext();

    const targetMessage = chat[targetIndex];
    if (!targetMessage) {
        console.error(`[ImpersonateSwipe] Target message at index ${targetIndex} not found.`);
        return false;
    }

    // Get the persona name from the message being swiped to force the AI to write as them
    const personaName = targetMessage.ch_name || targetMessage.name || 'User';
    debugLog(`[ImpersonateSwipe] Performing targeted impersonate swipe on index ${targetIndex} as persona: ${personaName}`);

    // --- SWIPE LOGIC ---
    // 1. Truncate for Context
    const restore = truncateChatForContext(targetIndex);

    try {
        // 2. Build and execute command
        // We explicitly tell the AI to write as the specific persona from the message.
        const promptWithPersona = `[OOC: Write the next message from the perspective of ${personaName}.] ${filledPrompt}`;
        const stscriptCommand = `/impersonate await=true ${promptWithPersona} |`;
        const fullScript = `// Impersonate swipe guide (${personaName})|\n${stscriptCommand}`;

        // Clear textarea to ensure we capture only the new output
        textarea.value = ''; 
        
        // Execute /impersonate (this will likely add a message to the chat array)
        await context.executeSlashCommandsWithOptions(fullScript); 
        
        // 3. Capture result and cleanup the temporary message
        // We take the result from the textarea (safest)
        const generatedText = textarea.value;
        
        // If /impersonate added a message to the chat, we MUST remove it before restoring
        // because we are applying it as a swipe to the original message instead.
        // Since truncateChatForContext made the chat length targetIndex, /impersonate added at targetIndex.
        if (chat.length > 0) {
            debugLog(`[ImpersonateSwipe] Removing temporary generated message from chat (length ${chat.length} -> 0)`);
            chat.length = 0; // The chat array here is the truncated one
        }

        if (!generatedText) {
            debugLog('[ImpersonateSwipe] No text generated, possible cancellation or error.');
            // Restoration happens in finally block
            return false;
        }

        setLastImpersonateResult(generatedText);
        
        // 4. Restore original chat
        restore();
        
        // 5. Apply as swipe to the targeted message (now restored at targetIndex)
        const finalTargetMessage = chat[targetIndex];
        if (finalTargetMessage) {
            // Ensure swipes and swipe_info arrays exist
            if (!Array.isArray(finalTargetMessage.swipes)) {
                finalTargetMessage.swipes = [finalTargetMessage.mes];
            }
            if (!Array.isArray(finalTargetMessage.swipe_info)) {
                finalTargetMessage.swipe_info = finalTargetMessage.swipes.map(() => ({}));
            }
            
            // Add new swipe
            finalTargetMessage.swipes.push(generatedText);
            finalTargetMessage.swipe_info.push({
                send_date: new Date().toLocaleString(),
                gen_started: new Date().toISOString(),
                gen_finished: new Date().toISOString(),
                extra: {}
            });
            
            finalTargetMessage.swipe_id = finalTargetMessage.swipes.length - 1;
            finalTargetMessage.mes = generatedText;
            
            debugLog(`[ImpersonateSwipe] Swipe applied. New swipe ID: ${finalTargetMessage.swipe_id}, Total swipes: ${finalTargetMessage.swipes.length}`);

            // Save chat to ensure SillyTavern internal state is updated
            if (typeof saveChatConditional === 'function') {
                saveChatConditional();
            }
            
            // 6. Redisplay to update UI
            if (typeof redisplayChat === 'function') {
                // Redisplay from the target index onwards
                await redisplayChat(chat, targetIndex);
            }
        }
        return true;
    } catch (error) {
        console.error(`[GuidedGenerations][ImpersonateSwipe] Error during execution: ${error}`);
        // Restoration happens in finally block
        return false;
    } finally {
        // Ensure restore is called even if it was already called or on error
        restore();
        // Restore original textarea input
        textarea.value = originalInputText;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
}
