import { getContext, extension_settings, extensionName, handleSwitching, debugLog, createTrackerNote } from '../utils/exportManager.js'; // Import from central hub

/**
 * Generic runner for Persistent Guides STScript commands.
 * @param {{
 *   guideId: string,
 *   genAs?: string,
 *   genCommandSuffix?: string,
 *   finalCommand?: string,
 *   isAuto?: boolean,
 *   previousInjectionAction?: 'move' | 'flush' | 'none'
 *   raw?: boolean,
 *   skipSituationalTracker?: boolean
 * }} options
 * @returns {Promise<string|null>} Returns pipe output or null on failure.
 */
export async function runGuideScript({ guideId, genAs = '', genCommandSuffix = '', finalCommand = '', isAuto = false, previousInjectionAction = 'none', raw = false, skipSituationalTracker = false }) {
    // ENHANCED DEBUGGING: Track when runGuideScript is called
    console.log(`[AUTOTRIGGER-DEBUG] runGuideScript called with:`, {
        guideId: guideId,
        isAuto: isAuto,
        timestamp: new Date().toISOString(),
        executionId: Math.random().toString(36).substr(2, 9),
        stackTrace: new Error().stack
    });

    // Determine user-defined preset and profile for this guide
    const presetKey = `preset${guideId.charAt(0).toUpperCase()}${guideId.slice(1)}`;
    const profileKey = `profile${guideId.charAt(0).toUpperCase()}${guideId.slice(1)}`;
    
    const rawPreset = extension_settings[extensionName]?.[presetKey] ?? '';
    const rawProfile = extension_settings[extensionName]?.[profileKey] ?? '';
    
    const presetValue = rawPreset.trim().replace(/\|/g, ''); // Remove pipe characters to prevent STScript injection
    const profileValue = rawProfile.trim();

    // Get the switch and restore functions from the utility
    const presetHandler = await handleSwitching(profileValue || null, presetValue || null);
    const { switch: switchPreset, restore } = presetHandler;

    // Handle previous injection based on action
    let initCmd = '';
    if (previousInjectionAction === 'move') {
        initCmd = `// Read existing injection|
/listinjects return=object |
/let injections {{pipe}} |
/let x {{var::injections}} |
/var index=${guideId} x |
/let y {{pipe}} |
/var index=value y |
/inject id=${guideId} position=chat scan=true depth=4 [Relevant Informations for portraying characters {{pipe}}] |`;
    } else if (previousInjectionAction === 'flush') {
        initCmd = `/flushinject ${guideId} |`;
    }

    // First: Execute the guide generation alone to capture the output
    const asClause = genAs ? `${genAs} ` : '';
    // Generate guide content: use raw command if requested
    const genLine = raw ? `${genCommandSuffix} |` : `/gen ${asClause}${genCommandSuffix} |`;
    const genScript = `${initCmd ? initCmd + '\n' : ''}${genLine}`;
    
    // Second: Build injection script that will use the captured content
    let injectionScript = finalCommand;

    // Only add /listinjects if we're not creating Situational Tracker notes
    if (!isAuto && (skipSituationalTracker || !extension_settings[extensionName]?.persistentGuidesInChatlog)) {
        injectionScript += '\n/listinjects |';
    } else if (!injectionScript.trim().endsWith('|')) {
        injectionScript += ' |';
    }

    // Switch to the target profile/preset before executing the script
    if (profileValue || presetValue) {
        // Wait for profile/preset switching to complete using the utility function
        if (profileValue && presetValue) {
            debugLog(`${extensionName}: Switching to profile "${profileValue}" and preset "${presetValue}" and waiting for completion...`);
        } else if (profileValue) {
            debugLog(`${extensionName}: Switching to profile "${profileValue}" and waiting for completion...`);
        } else if (presetValue) {
            debugLog(`${extensionName}: Switching to preset "${presetValue}" and waiting for completion...`);
        }
        await switchPreset();
        debugLog(`${extensionName}: Profile/preset switch completed successfully`);
    }

    // Execute STScript via SillyTavern context
    const context = getContext();
    if (context && typeof context.executeSlashCommandsWithOptions === 'function') {
        try {
            // Step 1: Execute guide generation to capture the output
            debugLog(`[${extensionName}] Executing guide generation script...`);
            const genResult = await context.executeSlashCommandsWithOptions(genScript, {
                showOutput: false,
                handleExecutionErrors: true
            });
            
            // Capture the guide output
            const capturedGuideOutput = genResult?.pipe || '';
            debugLog(`[${extensionName}] Captured guide output length: ${capturedGuideOutput?.length || 0}`);
            
            // Step 2: Execute injection script using the captured content
            if (capturedGuideOutput && capturedGuideOutput.trim() !== '') {
                // Replace {{pipe}} in injection script with actual content
                const injectionScriptWithContent = injectionScript.replace(/\{\{pipe\}\}/g, capturedGuideOutput);
                debugLog(`[${extensionName}] Executing injection script...`);
                
                await context.executeSlashCommandsWithOptions(injectionScriptWithContent, {
                    showOutput: false,
                    handleExecutionErrors: true
                });
                debugLog(`[${extensionName}] Injection script executed successfully`);
            }
            
            // Create Situational Tracker note if enabled and not skipped
            debugLog(`[${extensionName}] Situational Tracker check: skipSituationalTracker=${skipSituationalTracker}, setting=${extension_settings[extensionName]?.persistentGuidesInChatlog}, guideId=${guideId}`);
            if (!skipSituationalTracker && extension_settings[extensionName]?.persistentGuidesInChatlog) {
                const guideContent = capturedGuideOutput;
                debugLog(`[${extensionName}] Guide content length: ${guideContent?.length || 0}, content: "${guideContent?.substring(0, 100)}..."`);
                if (guideContent && guideContent.trim() !== '') {
                    // Check if the last message is a Situational Tracker, or if the last message is a Stat Tracker, check the one before that
                    const lastMessage = context.chat[context.chat.length - 1];
                    const secondLastMessage = context.chat.length > 1 ? context.chat[context.chat.length - 2] : null;
                    
                    let lastSituationalTrackerMessage = null;
                    
                    if (lastMessage?.extra?.type === 'situationaltracker') {
                        // Last message is a Situational Tracker - append to it
                        lastSituationalTrackerMessage = lastMessage;
                        debugLog(`[${extensionName}] Last message is a Situational Tracker, will append to it`);
                    } else if (lastMessage?.extra?.type === 'stattracker' && secondLastMessage?.extra?.type === 'situationaltracker') {
                        // Last message is a Stat Tracker, but the one before is a Situational Tracker - append to that
                        lastSituationalTrackerMessage = secondLastMessage;
                        debugLog(`[${extensionName}] Last message is Stat Tracker, but second last is Situational Tracker, will append to that`);
                    }
                    
                    if (lastSituationalTrackerMessage) {
                        // Append to existing message - add as a new collapsible section
                        const separator = '\n\n---\n\n';
                        const guideName = guideId.charAt(0).toUpperCase() + guideId.slice(1);
                        const newCollapsibleSection = `<details class="situational-tracker-details" data-tracker-type="situationaltracker">
    <summary>
        📊 ${guideName} Guide - Click to expand
    </summary>
    <div>
        ${guideContent}
    </div>
</details>`;
                        
                        // Insert the new collapsible section after the closing </details> tag
                        const lastDetailsIndex = lastSituationalTrackerMessage.mes.lastIndexOf('</details>');
                        if (lastDetailsIndex !== -1) {
                            const beforeClosingDetails = lastSituationalTrackerMessage.mes.substring(0, lastDetailsIndex);
                            const afterClosingDetails = lastSituationalTrackerMessage.mes.substring(lastDetailsIndex);
                            lastSituationalTrackerMessage.mes = beforeClosingDetails + afterClosingDetails + separator + newCollapsibleSection;
                        } else {
                            // Fallback: just append to the end
                            lastSituationalTrackerMessage.mes += separator + newCollapsibleSection;
                        }
                        
                        await context.saveChat();
                        await context.reloadCurrentChat();
                        debugLog(`[${extensionName}] Appended ${guideId} guide content as new collapsible section to existing Situational Tracker`);
                    } else {
                        // Create new Situational Tracker note
                        const guideName = guideId.charAt(0).toUpperCase() + guideId.slice(1);
                        const content = `${guideName} Guide:\n${guideContent}`;
                        
                        // Create collapsible message with collapsed state by default
                        const collapsibleContent = `<details class="situational-tracker-details" data-tracker-type="situationaltracker">
    <summary>
        📊 ${guideName} Guide - Click to expand
    </summary>
    <div>
        ${content}
    </div>
</details>`;
                        
                        debugLog(`[${extensionName}] Creating new Situational Tracker note for ${guideId}`);
                        await createTrackerNote(collapsibleContent, 'Situational Tracker', 'situationaltracker');
                        debugLog(`[${extensionName}] Situational Tracker note created successfully`);
                    }
                } else {
                    debugLog(`[${extensionName}] No guide content to create tracker note for`);
                }
            } else {
                debugLog(`[${extensionName}] Situational Tracker creation skipped: skipSituationalTracker=${skipSituationalTracker}, setting=${extension_settings[extensionName]?.persistentGuidesInChatlog}`);
            }
            
            if (capturedGuideOutput && capturedGuideOutput.trim() !== '') {
                return capturedGuideOutput;
            }
            return null;
        } catch (err) {
            console.error(`${extensionName}: Error executing guide script for ${guideId}:`, err);
            return null;
        } finally {
            // Always restore the original profile/preset and wait for completion
            if (profileValue || presetValue) {
                debugLog(`${extensionName}: Restoring original profile/preset...`);
                await restore();
                debugLog(`${extensionName}: Profile/preset restore completed`);
            }
        }
    } else {
        console.error(`${extensionName}: Context unavailable to execute guide script for ${guideId}.`);
        // Also restore if context is not available
        if (profileValue || presetValue) {
            await restore();
        }
        return null;
    }
}

