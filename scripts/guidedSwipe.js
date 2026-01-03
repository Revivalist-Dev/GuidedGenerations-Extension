// scripts/guidedSwipe.js

import { getContext, extension_settings, debugLog, setPreviousImpersonateInput, getPreviousImpersonateInput, truncateChatForContext } from './utils/moduleManager.js'; // Import from central hub
import { swipe, chat, redisplayChat, Generate } from '/script.js';
import { SWIPE_DIRECTION, SWIPE_SOURCE, OVERSWIPE_BEHAVIOR } from '/scripts/constants.js';
import { guidedImpersonateSwipe } from './guidedImpersonateSwipe.js';
import { getTokenCountAsync } from '/scripts/tokenizers.js';

// Helper function for delays
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const extensionName = "GuidedGenerations-Extension";
// Helper function to execute STScripts using the context method
// NOTE: This version assumes executeSlashCommandsWithOptions exists and handles errors locally.
// It might need adjustments based on the exact SillyTavern API if it changes.
async function executeSTScriptCommand(command) {
    try {
        // Check if SillyTavern context is available
        if (typeof SillyTavern !== 'undefined' && typeof SillyTavern.getContext === 'function') {
            const context = SillyTavern.getContext();
            // Check if the method exists on the context
            if (typeof context.executeSlashCommandsWithOptions === 'function') {
                // Execute the command via the context
                await context.executeSlashCommandsWithOptions(command, { /* options if needed, e.g., showOutput: false */ });
            } else {
                console.error('[GuidedGenerations] context.executeSlashCommandsWithOptions function not found.');
                alert("Guided Swipe Error: Cannot find the function to execute STScript commands on the context.");
                throw new Error("STScript execution method executeSlashCommandsWithOptions not found on context.");
            }
        } else {
            console.error('[GuidedGenerations] SillyTavern.getContext function not found.');
            alert("Guided Swipe Error: Cannot access SillyTavern context.");
            throw new Error("SillyTavern.getContext not found.");
        }
    } catch (error) {
        console.error(`[GuidedGenerations] Error executing STScript command "${command}":`, error);
        // Re-throw the error to be caught by the calling function's try/catch block
        throw error;
    }
}

