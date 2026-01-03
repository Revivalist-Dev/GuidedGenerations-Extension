/**
 * Fun Popup - Handles UI for fun prompts and interactions
 */

import { getContext, extension_settings, extensionName, debugLog, handleSwitching } from '../utils/exportManager.js'; // Import from central hub

// Map to store fun prompts loaded from file
let FUN_PROMPTS = {};

/**
 * Load fun prompts from the text file
 */
async function loadFunPrompts() {
    try {
        // Use the correct path for SillyTavern extensions
        const presetPath = `scripts/extensions/third-party/GuidedGenerations-Extension/scripts/tools/funPrompts.txt`;
        
        const response = await fetch(presetPath);
        
        if (!response.ok) {
            console.error(`${extensionName}: Failed to load fun prompts file. Status: ${response.status}`);
            if (response.status === 404) {
                console.error(`${extensionName}: Make sure 'funPrompts.txt' exists in the extension folder.`);
            }
            return;
        }
        
        debugLog(`${extensionName}: Successfully loaded fun prompts from:`, presetPath);
        
        const text = await response.text();
        const lines = text.split('\n').filter(line => line.trim() && !line.startsWith('#'));
        
        FUN_PROMPTS = {};
        
        lines.forEach(line => {
            const parts = line.split('|');
            if (parts.length >= 4) {
                const [key, title, description, prompt] = parts;
                FUN_PROMPTS[key.trim()] = {
                    title: title.trim(),
                    description: description.trim(),
                    prompt: prompt.trim()
                };
            }
        });
        
        debugLog(`${extensionName}: Loaded ${Object.keys(FUN_PROMPTS).length} fun prompts from file`);
    } catch (error) {
        console.error(`${extensionName}: Error loading fun prompts:`, error);
        // Fallback to empty prompts if file can't be loaded
        FUN_PROMPTS = {};
    }
}

// Class to handle the popup functionality
export class FunPopup {
    constructor() {
        this.popupElement = null;
        this.initialized = false;
    }

