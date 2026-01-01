/**
 * @file Contains the core tracker logic for automatically running trackers when enabled.
 * @description Handles the automatic execution of trackers based on chat metadata configuration.
 */

import { getContext, extensionName, debugLog, handleSwitching } from '../utils/exportManager.js'; // Import from central hub

/**
 * Executes the tracker logic automatically when triggered
 * @param {boolean} isAuto - Whether this is being auto-triggered
 * @param {boolean} force - Whether to force execution even if tracker is disabled (for manual execution)
 * @returns {Promise<void>}
 */
export async function executeTracker(isAuto = false, force = false) {
    try {
        const context = getContext();
        if (!context) {
            console.error('[GuidedGenerations] Context not available for tracker execution');
            return;
        }

        // Get tracker configuration from chat metadata
        const trackerConfig = context.chatMetadata?.[`${extensionName}_trackers`];
        if (!trackerConfig || (!trackerConfig.enabled && !force)) {
            debugLog('Tracker not enabled or not configured' + (force ? ' (but forcing execution)' : ''));
            if (!force) {
                return;
            }
        }

        debugLog('Executing tracker with config:', trackerConfig);

        // Check if the last message is a Stat Tracker note - if so, skip tracker execution
        // This check must happen BEFORE any profile switching to avoid switching profiles unnecessarily
        const lastMessage = context.chat[context.chat.length - 1];
        if (lastMessage?.extra?.type === 'stattracker') {
            debugLog('Last message is a Stat Tracker note, skipping tracker execution (likely deleted/broken generation)');
            return;
        }

        // Check if we need to switch to the tracker preset
        const globalSettings = context.extensionSettings?.[extensionName];
        debugLog('Debug - extensionName:', extensionName);
        debugLog('Debug - context.extensionSettings exists:', !!context.extensionSettings);
        debugLog('Debug - extensionSettings[extensionName]:', globalSettings);
        
        let presetHandler = null;
        // Check for tracker profiles and presets - use presetTrackerDetermine and profileTrackerDetermine for the first call
        const trackerDetermineProfile = globalSettings?.profileTrackerDetermine;
        const trackerDeterminePreset = globalSettings?.presetTrackerDetermine;
        if (trackerDetermineProfile || trackerDeterminePreset) {
            debugLog('Switching to tracker determine profile:', trackerDetermineProfile, 'preset:', trackerDeterminePreset);
            try {
                presetHandler = await handleSwitching(trackerDetermineProfile || null, trackerDeterminePreset || null);
                const { switch: switchPreset, restore } = presetHandler;
                await switchPreset();
                debugLog('Successfully switched to tracker determine profile/preset');
            } catch (error) {
                debugLog('Error switching to tracker determine profile/preset:', error);
            }
        } else {
            debugLog('No profile or preset to switch to - profileTrackerDetermine:', globalSettings?.profileTrackerDetermine, 'presetTrackerDetermine:', globalSettings?.presetTrackerDetermine);
        }

        // Step 1: Generate guide content using the first prompt
        let guidePrompt = trackerConfig.guidePrompt;
        
        // If configured to include tracker context, add current tracker content
        if (trackerConfig.includeTrackerInGuide) {
            let currentTrackerContent = '';
            try {
                const listResult = await context.executeSlashCommandsWithOptions(
                    '/listinjects return=object',
                    { showOutput: false, handleExecutionErrors: true }
                );
                
                if (listResult && listResult.pipe) {
                    const injections = JSON.parse(listResult.pipe);
                    if (injections.tracker && injections.tracker.value) {
                        currentTrackerContent = injections.tracker.value;
                    }
                }
            } catch (error) {
                debugLog('Could not retrieve current tracker content for guide prompt, proceeding without it');
            }
            
            if (currentTrackerContent) {
                guidePrompt = `${trackerConfig.guidePrompt}\n\nCurrent Tracker:\n${currentTrackerContent}`;
            }
        }
        
        const guideResult = await context.executeSlashCommandsWithOptions(
            `/gen ${guidePrompt}`,
            { showOutput: false, handleExecutionErrors: true }
        );

        if (!guideResult || !guideResult.pipe) {
            console.error('[GuidedGenerations] Failed to generate guide content');
            return;
        }

        const guideContent = guideResult.pipe;
        debugLog('Generated guide content:', guideContent);

        // Half second delay between the two tracker calls
        debugLog('Waiting 500ms before second tracker call...');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Switch to tracker update profile and preset for the second call
        let updatePresetHandler = null;
        const trackerUpdateProfile = globalSettings?.profileTrackerUpdate;
        const trackerUpdatePreset = globalSettings?.presetTrackerUpdate;
        if (trackerUpdateProfile || trackerUpdatePreset) {
            debugLog('Switching to tracker update profile:', trackerUpdateProfile, 'preset:', trackerUpdatePreset);
            try {
                updatePresetHandler = await handleSwitching(trackerUpdateProfile || null, trackerUpdatePreset || null);
                const { switch: switchPreset, restore } = updatePresetHandler;
                await switchPreset();
                debugLog('Successfully switched to tracker update profile/preset');
            } catch (error) {
                debugLog('Error switching to tracker update profile/preset:', error);
            }
        } else {
            debugLog('No profile or preset to switch to - profileTrackerUpdate:', globalSettings?.profileTrackerUpdate, 'presetTrackerUpdate:', globalSettings?.presetTrackerUpdate);
        }

        // Step 2: Get current tracker content to include in context
        let currentTrackerContent = '';
        try {
            const listResult = await context.executeSlashCommandsWithOptions(
                '/listinjects return=object',
                { showOutput: false, handleExecutionErrors: true }
            );
            
            if (listResult && listResult.pipe) {
                const injections = JSON.parse(listResult.pipe);
                if (injections.tracker && injections.tracker.value) {
                    currentTrackerContent = injections.tracker.value;
                }
            }
        } catch (error) {
            debugLog('Could not retrieve current tracker content, proceeding with empty context');
        }

        // Step 2: Generate tracker update using /genraw with the guide content and current tracker as contex
        const trackerPrompt = `${trackerConfig.trackerPrompt}\n\nLast Update:\n${guideContent}\n\nTracker:\n${currentTrackerContent}`;
        
        const trackerResult = await context.executeSlashCommandsWithOptions(
            `/genraw ${trackerPrompt}`,
            { showOutput: false, handleExecutionErrors: true }
        );

        if (!trackerResult || !trackerResult.pipe) {
            console.error('[GuidedGenerations] Failed to generate tracker update');
            console.error('[GuidedGenerations] trackerResult:', trackerResult);
            return;
        }

        const trackerUpdate = trackerResult.pipe;
        debugLog('Generated tracker update:', trackerUpdate);
        debugLog('Tracker update length:', trackerUpdate?.length || 0);
        debugLog('Tracker update type:', typeof trackerUpdate);

        // Half second delay after the second tracker call
        debugLog('Waiting 500ms after second tracker call...');
        await new Promise(resolve => setTimeout(resolve, 700));

        // Step 3: Update the tracker injection
        if (trackerUpdate && trackerUpdate.trim()) {
            const injectionCommand = `/inject id=tracker position=chat scan=true depth=1 role=system [Tracker Information ${trackerUpdate}]`;
            await context.executeSlashCommandsWithOptions(injectionCommand, { 
                showOutput: false, 
                handleExecutionErrors: true 
            });
            debugLog('Tracker injection updated with content length:', trackerUpdate.length);
        } else {
            console.error('[GuidedGenerations] Tracker update is empty or undefined, skipping injection update');
        }

        // Step 4: Add a comment with the tracker update
        // Try using the standard comment command first, then fall back to custom creation
        await createTrackerNote(trackerUpdate, 'Stat Tracker', 'stattracker', guideContent);

        // Restore the original presets if we switched to tracker presets
        if (updatePresetHandler) {
            debugLog('Restoring original preset from tracker update...');
            try {
                const { restore } = updatePresetHandler;
                await restore();
                debugLog('Successfully restored original preset from tracker update');
                
                // Add additional safety delay after restoration to ensure profile switching is completely settled
                debugLog('Waiting additional 500ms after tracker update restoration to ensure profile stability...');
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error('[GuidedGenerations] Error restoring original preset from tracker update:', error);
            }
        }
        
        if (presetHandler) {
            debugLog('Restoring original preset from tracker determine...');
            try {
                const { restore } = presetHandler;
                await restore();
                debugLog('Successfully restored original preset from tracker determine');
                
                // Add additional safety delay after restoration to ensure profile switching is completely settled
                debugLog('Waiting additional 500ms after tracker determine restoration to ensure profile stability...');
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error('[GuidedGenerations] Error restoring original preset from tracker determine:', error);
            }
        }

        debugLog('Tracker execution completed successfully - all profile restorations finished');

    } catch (error) {
        console.error('[GuidedGenerations] Error executing tracker:', error);
    }
}