/**
 * Finds the last swipe for the last message, navigates directly to it,
 * and triggers one more swipe (generation) by calling context.swipe.right().
 * Uses direct manipulation for navigation and waits for generation end event.
 * @param {number} forceTargetIndex - Optional index to force a swipe on.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
async function generateNewSwipe(forceTargetIndex = -1) {
    // Ensure necessary functions/objects are available from SillyTavern's scope
    let context = getContext();
    const expectedContextProps = ['chat', 'messageFormatting', 'eventSource', 'event_types'];
    const missingProps = expectedContextProps.filter(prop => !(prop in context) || context[prop] === undefined);

    if (missingProps.length > 0) {
        const errorMessage = `Could not get necessary functions/objects from context. Missing: ${missingProps.join(', ')}`;
        console.error(`[GuidedGenerations][Swipe] ${errorMessage}`);
        alert(`Guided Swipe Error: ${errorMessage}`);
        return false;
    }

    // Destructure necessary functions and variables from the context *after* validation
    const { chat, messageFormatting, eventSource, event_types } = context;

    try {
        // --- 1. Navigate to Last Existing Swipe (Directly) ---
        context = getContext(); // Get fresh context again before manipulation
        if (!context || context.chat.length === 0) {
            console.error("[GuidedGenerations][Swipe] Could not get chat context for swiping.");
            alert("Guided Swipe Error: Cannot access chat context.");
            return false;
        }

        // DETERMINE TARGET INDEX
        let targetIndex = forceTargetIndex >= 0 ? forceTargetIndex : context.chat.length - 1;
        
        if (forceTargetIndex < 0) {
            // Check for globally set target (from the "Set as Target" button)
            if (typeof window.GuidedGenerations !== 'undefined' && 
                typeof window.GuidedGenerations.getGuidedGenerationTargetMessageId === 'function') {
                const manualTarget = window.GuidedGenerations.getGuidedGenerationTargetMessageId();
                if (manualTarget !== null && manualTarget !== undefined) {
                     // Ensure it's a number and valid
                     const parsedTarget = parseInt(manualTarget);
                     if (!isNaN(parsedTarget) && parsedTarget >= 0 && parsedTarget < context.chat.length) {
                         targetIndex = parsedTarget;
                         debugLog(`[Swipe] Using manually set target message index: ${targetIndex}`);
                     }
                }
            }
        }

        let messageData = context.chat[targetIndex];
        const mesDom = document.querySelector(`#chat .mes[mesid="${targetIndex}"]`);

        // --- TOKEN COUNTING (INPUT/PRE-SWIPE) ---
        const textarea = document.getElementById('send_textarea');
        if (textarea && textarea.value.trim()) {
            const inputTokens = await getTokenCountAsync(textarea.value);
            debugLog(`Input Token Count (Swipe): ${inputTokens}`);
        }

        // Check if there are swipes and if navigation is needed
        if (messageData && Array.isArray(messageData.swipes) && messageData.swipes.length > 1) {
            const targetSwipeIndex = messageData.swipes.length - 1;
            if (messageData.swipe_id !== targetSwipeIndex) {
                debugLog(`[Swipe] Navigating directly from swipe ${messageData.swipe_id} to last swipe ${targetSwipeIndex}.`);
                
                // Use SillyTavern's native swipe function to navigate safely
                if (typeof swipe === 'function') {
                    // Force the swipe to the specific ID
                    await swipe(null, SWIPE_DIRECTION.RIGHT, { 
                        source: 'GuidedGenerations', 
                        repeated: false, 
                        forceMesId: targetIndex, 
                        forceSwipeId: targetSwipeIndex 
                    });
                } else {
                    console.warn("[Swipe] Native swipe function not found, falling back to direct manipulation (risky).");
                    messageData.swipe_id = targetSwipeIndex;
                    messageData.mes = messageData.swipes[targetSwipeIndex];
                    // Optional: Update extra fields if needed, similar to swipes-go
                    // messageData.extra = structuredClone(messageData.swipe_info?.[targetSwipeIndex]?.extra);
                    // ... other fields

                    if (mesDom) {
                        // Update message text in DOM
                        const mesTextElement = mesDom.querySelector('.mes_text');
                        if (mesTextElement) {
                            mesTextElement.innerHTML = messageFormatting(
                                messageData.mes, messageData.name, messageData.is_system, messageData.is_user, targetIndex
                            );
                        }
                        // Update swipe counter in DOM
                        [...mesDom.querySelectorAll('.swipes-counter')].forEach(it => it.textContent = `${messageData.swipe_id + 1}/${messageData.swipes.length}`);
                    } else {
                        debugLog(`[Swipe] Could not find DOM element for message ${targetIndex} to update UI during direct navigation.`);
                    }

                    // Save chat and notify - Removed saveChatConditional() as it's not available
                    eventSource.emit(event_types.MESSAGE_SWIPED, targetIndex);
                }

                // Update button visibility - Removed showSwipeButtons() as it's not available
                // showSwipeButtons();
                // Use standard setTimeout for delay as context.delay is missing
                await new Promise(resolve => setTimeout(resolve, 150)); // Delay for UI updates/event propagation
            } else {
                debugLog("[Swipe] Already on the last existing swipe.");
            }
        } else {
            debugLog("[Swipe] No existing swipes or only one swipe found. Proceeding to generate first/next swipe.");
        }

        // --- 2. Trigger the *New* Swipe Generation (Using context.swipe.right()) ---
        context = getContext(); // Get fresh context again before calling swipe.right
        if (!context || !context.swipe || typeof context.swipe.right !== 'function') {
            const warningMessage = "Guided Generations Feature Error: Core functionality (like SillyTavern.getContext().swipe.right) is missing. Please update SillyTavern to version 1.13.0 or newer for Swipe, Correction, and Edit Intro features to work correctly.";
            console.error(`[GuidedGenerations][Swipe] ${warningMessage}`);
            alert(warningMessage);
            return false;
        }

        debugLog(`[Swipe] Triggering new swipe generation for index ${targetIndex}...`);

        // Wait for any active generation to finish/clear (is_send_press is global in ST)
        if (typeof window.is_send_press !== 'undefined' && window.is_send_press) {
            debugLog('[Swipe] Generation active (is_send_press), waiting...');
            let attempts = 0;
            while (window.is_send_press && attempts < 20) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
            if (window.is_send_press) {
                console.warn('[Swipe] Timed out waiting for is_send_press to clear. Attempting swipe anyway.');
            }
        }
        
        // Safe swipe execution handling both last and historical messages
        try {
            debugLog(`[Swipe] Triggering swipe for index ${targetIndex}. Total chat length: ${chat.length}`);
            
            // Apply Context Limit Truncation
            const restore = truncateChatForContext(targetIndex);
            
            try {
                debugLog(`[Swipe] Calling Generate('swipe') for targetIndex ${targetIndex}. Final message in truncated chat is index ${chat.length - 1}`);
                
                // Directly trigger generation for the swiped message
                // This ensures it behaves like a manual 'swipe' click in SillyTavern
                // Note: Generate('swipe') specifically handles swiping the last message in current chat array
                
                const genPromise = Generate('swipe');
                
                debugLog(`[Swipe] Awaiting GENERATION_ENDED...`);
                // --- 3. Wait for Generation to Finish ---
                const generationPromise = new Promise((resolve) => {
                    const successListener = (mesId) => {
                        debugLog(`[Swipe] Generation ended signal received for message ${mesId}. Target index was ${targetIndex}.`);
                        resolve(true);
                    };

                    eventSource.once(event_types.GENERATION_ENDED, successListener);
                });

                // Await both the Generate call and the event
                await Promise.all([genPromise, generationPromise]);

                // --- TOKEN COUNTING (OUTPUT/POST-SWIPE) ---
                const finalMessageData = chat[targetIndex];
                if (finalMessageData && finalMessageData.mes) {
                    const outputTokens = await getTokenCountAsync(finalMessageData.mes);
                    debugLog(`Output Token Count (Swipe): ${outputTokens}`);
                }
            } finally {
                // Restore messages
                restore();
                
                // Redisplay the restored messages to ensure DOM consistency
                if (typeof redisplayChat === 'function') {
                    debugLog(`[Swipe] Restoration complete. Redisplaying chat...`);
                    await redisplayChat(chat, targetIndex);
                } else {
                    console.warn("[GuidedGenerations] redisplayChat not found, chat history restored but DOM might be incomplete until reload.");
                }
            }
        } catch (err) {
            console.error("[GuidedGenerations][Swipe] Swipe execution failed:", err);
            throw err;
        }

        // Use standard setTimeout for delay as context.delay is missing
        await new Promise(resolve => setTimeout(resolve, 200)); // Small delay after generation finishes

        return true; // Indicate success

    } catch (error) {
        console.error("[GuidedGenerations][Swipe] Error during swipe generation process:", error);
        // Format error for alert, preventing duplicate prefixes if already formatted
        const errorMessage = String(error.message || error).startsWith('Guided Swipe Error:')
            ? String(error.message || error)
            : `Guided Swipe Error: ${error.message || error}`;
        // Ensure alert is shown even if error is just a string
        alert(errorMessage || "Guided Swipe Error: An unknown error occurred.");
        return false; // Indicate failure
    }
}

/**
 * Performs a guided swipe: injects current input as context, swipes to the end,
 * generates a new response, and restores the original input.
 * Uses the extracted generateNewSwipe function and local executeSTScriptCommand.
 */
