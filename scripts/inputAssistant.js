import { getContext } from '/scripts/extensions.js';
import { getSettings } from './utils/settingsManager.js';
import { debugLog, debugError } from './utils/logger.js';
import { extensionName } from '../index.js';

// --- Constants ---
const IDLE_TEXT = "Need inspiration? Type a draft and click the button!";
const LOADING_TEXT = "Analyzing your input...";

// --- State ---
let isAnalyzing = false;
let currentSuggestion = null;
let uiObserver = null;

/**
 * Initializes the Input Assistant UI and Event Listeners.
 */
export async function initializeInputAssistant() {
    debugLog(`[${extensionName}] Initializing Input Assistant...`);
    
    injectCSS();
    
    // Initial check
    ensureUI();

    // Set up MutationObserver to handle dynamic DOM updates (e.g. SillyTavern updates)
    const targetNode = document.getElementById('nonQRFormItems') || document.getElementById('send_form');
    if (targetNode) {
        uiObserver = new MutationObserver((mutations) => {
            // Check if our wrapper is gone or textarea is moved out
            const textarea = document.getElementById('send_textarea');
            const wrapper = document.getElementById('gg-input-assistant-wrapper');
            
            if (textarea && (!wrapper || textarea.parentNode !== wrapper)) {
                debugLog(`[${extensionName}] UI disrupted, re-injecting...`);
                ensureUI();
            }
        });

        uiObserver.observe(targetNode, { childList: true, subtree: true });
    }
}

/**
 * Ensures the UI is present and correctly structured.
 */
function ensureUI() {
    // Temporarily disconnect observer to prevent infinite loops during our own DOM manipulation
    if (uiObserver) uiObserver.disconnect();

    try {
        injectUI();
    } catch (e) {
        console.error(`[${extensionName}] Error injecting UI:`, e);
    } finally {
        // Reconnect observer
        const targetNode = document.getElementById('nonQRFormItems') || document.getElementById('send_form');
        if (uiObserver && targetNode) {
            uiObserver.observe(targetNode, { childList: true, subtree: true });
        }
    }
}

/**
 * Injects the Stylesheet for the Input Assistant.
 */
function injectCSS() {
    if (document.getElementById('gg-input-assistant-css')) return;

    const link = document.createElement('link');
    link.id = 'gg-input-assistant-css';
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = `/scripts/extensions/third-party/${extensionName}/style/inputAssistant.css`;
    document.head.appendChild(link);
}

/**
 * Injects the UI components above the Send Textarea.
 */
function injectUI() {
    const textarea = document.getElementById('send_textarea');
    if (!textarea) return;

    // Check if already wrapped correctly
    const parent = textarea.parentNode;
    if (parent.id === 'gg-input-assistant-wrapper') {
        // Wrapper exists, ensure container exists inside
        if (!document.getElementById('gg-input-assistant-container')) {
             const container = createAssistantContainer();
             parent.insertBefore(container, textarea);
        }
        return;
    }

    // If we have a wrapper but it's empty or detached, remove it to start fresh
    const oldWrapper = document.getElementById('gg-input-assistant-wrapper');
    if (oldWrapper) oldWrapper.remove();

    // Create Container (Banner + Button)
    const container = createAssistantContainer();

    // Capture Styles for Wrapper
    const textareaStyle = window.getComputedStyle(textarea);
    const flexGrow = textareaStyle.flexGrow;
    const flexBasis = textareaStyle.flexBasis;
    const margin = textareaStyle.margin;
    const order = textareaStyle.order; 
    const alignSelf = textareaStyle.alignSelf; 
    const width = textareaStyle.width;

    // Create Wrapper
    const wrapper = document.createElement('div');
    wrapper.id = 'gg-input-assistant-wrapper';
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    
    // Mimic Flex Properties
    wrapper.style.flexGrow = flexGrow !== '0' ? flexGrow : '1'; 
    wrapper.style.flexBasis = flexBasis !== 'auto' ? flexBasis : 'auto';
    wrapper.style.margin = margin; 
    wrapper.style.order = order; 
    wrapper.style.alignSelf = alignSelf;
    
    wrapper.style.width = width !== 'auto' ? width : '100%';
    wrapper.style.position = 'relative';
    wrapper.style.minWidth = '0'; 

    // Insert wrapper where textarea was
    if (parent) {
        parent.insertBefore(wrapper, textarea);
    }

    // Move textarea into wrapper
    wrapper.appendChild(container); // Assistant on top
    wrapper.appendChild(textarea);  // Textarea on bottom
    
    // Reset textarea properties to fit in wrapper
    textarea.style.width = '100%';
    textarea.style.margin = '0'; 
    textarea.style.flexGrow = '1';
    textarea.style.order = '0'; 
    
    // Bind Banner Actions (in case they need re-binding)
    const acceptBtn = container.querySelector('#gg-assistant-accept');
    const dismissBtn = container.querySelector('#gg-assistant-dismiss');
    
    if (acceptBtn) acceptBtn.onclick = (e) => { e.preventDefault(); acceptSuggestion(); };
    if (dismissBtn) dismissBtn.onclick = (e) => { e.preventDefault(); dismissSuggestion(); };
}

