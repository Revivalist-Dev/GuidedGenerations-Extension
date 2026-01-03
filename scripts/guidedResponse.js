import { getContext, extension_settings, isGroupChat, setPreviousImpersonateInput, getPreviousImpersonateInput, debugLog, truncateChatForContext, chat, redisplayChat } from './utils/moduleManager.js';
import { getTokenCountAsync } from '/scripts/tokenizers.js';

// Import the guide scripts for direct execution
import thinkingGuide from './persistentGuides/thinkingGuide.js';
import stateGuide from './persistentGuides/stateGuide.js';
import clothesGuide from './persistentGuides/clothesGuide.js';
import customAutoGuide from './persistentGuides/customAutoGuide.js';

const extensionName = "GuidedGenerations-Extension";

/**
 * Executes a guided response generation.
 * Handles both single-character and group chat scenarios with instruction injection and guide execution.
 */
const guidedResponse = async () => {
    const textarea = document.getElementById('send_textarea');
    if (!textarea) {
        console.error(`[${extensionName}][Response] Textarea #send_textarea not found.`);
        return;
    }

    const context = getContext();
    if (!context || typeof context.executeSlashCommandsWithOptions !== 'function') {
        console.error(`[${extensionName}][Response] SillyTavern context or required execution method not available.`);
        return;
    }

    const originalInput = textarea.value;
    const settings = extension_settings[extensionName] || {};
    const injectionRole = settings.injectionEndRole ?? 'system';
    const promptTemplate = settings.promptGuidedResponse ?? '';
    const filledPrompt = promptTemplate.replace('{{input}}', originalInput);
    const depth = settings.depthPromptGuidedResponse ?? 0;

    // --- TOKEN COUNTING (INPUT) ---
    if (originalInput.trim()) {
        const inputTokens = await getTokenCountAsync(originalInput);
        debugLog(`Input Token Count (Response): ${inputTokens}`);
    }

    // Determine target message index
    let targetIndex = chat.length - 1;
    if (typeof window.GuidedGenerations?.getGuidedGenerationTargetMessageId === 'function') {
        const manualTarget = window.GuidedGenerations.getGuidedGenerationTargetMessageId();
        if (manualTarget !== null && manualTarget !== undefined) {
            const parsedTarget = parseInt(manualTarget);
            if (!isNaN(parsedTarget) && parsedTarget >= 0 && parsedTarget < chat.length) {
                targetIndex = parsedTarget;
                debugLog(`[${extensionName}][Response] Using manual target index: ${targetIndex}`);
            }
        }
    }

    // Save input for restoration
    setPreviousImpersonateInput(originalInput);

    // Build the Slash Command script
    let stscriptCommand = '';

    if (isGroupChat()) {
        const characterList = getGroupMemberNames(context);
        
        if (characterList.length > 0) {
            const characterListJson = JSON.stringify(characterList);
            stscriptCommand = [
                `// Group chat logic|`,
                `/buttons labels=${characterListJson} "Select member to respond as" |`,
                `/setglobalvar key=selection {{pipe}} |`,
                `/inject id=instruct position=chat ephemeral=true scan=true depth=${depth} role=${injectionRole} ${filledPrompt} |`,
                `/trigger await=true {{getglobalvar::selection}}|`
            ].join('\n');
        } else {
            console.warn(`[${extensionName}][Response] Empty character list for group chat. Falling back to single-character logic.`);
            stscriptCommand = buildSingleCharacterScript(depth, injectionRole, filledPrompt);
        }
    } else {
        stscriptCommand = buildSingleCharacterScript(depth, injectionRole, filledPrompt);
    }

    // Execute Guide Scripts before triggering generation
    await executeGuideScripts();

    // Apply Context Limit Truncation and Execute
    const restore = truncateChatForContext(targetIndex);
    
    try {
        await context.executeSlashCommandsWithOptions(stscriptCommand);
        debugLog(`[${extensionName}][Response] Executed script.`);

        // --- TOKEN COUNTING (OUTPUT) ---
        const lastMessageData = chat[chat.length - 1];
        if (lastMessageData && !lastMessageData.is_user) {
            const outputTokens = await getTokenCountAsync(lastMessageData.mes);
            debugLog(`Output Token Count (Response): ${outputTokens}`);
        }
    } catch (error) {
        console.error(`[${extensionName}][Response] Execution failed:`, error);
    } finally {
        restore();
        if (typeof redisplayChat === 'function') await redisplayChat();

        // Restore UI state
        const restoredInput = getPreviousImpersonateInput();
        textarea.value = restoredInput;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
};

/**
 * Executes enabled guide scripts.
 */
async function executeGuideScripts() {
    try {
        await Promise.all([
            thinkingGuide(),
            stateGuide(),
            clothesGuide(),
            customAutoGuide()
        ]);
        debugLog(`[${extensionName}][Response] Guide scripts executed.`);
    } catch (error) {
        console.error(`[${extensionName}][Response] Error executing guide scripts:`, error);
    }
}

/**
 * Extracts character names from group members, stripping file extensions.
 * @param {Object} context SillyTavern context.
 * @returns {string[]} List of sanitized names.
 */
function getGroupMemberNames(context) {
    try {
        const currentGroup = context?.groups?.find(g => g.id === context?.groupId);
        if (!currentGroup?.members) return [];

        return currentGroup.members
            .map(member => (typeof member === 'string' && member.toLowerCase().endsWith('.png')) ? member.slice(0, -4) : member)
            .filter(name => name);
    } catch (error) {
        console.error(`[${extensionName}][Response] Error processing group members:`, error);
        return [];
    }
}

/**
 * Builds the slash command script for single character generation.
 */
function buildSingleCharacterScript(depth, role, prompt) {
    return [
        `// Single character logic|`,
        `/inject id=instruct position=chat ephemeral=true scan=true depth=${depth} role=${role} ${prompt}|`,
        `/trigger await=true|`
    ].join('\n');
}

export { guidedResponse };