const guidedSwipe = async (event) => {
    if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
    }
    const textarea = document.getElementById('send_textarea');
    if (!textarea) {
        console.error('[GuidedGenerations][Swipe] Textarea #send_textarea not found.');
        alert("Guided Swipe Error: Textarea not found.");
        return; // Cannot proceed without textarea
    }
    const originalInput = textarea.value; // Get current input

    const depth = extension_settings[extensionName]?.depthPromptGuidedSwipe ?? 0;

    // DETERMINE TARGET INDEX
    let targetIndex = chat.length - 1;
    // Check for globally set target (from the "Set as Target" button)
    if (typeof window.GuidedGenerations !== 'undefined' && 
        typeof window.GuidedGenerations.getGuidedGenerationTargetMessageId === 'function') {
        const manualTarget = window.GuidedGenerations.getGuidedGenerationTargetMessageId();
        if (manualTarget !== null && manualTarget !== undefined) {
             const parsedTarget = parseInt(manualTarget);
             if (!isNaN(parsedTarget) && parsedTarget >= 0 && parsedTarget < chat.length) {
                 targetIndex = parsedTarget;
                 debugLog(`[Swipe] Using manually set target message index: ${targetIndex}`);
             }
        }
    }

    // If no input, skip injection and do a plain swipe
    if (!originalInput.trim()) {
        debugLog("[Swipe] No input detected, performing plain swipe.");
        const swipeSuccess = await generateNewSwipe(targetIndex);
        if (swipeSuccess) {
            debugLog("[Swipe] Swipe finished successfully.");
        } else {
            console.error("[GuidedGenerations][Swipe] Swipe failed.");
        }
        return;
    }

    // Get the LATEST injection role setting HERE
    const injectionRole = extension_settings[extensionName]?.injectionEndRole ?? 'system'; // Get the role setting

    try {
        // Save the input state using the shared function (imported)
        setPreviousImpersonateInput(originalInput);

        // Use user-defined guided swipe prompt override
        const promptTemplate = extension_settings[extensionName]?.promptGuidedSwipe ?? '';
        const filledPrompt = promptTemplate.replace('{{input}}', originalInput);

        // --- 1. Store Input & Inject Context (if any) --- (Use direct context method)
        if (originalInput.trim() || (promptTemplate.trim() !== '' && promptTemplate.trim() !== '{{input}}')) {
            // Use the currentInjectionRole retrieved above
            const stscriptCommand = `/inject id=instruct position=chat ephemeral=true scan=true depth=${depth} role=${injectionRole} ${filledPrompt} |`;
            
            // Get context and execute directly
            if (typeof SillyTavern !== 'undefined' && typeof SillyTavern.getContext === 'function') {
                const context = SillyTavern.getContext();
                if (typeof context.executeSlashCommandsWithOptions === 'function') {
                    await context.executeSlashCommandsWithOptions(stscriptCommand);
                    debugLog('[Swipe] Executed Command:', stscriptCommand); 
                    // Add delay to ensure any flags (like is_send_press) set by command execution are cleared
                    await new Promise(resolve => setTimeout(resolve, 300));
                } else {
                    throw new Error("context.executeSlashCommandsWithOptions function not found.");
                }
            } else {
                throw new Error("SillyTavern.getContext function not found.");
            }
        } else {
            debugLog("[Swipe] No input detected, skipping injection.");
        }
        

        // Wait for the injection to appear in context (with retries and delay)
        let injectionFound = false;
        const maxAttempts = 5; // Keep the number of attempts
        const checkDelay = 150; // Milliseconds to wait between checks

        for (let i = 0; i < maxAttempts; i++) {
            const currentContext = SillyTavern.getContext(); // Get fresh context each time
            if (currentContext.chatMetadata?.script_injects?.instruct) {
                debugLog(`[Swipe] Injection found after attempt ${i + 1}.`);
                injectionFound = true;
                break; // Exit loop once found

            }
            // If not found, wait before the next check (unless it's the last attempt)
            if (i < maxAttempts - 1) {
                debugLog(`[Swipe] Injection check ${i + 1} failed, waiting ${checkDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, checkDelay));
            }
        }

        // If injection was never found after all attempts
        if (!injectionFound) {
            const errorMsg = "[GuidedGenerations][Swipe] Critical Error: Guided instruction injection ('instruct') failed to appear in chatMetadata.script_injects after multiple checks.";
            console.error(errorMsg);
            alert("Guided Swipe Error: Could not verify instruction injection ('instruct'). Aborting swipe generation.");
            // Clean up potentially failed injection attempt and restore input before returning
            textarea.value = originalInput;
            // Use the correct key for deletion as well
            await executeSTScriptCommand('/flushinject instruct');
            return; // Stop execution
        }

                // --- 2. Generate the new swipe --- (This now only runs if injection was found)
        debugLog('[Swipe] Instruction injection confirmed. Proceeding to generate new swipe...');
        
        // Check if target is a user message
        const targetMessage = chat[targetIndex];
        let swipeSuccess = false;
        
        if (targetMessage && targetMessage.is_user) {
            debugLog(`[Swipe] Target is a user message, delegating to guidedImpersonateSwipe for generation.`);
            swipeSuccess = await guidedImpersonateSwipe(targetIndex, filledPrompt);
        } else {
            swipeSuccess = await generateNewSwipe(targetIndex);
        }

        if (swipeSuccess) {
            debugLog("[Swipe] Guided Swipe finished successfully.");
            await new Promise(resolve => setTimeout(resolve, 3000));
        } else {
            console.error("[GuidedGenerations][Swipe] Guided Swipe failed during swipe generation step.");
            // Error likely already alerted within generateNewSwipe
        }

    } catch (error) {
        // Catch errors specific to the guidedSwipe wrapper (e.g., from executeSTScriptCommand)
        console.error("[GuidedGenerations][Swipe] Error during guided swipe wrapper execution:", error);
        // Avoid duplicate alerts if generateNewSwipe already alerted
        if (!String(error.message).startsWith('Guided Swipe Error:')) {
            alert(`Guided Swipe Error: ${error.message}`);
        }
    } finally {
        // Always attempt to restore the input field from the shared state (imported)
        if (textarea) { // Check if textarea was found initially
            const restoredInput = getPreviousImpersonateInput();
            debugLog(`[Swipe] Restoring input field to: "${restoredInput}" (finally block)`);
            textarea.value = restoredInput;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            // This case should ideally not happen if the initial check passed
            debugLog("[Swipe] Textarea was not available for restoration in finally block.");
        }
        // Clean up injection using the correct key
        debugLog('[Swipe] Cleaning up injection (finally block)');
        await executeSTScriptCommand('/flushinject instruct'); // Already using 'instruct' ID here, which seems correct
    }
};

// Export both functions
export { guidedSwipe, generateNewSwipe };