function createAssistantContainer() {
    // Create Container
    const container = document.createElement('div');
    container.id = 'gg-input-assistant-container';

    // Create Row (Banner + Button)
    const row = document.createElement('div');
    row.className = 'gg-assistant-row';

    // Create Banner
    const banner = document.createElement('div');
    banner.id = 'gg-assistant-banner';
    banner.className = 'idle';
    banner.innerHTML = `
        <div class="gg-banner-content">${IDLE_TEXT}</div>
        <div class="gg-banner-actions" style="display:none">
            <button id="gg-assistant-accept" class="gg-btn-accept" title="Accept Suggestion"><i class="fa-solid fa-check"></i> Accept</button>
            <button id="gg-assistant-dismiss" class="gg-btn-dismiss" title="Dismiss"><i class="fa-solid fa-times"></i></button>
        </div>
    `;

    // Create Trigger Button
    const triggerBtn = document.createElement('div');
    triggerBtn.id = 'gg-assistant-trigger';
    triggerBtn.className = 'gg-action-button interactable fa-solid fa-dice-one'; 
    triggerBtn.title = 'Scan and Refine Input';
    triggerBtn.tabIndex = 0; 
    
    // Handle click & enter
    const triggerAction = (e) => {
        e.preventDefault();
        handleManualTrigger();
    };
    triggerBtn.onclick = triggerAction;
    triggerBtn.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') triggerAction(e);
    };

    // Assemble
    row.appendChild(banner);
    row.appendChild(triggerBtn);
    container.appendChild(row);

    return container;
}


/**
 * Handles the manual trigger (Magic Wand Click).
 */
async function handleManualTrigger() {
    if (isAnalyzing) return;

    const textarea = document.getElementById('send_textarea');
    const input = textarea.value.trim();

    if (!input) {
        toastr.info("Please type something in the input box first.", "Input Assistant");
        return;
    }

    setBannerState('loading');
    isAnalyzing = true;
    document.getElementById('gg-assistant-trigger').classList.add('loading');

    try {
        const suggestion = await performAnalysis(input);
        if (suggestion) {
            currentSuggestion = suggestion;
            setBannerState('suggestion', suggestion);
        } else {
            setBannerState('idle');
            toastr.warning("Could not generate a suggestion.", "Input Assistant");
        }
    } catch (err) {
        debugError(`[${extensionName}] Input Assistant Error:`, err);
        setBannerState('idle');
        toastr.error("An error occurred during analysis.", "Input Assistant");
    } finally {
        isAnalyzing = false;
        document.getElementById('gg-assistant-trigger').classList.remove('loading');
    }
}

/**
 * Generates a suggestion using the AI.
 * @param {string} input - The user's draft text.
 */
async function performAnalysis(input) {
    const settings = getSettings();
    const context = getContext();
    const promptTemplate = settings.promptInputAssistant || "Draft: {{input}}\n\nRewrite this to be more evocative.";

    // Simple replacement
    const prompt = promptTemplate.replace('{{input}}', input);

    debugLog(`[${extensionName}] Generating Input Assistant suggestion...`);

    try {
        const result = await context.generateRaw({
            prompt: prompt,
            max_tokens: 300,
            temperature: 0.7,
            top_p: 0.9,
            stop: ['[/RESULT]', '[/ANALYSIS]'] // Safety stops
        });

        if (!result) return null;

        // Parse Logic (Similar to Rewrites)
        let cleanedResult = result;

        // Extract [RESULT] block if present
        const resultMatch = result.match(/\[RESULT\]([\s\S]*?)(\[\/RESULT\]|$)/i);
        if (resultMatch) {
            cleanedResult = resultMatch[1].trim();
        } else {
            // Clean common tags if no block found
            cleanedResult = cleanedResult.replace(/\[ANALYSIS\][\s\S]*?\[\/ANALYSIS\]/i, '').trim();
            cleanedResult = cleanedResult.replace(/\[\/?RESULT\]/gi, '').trim();
        }

        // Remove wrapping quotes
        if (cleanedResult.startsWith('"') && cleanedResult.endsWith('"')) {
            cleanedResult = cleanedResult.slice(1, -1).trim();
        }

        return cleanedResult;
    } catch (e) {
        console.error("Generation failed:", e);
        return null;
    }
}

/**
 * Updates the Banner UI State.
 * @param {string} state - 'idle', 'loading', 'suggestion'
 * @param {string} [content] - Text content for the suggestion.
 */
function setBannerState(state, content = '') {
    const banner = document.getElementById('gg-assistant-banner');
    const contentDiv = banner.querySelector('.gg-banner-content');
    const actionsDiv = banner.querySelector('.gg-banner-actions');

    banner.className = state; // Replaces classes

    if (state === 'idle') {
        contentDiv.textContent = IDLE_TEXT;
        actionsDiv.style.display = 'none';
    } else if (state === 'loading') {
        contentDiv.textContent = LOADING_TEXT;
        actionsDiv.style.display = 'none';
    } else if (state === 'suggestion') {
        contentDiv.textContent = content;
        actionsDiv.style.display = 'flex';
    }
}

/**
 * Accepts the suggestion and updates the textarea.
 */
function acceptSuggestion() {
    if (!currentSuggestion) return;

    const textarea = document.getElementById('send_textarea');
    textarea.value = currentSuggestion;
    
    // Trigger input event to resize textarea and notify other scripts
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    
    dismissSuggestion();
}

/**
 * Dismisses the current suggestion and returns to idle.
 */
function dismissSuggestion() {
    currentSuggestion = null;
    setBannerState('idle');
}