/**
 * Checks if tracker should be auto-triggered and executes it if needed
 * @returns {Promise<void>}
 */
export async function checkAndExecuteTracker() {
    try {
        const context = getContext();
        if (!context) {
            return;
        }

        // Check if tracker is enabled in chat metadata
        const trackerConfig = context.chatMetadata?.[`${extensionName}_trackers`];
        if (trackerConfig && trackerConfig.enabled) {
            debugLog('Auto-triggering tracker');
            await executeTracker(true);
        }
    } catch (error) {
        console.error('[GuidedGenerations] Error checking tracker auto-trigger:', error);
    }
}

/**
 * Creates a custom tracker note in the chat
 * Uses the exact same pattern as sendCommentMessage for compatibility
 * @param {string} trackerUpdate - The tracker update content to display
 * @param {string} trackerName - The name to display for the tracker note
 * @param {string} trackerType - The type identifier for the tracker
 * @param {string} guideContent - The guide content that determined the changes (optional)
 * @returns {Promise<void>}
 */
export async function createTrackerNote(trackerUpdate, trackerName, trackerType, guideContent = null) {
    try {
        const context = getContext();
        if (!context || !context.chat) {
            console.error('[GuidedGenerations] Cannot create tracker note: context or chat not available');
            return;
        }

        debugLog(`[TrackerLogic] Creating ${trackerName} note...`);
        
        // Create the message object exactly like sendCommentMessage
        let messageContent = trackerUpdate;
        
        // Add HTML structure for stat trackers to match the CSS styling
        if (trackerType === 'stattracker') {
            // If we have guide content, include it in a separate details tag before the tracker update
            let detailsContent = '';
            
            if (guideContent) {
                detailsContent += `<details class="situational-tracker-details" data-tracker-type="guide-analysis">
    <summary>
        🔍 Analysis - Click to expand
    </summary>
    <div>
${guideContent}
    </div>
</details>`;
            }
            
            detailsContent += `<details class="situational-tracker-details" data-tracker-type="stattracker">
    <summary>
        📊 ${trackerName} - Click to expand
    </summary>
    <div>
${trackerUpdate}
    </div>
</details>`;
            
            messageContent = detailsContent;
        }
        
        const message = {
            name: trackerName,
            is_user: false,
            is_system: true,
            send_date: Date.now(),
            mes: messageContent,
            force_avatar: null,
            extra: {
                type: trackerType, // Custom type for tracker notes
                gen_id: Date.now(),
                isSmallSys: false,
                api: 'manual',
                model: 'tracker system',
            },
        };

        // Add the message to the end of the chat (push version like sendCommentMessage)
        context.chat.push(message);
        debugLog('[TrackerLogic] Message added to chat array. Chat length:', context.chat.length);
        
        // Follow the exact same pattern as sendCommentMessage
        await context.eventSource.emit('MESSAGE_SENT', (context.chat.length - 1));
        await context.addOneMessage(message);
        await context.eventSource.emit('USER_MESSAGE_RENDERED', (context.chat.length - 1));
        await context.saveChat();
        
        debugLog(`[TrackerLogic] ${trackerName} note created successfully using sendCommentMessage pattern`);
    } catch (error) {
        console.error(`[GuidedGenerations] Error creating ${trackerName} note:`, error);
    }
}