    /**
     * Initialize the popup
     */
    async init() {
        if (this.initialized) return;

        // Load prompts from file first
        await loadFunPrompts();

        // Create popup container if it doesn't exist
        if (!document.getElementById('funPopup')) {
            const funPromptsHtml = Object.entries(FUN_PROMPTS).map(([key, { title, description }]) => `
                <div class="gg-fun-prompt-row">
                    <button type="button" class="gg-fun-button" data-prompt="${key}">${title}</button>
                    <span class="gg-fun-prompt-description">${description}</span>
                </div>
            `).join('');

            const popupHtml = `
                <div id="funPopup" class="gg-popup">
                    <div class="gg-popup-content">
                        <div class="gg-popup-header">
                            <h2>Fun Prompts</h2>
                            <span class="gg-popup-close">&times;</span>
                        </div>
                        <div class="gg-popup-body">
                            <div class="gg-popup-section">
                                <div class="gg-fun-prompts-container">
                                    ${funPromptsHtml}
                                </div>
                            </div>
                        </div>
                        <div class="gg-popup-footer">
                            <button type="button" class="gg-button-secondary gg-close-button">Close</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', popupHtml);
            this.popupElement = document.getElementById('funPopup');
            this.addEventListeners();
        }

        this.initialized = true;
    }

    /**
     * Add event listeners to the popup
     */
    addEventListeners() {
        // Close button
        const closeBtn = this.popupElement.querySelector('.gg-popup-close');
        const closeFooterBtn = this.popupElement.querySelector('.gg-close-button');
        
        closeBtn.addEventListener('click', () => this.close());
        closeFooterBtn.addEventListener('click', () => this.close());

        // Close when clicking outside the popup
        this.popupElement.addEventListener('click', (e) => {
            if (e.target === this.popupElement) {
                this.close();
            }
        });

        // Add event listeners to the dynamically created buttons
        const funPromptsContainer = this.popupElement.querySelector('.gg-fun-prompts-container');
        funPromptsContainer.addEventListener('click', (e) => {
            const button = e.target.closest('.gg-fun-button');
            if (button) {
                const promptKey = button.dataset.prompt;
                this.handleFunPrompt(promptKey);
            }
        });
    }

    /**
     * Handle fun prompt selection
     * @param {string} promptKey - The key of the selected prompt
     */
    async handleFunPrompt(promptKey) {
        const funPrompt = FUN_PROMPTS[promptKey];
        if (!funPrompt) return;

        // Close the popup immediately and execute the prompt in the background
        this.close();
        await this._executePrompt(funPrompt.prompt);
    }

    /**
     * Executes a given prompt string, handling group and single chats.
     * @param {string} promptText - The prompt to execute.
     */
    async _executePrompt(promptText) {
        const context = getContext();
        if (!context || typeof context.executeSlashCommandsWithOptions !== 'function') {
            console.error(`${extensionName}: Context unavailable to execute fun prompt.`);
            return;
        }

        // Handle profile and preset switching using unified utility
        const profileKey = 'profileFun';
        const presetKey = 'presetFun';
        const profileValue = extension_settings[extensionName]?.[profileKey] ?? '';
        const presetValue = extension_settings[extensionName]?.[presetKey] ?? '';
        debugLog(`${extensionName}: Using profile: ${profileValue || 'current'}, preset: ${presetValue || 'none'}`);
        
        // Capture the original profile BEFORE any switching happens
        let originalProfile = '';
        try {
            // Get current profile before any switching
            const { getCurrentProfile } = await import('../utils/exportManager.js');
            originalProfile = await getCurrentProfile();
            debugLog(`[FunPopup] Captured original profile before switching: "${originalProfile}"`);
        } catch (error) {
            debugLog(`[FunPopup] Could not get original profile:`, error);
        }
        
        const { switch: switchProfileAndPreset, restore } = await handleSwitching(profileValue, presetValue, originalProfile);

        // Get the current input from the textarea
        const textarea = document.getElementById('send_textarea');
        const currentInput = textarea ? textarea.value.trim() : '';

        // Get the configured injection role from settings
        const injectionRole = extension_settings[extensionName]?.injectionEndRole ?? 'system';

        let stscriptCommand = '';
        const filledPrompt = promptText.replace(/\n/g, '\\n'); // Escape newlines for the script

        // Check if it's a group chat
        if (context.groupId) {
            let characterListJson = '[]';
            try {
                const groups = context.groups || [];
                const currentGroup = groups.find(group => group.id === context.groupId);

                if (currentGroup && Array.isArray(currentGroup.members)) {
                    const characterNames = currentGroup.members.map(member => {
                        return (typeof member === 'string' && member.toLowerCase().endsWith('.png')) ? member.slice(0, -4) : member;
                    }).filter(Boolean);

                    if (characterNames.length > 0) {
                        characterListJson = JSON.stringify(characterNames);
                    }
                }
            } catch (error) {
                console.error(`${extensionName}: Error processing group members:`, error);
            }

            if (characterListJson !== '[]') {
                stscriptCommand = 
`// Group chat logic for Fun Prompt|
/buttons labels=${characterListJson} "Select character to respond"|
/setglobalvar key=selection {{pipe}}|
/inject id=instruct position=chat ephemeral=true scan=true depth=0 role=${injectionRole} ${filledPrompt}In addition, make sure to take the following into consideration: {{input}}]|
/trigger await=true {{getglobalvar::selection}}|
`;
            } else {
                // Fallback for group chat if members can't be found
                stscriptCommand = `// Fallback logic for Fun Prompt|
/inject id=instruct position=chat ephemeral=true scan=true depth=0 role=${injectionRole} ${filledPrompt}In addition, make sure to take the following into consideration: {{input}}]|
/trigger await=true|
`;
            }
        } else {
            // Single character logic
            stscriptCommand = `// Single character logic for Fun Prompt|
/inject id=instruct position=chat ephemeral=true scan=true depth=0 role=${injectionRole} ${filledPrompt}In addition, make sure to take the following into consideration: {{input}}]|
/trigger await=true|
`;
        }

        try {
            // Switch profile and preset before executing
            await switchProfileAndPreset();
            
            // Execute the command
            await context.executeSlashCommandsWithOptions(stscriptCommand, {
                showOutput: false,
                handleExecutionErrors: true
            });
            
            // Restore original profile and preset after completion
            await restore();
        } catch (error) {
            console.error(`${extensionName}: Error executing fun prompt script:`, error);
            
            // Restore original profile and preset on error
            await restore();
        }
    }

    /**
     * Open the popup
     */
    async open() {
        if (!this.initialized) {
            await this.init();
        }
        
        this.popupElement.style.display = 'block';
        document.body.classList.add('gg-popup-open');
    }

    /**
     * Close the popup
     */
    close() {
        if (this.popupElement) {
            this.popupElement.style.display = 'none';
            document.body.classList.remove('gg-popup-open');
        }
    }
}

// Singleton instance
const funPopup = new FunPopup();
export default funPopup;
