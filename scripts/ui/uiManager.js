// Import logging from the new logger util
import { debugLog, debugWarn, debugError } from '../utils/logger.js';
import { extensionName, getImpersonateTemplate, setGuidedGenerationTargetMessageId, getGuidedGenerationTargetMessageId, updatePersistentGuideCounter } from '../../index.js';
import { getSettings, updateSetting } from '../utils/settingsManager.js';
import { getContext } from '/scripts/extensions.js';
import { safeImport } from '../utils/importManager.js';


let _currentSelectedText = '';
// Add new variable to store full selection info
let _currentSelectionInfo = null;

// Import actions dynamically or via safe wrappers to prevent circular deps where possible
import { simpleSend } from '../simpleSend.js';
import { recoverInput } from '../inputRecovery.js';
import { guidedSwipe } from '../guidedSwipe.js';
import { guidedResponse } from '../guidedResponse.js';
import { guidedContinue, undoLastGuidedAddition, revertToOriginalGuidedContinue } from '../guidedContinue.js';
import { guidedImpersonate } from '../guidedImpersonate.js';
import { getSelectedTextInfo } from '../guidedRewrite.js'; // Import helper to capture selection info

/**
 * Main UI Initialization
 */
export async function initializeUI() {
    debugLog("Initializing UI Manager...");
    
    // Initial buttons render
    await updateExtensionButtons();
    
    // QR Bar Integration - Targeted Observer
    setupQRMutationObserver();
    integrateQRBar(); 
    
    // Target Button
    initializeTargetButton();
    
    // Rewrite Menu
    initRewriteMenu();
    
    // Initial adjustment in case the panel is already open on load
    // adjustPopupPosition(); // Removed popup adjustment
}

/**
 * Updates the extension buttons (Menu, QR, Actions) based on current settings.
 */
export async function updateExtensionButtons() {
    const settings = getSettings();
    if (!settings) return;

    const sendForm = document.getElementById('send_form');
    const nonQRFormItems = document.getElementById('nonQRFormItems');

    if (!sendForm || !nonQRFormItems) {
        debugWarn("send_form or nonQRFormItems not found. Skipping button update.");
        return;
    }

    // Container setup
    let buttonContainer = document.getElementById('gg-action-button-container');
    if (!buttonContainer) {
        buttonContainer = document.createElement('div');
        buttonContainer.id = 'gg-action-button-container';
        buttonContainer.className = 'gg-action-buttons-container';
        nonQRFormItems.parentNode.insertBefore(buttonContainer, nonQRFormItems.nextSibling);
    }
    buttonContainer.innerHTML = '';

    const menuButtonsContainer = document.createElement('div');
    menuButtonsContainer.id = 'gg-menu-buttons-container';
    menuButtonsContainer.className = 'gg-menu-buttons-container';
    
    const qrContainer = document.createElement('div');
    qrContainer.id = 'gg-qr-container';
    qrContainer.className = 'gg-qr-container';

    const actionButtonsContainer = document.createElement('div');
    actionButtonsContainer.id = 'gg-regular-buttons-container';
    actionButtonsContainer.className = 'gg-regular-buttons-container';
    
    buttonContainer.append(menuButtonsContainer, qrContainer, actionButtonsContainer);

    // 1. Create Menus
    createToolsMenuButton(menuButtonsContainer);
    createPersistentGuidesButton(menuButtonsContainer);

    // 2. Create Action Buttons
    const createBtn = (id, title, iconClass, actionFunc) => {
        const btn = document.createElement('div');
        btn.id = id;
        btn.className = `gg-action-button interactable ${iconClass}`;
        btn.title = title;
        btn.onclick = (e) => { e.stopPropagation(); actionFunc(e); };
        return btn;
    };

    if (settings.showSimpleSendButton) actionButtonsContainer.appendChild(createBtn('gg_simple_send_button', 'Simple Send', 'fa-solid fa-paper-plane', simpleSend));
    if (settings.showRecoverInputButton) actionButtonsContainer.appendChild(createBtn('gg_recover_input_button', 'Recover Input', 'fa-solid fa-arrow-rotate-left', recoverInput));

    if (settings.showEditIntrosButton) {
        actionButtonsContainer.appendChild(createBtn('gg_edit_intros_button', 'Edit Intros', 'fa-solid fa-user-edit', async () => {
            const module = await safeImport('./scripts/tools/editIntros.js', 'Edit Intros');
            if (module?.default) module.default();
        }));
    }

    if (settings.showCorrectionsButton) {
        actionButtonsContainer.appendChild(createBtn('gg_corrections_button', 'Corrections', 'fa-solid fa-file-alt', async () => {
             const module = await safeImport('./scripts/tools/corrections.js', 'Corrections');
             if (module?.corrections) module.corrections();
        }));
    }

    if (settings.showSpellcheckerButton) {
        actionButtonsContainer.appendChild(createBtn('gg_spellchecker_button', 'Spellchecker', 'fa-solid fa-spell-check', async () => {
             const module = await safeImport('./scripts/tools/spellchecker.js', 'Spellchecker');
             if (module?.spellchecker) module.spellchecker();
        }));
    }

    if (settings.showClearInputButton) {
        actionButtonsContainer.appendChild(createBtn('gg_clear_input_button', 'Clear Input', 'fa-solid fa-trash', async () => {
             const module = await safeImport('./scripts/tools/clearInput.js', 'Clear Input');
             if (module?.default) module.default();
        }));
    }

    if (settings.showImpersonate) {
        const templateId = settings.impersonateTemplate || '1st';
        const template = (typeof getImpersonateTemplate === 'function') ? getImpersonateTemplate(templateId) : null;
        const personaLabel = template ? template.name : (templateId === '1st' ? '1st Person' : (templateId === '2nd' ? '2nd Person' : '3rd Person'));
        actionButtonsContainer.appendChild(createBtn('gg_impersonate_button', `Guided Impersonate (${personaLabel})`, 'fa-solid fa-user', () => guidedImpersonate(templateId)));
    }

    if (settings.showGuidedSwipe) actionButtonsContainer.appendChild(createBtn('gg_swipe_button', 'Guided Swipe', 'fa-solid fa-forward', guidedSwipe));
    if (settings.showGuidedResponse) actionButtonsContainer.appendChild(createBtn('gg_response_button', 'Guided Response', 'fa-solid fa-dog', guidedResponse));
    if (settings.showGuidedContinue) actionButtonsContainer.appendChild(createBtn('gg_continue_button', 'Guided Continue', 'fa-solid fa-arrow-right', guidedContinue));
    
    if (settings.showUndoButton) actionButtonsContainer.appendChild(createBtn('gg_undo_button', 'Undo Last Addition', 'fa-solid fa-rotate-left', undoLastGuidedAddition));
    if (settings.showRevertButton) actionButtonsContainer.appendChild(createBtn('gg_revert_button', 'Revert to Original', 'fa-solid fa-history', revertToOriginalGuidedContinue));

    // 3. Integrate QR
    integrateQRBar();
    
    // 4. Update Counters
    updatePersistentGuideCounter();
}

/**
 * Creates the "Wand" Tools Menu
 */
function createToolsMenuButton(container) {
    if (document.getElementById('gg_menu_button')) return;

    const btn = document.createElement('div');
    btn.id = 'gg_menu_button';
    btn.className = 'gg-menu-button fa-solid fa-bookmark interactable';
    btn.title = 'Guided Generations Tools';

    const menu = document.createElement('div');
    menu.id = 'gg_tools_menu';
    menu.className = 'gg-tools-menu';

    // Helper to add items
    const addItem = (icon, text, action, title = "") => {
        const item = document.createElement('a');
        item.href = '#';
        item.className = 'interactable';
        item.innerHTML = `<i class="fa-solid ${icon} fa-fw"></i><span data-i18n="${text}">${text}</span>`;
        if (title) item.title = title;
        item.onclick = (e) => {
            e.stopPropagation();
            action();
            menu.classList.remove('shown');
        };
        menu.appendChild(item);
    };

    addItem('fa-paper-plane', 'Simple Send', simpleSend, "Sends input without triggering response.");
    addItem('fa-arrow-rotate-left', 'Recover Input', recoverInput, "Restores previously typed input.");
    
    const sep1 = document.createElement('hr'); sep1.className = 'pg-separator'; menu.appendChild(sep1);
    
    addItem('fa-rotate-left', 'Undo Last Addition', undoLastGuidedAddition, "Removes last guided continue segment.");
    addItem('fa-history', 'Revert to Original', revertToOriginalGuidedContinue, "Restores message to original state.");
    
    const sep2 = document.createElement('hr'); sep2.className = 'pg-separator'; menu.appendChild(sep2);

    addItem('fa-user-edit', 'Edit Intros', async () => {
        const m = await safeImport('./scripts/tools/editIntros.js', 'Edit Intros');
        if(m?.default) m.default();
    }, "Edit or regenerate character introductions.");

    addItem('fa-file-alt', 'Corrections', async () => {
        const m = await safeImport('./scripts/tools/corrections.js', 'Corrections');
        if(m?.corrections) m.corrections();
    }, "Instruct AI to rewrite last message with corrections.");

    addItem('fa-spell-check', 'Spellchecker', async () => {
        const m = await safeImport('./scripts/tools/spellchecker.js', 'Spellchecker');
        if(m?.spellchecker) m.spellchecker();
    }, "Check and correct grammar/flow.");

    addItem('fa-trash', 'Clear Input', async () => {
        const m = await safeImport('./scripts/tools/clearInput.js', 'Clear Input');
        if(m?.default) m.default();
    });
    
    addItem('fa-question-circle', 'Help', () => {
        window.open('https://github.com/Samueras/GuidedGenerations-Extension/wiki', '_blank');
    }, "Opens extension wiki.");

    document.body.appendChild(menu);

    btn.onclick = (e) => {
        e.stopPropagation();
        toggleMenu(btn, menu);
    };

    container.appendChild(btn);
}

/**
 * Creates the "Book" Persistent Guides Menu
 */
function createPersistentGuidesButton(container) {
    if (document.getElementById('pg_menu_button')) return;

    const btn = document.createElement('div');
    btn.id = 'pg_menu_button';
    btn.className = 'gg-menu-button fa-solid fa-book-open-reader interactable';
    btn.title = 'Persistent Guides';

    const menu = document.createElement('div');
    menu.id = 'pg_tools_menu';
    menu.className = 'gg-tools-menu';

    // Content Guides
    const contentGuides = [
        { name: 'Situational', icon: 'fa-location-dot', path: './scripts/persistentGuides/situationalGuide.js' },
        { name: 'Thinking', icon: 'fa-brain', path: './scripts/persistentGuides/thinkingGuide.js' },
        { name: 'Clothes', icon: 'fa-shirt', path: './scripts/persistentGuides/clothesGuide.js' },
        { name: 'State', icon: 'fa-face-smile', path: './scripts/persistentGuides/stateGuide.js' },
        { name: 'Rules', icon: 'fa-list-ol', path: './scripts/persistentGuides/rulesGuide.js' },
        { name: 'Custom', icon: 'fa-pen-to-square', path: './scripts/persistentGuides/customGuide.js' },
        { name: 'Custom Auto', icon: 'fa-robot', path: './scripts/persistentGuides/customAutoGuide.js' },
        { name: 'Fun', icon: 'fa-gamepad', path: './scripts/persistentGuides/funGuide.js' }
    ];

    const toolGuides = [
        { name: 'Show Guides', icon: 'fa-eye', path: './scripts/persistentGuides/showGuides.js' },
        { name: 'Edit Guides', icon: 'fa-edit', path: './scripts/persistentGuides/editGuides.js' },
        { name: 'Flush Guides', icon: 'fa-trash', path: './scripts/persistentGuides/flushGuides.js' },
        { name: 'Stat Tracker', icon: 'fa-chart-line', path: './scripts/persistentGuides/trackerGuide.js' }
    ];

    const addGuideItem = (g) => {
        const item = document.createElement('a');
        item.href = '#';
        item.className = 'interactable';
        item.innerHTML = `<i class="fa-solid ${g.icon} fa-fw"></i><span data-i18n="${g.name}">${g.name}</span>`;
        item.onclick = async (e) => {
            e.stopPropagation();
            const m = await safeImport(g.path, g.name);
            if (m?.default) m.default();
            menu.classList.remove('shown');
        };
        menu.appendChild(item);
    };

    contentGuides.forEach(addGuideItem);
    const sep = document.createElement('hr'); sep.className = 'pg-separator'; menu.appendChild(sep);
    toolGuides.forEach(addGuideItem);

    document.body.appendChild(menu);

    btn.onclick = (e) => {
        e.stopPropagation();
        toggleMenu(btn, menu);
    };

    container.appendChild(btn);
}

/**
 * Universal Menu Toggle Helper
 */
function toggleMenu(button, menu) {
    document.querySelectorAll('.gg-tools-menu.shown').forEach(m => {
        if (m !== menu) m.classList.remove('shown');
    });

    if (menu.classList.contains('shown')) {
        menu.classList.remove('shown');
        return;
    }

    menu.style.visibility = 'hidden';
    menu.style.display = 'block';
    const height = menu.offsetHeight;
    menu.style.display = '';
    menu.style.visibility = '';

    const rect = button.getBoundingClientRect();
    const gap = 5;
    const top = rect.top - gap + window.scrollY - height;
    const left = rect.left + window.scrollX;

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.classList.add('shown');
}

document.addEventListener('click', (e) => {
    const menus = document.querySelectorAll('.gg-tools-menu.shown');
    menus.forEach(menu => {
        menu.classList.remove('shown');
    });
});


/**
 * QR Bar Integration with MutationObserver (Targeted)
 */
export function integrateQRBar() {
    const qrBar = document.getElementById('qr--bar');
    const qrContainer = document.getElementById('gg-qr-container');
    const settings = getSettings();
    const sendForm = document.getElementById('send_form');

    if (!qrBar || !qrContainer || !settings) return;

    if (settings.integrateQrBar) {
        if (qrBar.parentElement !== qrContainer) {
            qrContainer.appendChild(qrBar);
        }
    } else {
        if (qrBar.parentElement === qrContainer && sendForm) {
            sendForm.appendChild(qrBar);
        }
    }
}

export function setupQRMutationObserver() {
    const observer = new MutationObserver((mutations) => {
        let shouldCheck = false;
        for (const m of mutations) {
            for (const n of m.addedNodes) {
                if (n.id === 'qr--bar' || (n.querySelector && n.querySelector('#qr--bar'))) {
                    shouldCheck = true;
                    break;
                }
            }
            if (shouldCheck) break;
        }
        if (shouldCheck) integrateQRBar();
    });

    observer.observe(document.body, { childList: true, subtree: true });
}


/**
 * Initialize "Set as Target" button logic
 */
export function initializeTargetButton() {
    const targetButtonHtml = `<div title="Set as Guided Generation Target" class="mes_button guided_target_button fa-solid fa-crosshairs interactable" tabindex="0" role="button"></div>`;
    const undoButtonHtml = `<div title="Undo Last Rewrite" class="mes_button guided_undo_rewrite_button fa-solid fa-rotate-left interactable" tabindex="0" role="button" style="display:none;"></div>`;

    const $templateTarget = $("#message_template .mes_buttons .extraMesButtons");
    if ($templateTarget.length) {
        if ($templateTarget.find('.guided_undo_rewrite_button').length === 0) $templateTarget.prepend(undoButtonHtml);
        if ($templateTarget.find('.guided_target_button').length === 0) $templateTarget.prepend(targetButtonHtml);
    }

    $("#chat .mes").each(function() {
        const $extraButtons = $(this).find(".extraMesButtons");
        if ($extraButtons.length) {
            if ($extraButtons.find(".guided_target_button").length === 0) $extraButtons.prepend(targetButtonHtml);
            if ($extraButtons.find(".guided_undo_rewrite_button").length === 0) $extraButtons.prepend(undoButtonHtml);
        }
    });

    $("#chat").off("click", ".guided_target_button").on("click", ".guided_target_button", function(e) {
        e.stopPropagation();
        const mesId = $(this).closest(".mes").attr("mesid");
        if (mesId) {
            const current = getGuidedGenerationTargetMessageId();
            setGuidedGenerationTargetMessageId(current == mesId ? null : mesId);
        }
    });

    $("#chat").off("click", ".guided_undo_rewrite_button").on("click", ".guided_undo_rewrite_button", async function(e) {
        e.stopPropagation();
        const mesId = $(this).closest(".mes").attr("mesid");
        const module = await safeImport('./scripts/guidedRewrite.js', 'Guided Rewrite');
        if (module?.undoRewrite) module.undoRewrite(mesId);
    });
}

/**
 * Initialize Context Menu for Rewrite
 */
export async function initRewriteMenu() {
    await loadRewriteContextMenu(); // Load the external HTML
    document.addEventListener('selectionchange', () => {
        // Debounce or slight delay to allow click events on menu to potentially fire before selection clears
        setTimeout(() => {
             // Only process if we aren't clicking the menu
             const menu = document.getElementById('gg_rewrite_menu');
             if (menu && menu.matches(':hover')) {
                 debugLog('Skipping selection processing because hovering menu');
                 return;
             }
             processSelection();
        }, 100);
    });
    document.addEventListener('mousedown', (e) => {
        const ggRewriteMenu = document.getElementById('gg_rewrite_menu');
        if (ggRewriteMenu && !ggRewriteMenu.contains(e.target)) {
            removeGGREwriteMenu();
        }
    });
    const chatContainer = document.getElementById('chat');
    if (chatContainer) {
        chatContainer.addEventListener('scroll', positionGGREwriteMenu);
    }
}

/**
 * Loads the Rewrite Context Menu HTML into the DOM.
 */
async function loadRewriteContextMenu() {
    try {
        // Always remove existing menu to ensure fresh listeners and HTML
        const existingMenu = document.getElementById('gg_rewrite_menu');
        if (existingMenu) {
             debugLog('Removing existing Rewrite Context Menu to ensure fresh initialization.');
             existingMenu.remove();
        }

        const response = await fetch('/scripts/extensions/third-party/GuidedGenerations-Extension/html/rewriteContextMenu.html');
        if (response.ok) {
            const html = await response.text();
            document.body.insertAdjacentHTML('beforeend', html);
            debugLog('Rewrite Context Menu HTML loaded successfully.');
            attachRewriteMenuListeners();
        } else {
            debugError('Failed to load Rewrite Context Menu HTML:', response.statusText);
        }
    } catch (error) {
        debugError('Error loading Rewrite Context Menu HTML:', error);
    }
}

function attachRewriteMenuListeners() {
    const menu = document.getElementById('gg_rewrite_menu');
    if (!menu) return;

    // Monitor mousedown to see if it precedes selection change
    menu.addEventListener('mousedown', (e) => {
        debugLog('Rewrite Menu: mousedown detected on menu');
    });

    // Delegate click events for menu items
    menu.addEventListener('click', async (e) => {
        debugLog('Rewrite Menu: Click detected', e.target);
        const item = e.target.closest('.gg-ctx-item');
        if (!item) {
            debugLog('Rewrite Menu: No item found via closest()');
            return;
        }

        e.stopPropagation(); // Prevent document click from immediately closing if needed elsewhere

        if (item.classList.contains('gg-ctx-settings')) {
            // Settings action (placeholder for now, or open settings)
             debugLog('Rewrite Menu: Settings clicked');
             // Example: open settings or toggle something
        } else {
            const action = item.getAttribute('data-action');
            debugLog(`Rewrite Menu: Action triggered: ${action}`);
            if (action) {
                // Capture current selection info before opening popup or clearing selection
                // _currentSelectionInfo is populated during processSelection, ensuring it matches
                // what the user actually selected.
                const selectionToUse = _currentSelectionInfo; 
                
                // Hide menu immediately to prevent it from being captured in any DOM snapshots or overlapping
                removeGGREwriteMenu();

                if (action === 'instruct') {
                    // Pull custom instructions from the textarea instead of a popup
                    const textarea = document.getElementById('send_textarea');
                    const instructions = textarea ? textarea.value.trim() : '';
                    
                    debugLog('Rewrite Menu: Using textarea input as instructions:', instructions);
                    if (instructions) {
                            // Pass instructions AND the preserved selection info to guided rewrite logic
                            const module = safeImport('./scripts/guidedRewrite.js', 'Guided Rewrite');
                            module.then(m => {
                                if (m && m.handleGuidedRewrite) {
                                    // Pass preserved selection info
                                    m.handleGuidedRewrite('Custom', instructions, selectionToUse); 
                                } else if (m && m.handleRewriteAction) {
                                    debugWarn('GuidedGenerations [DEBUG] Using deprecated handleRewriteAction for instruct');
                                    m.handleRewriteAction('instruct', _currentSelectedText, instructions);
                                } else {
                                    debugError('GuidedGenerations [DEBUG] No suitable rewrite handler found on module for instruct');
                                }
                            });
                    } else {
                        // Optional: Alert user if textarea is empty when they click "Custom"
                        alert('Please enter your custom instructions in the chat input box first.');
                    }
                } else {
                    const module = await safeImport('./scripts/guidedRewrite.js', 'Guided Rewrite');
                    
                     if (module && (module.handleGuidedRewrite || module.handleRewriteAction)) {
                         // Pass preserved selection info if needed (handleRewriteAction might need update too)
                         // But likely handleGuidedRewrite is the modern entry point.
                         // For now assume standard actions also benefit from preserved selection if rewritten to use handleGuidedRewrite
                         if (module.handleGuidedRewrite) {
                            // Capitalize action to match Switch case in guidedRewrite.js (e.g. 'rewrite' -> 'Rewrite')
                            const mode = action.charAt(0).toUpperCase() + action.slice(1);
                            module.handleGuidedRewrite(mode, '', selectionToUse);
                         } else {
                            module.handleRewriteAction(action, _currentSelectedText);
                         }
                    } else {
                        debugError('GuidedGenerations [DEBUG] No suitable rewrite handler found on module for action:', action);
                    }
                }
            }
        }
    });
}


function processSelection() {
    debugLog('processSelection running');
    const selection = window.getSelection();
    _currentSelectedText = selection.toString().trim();
    
    // Capture full selection details immediately
    // This function must be imported from guidedRewrite.js (or exportManager) to ensure consistent structure
    _currentSelectionInfo = getSelectedTextInfo(); 

    // Log if we are about to hide the menu while it might be needed
    const menu = document.getElementById('gg_rewrite_menu');
    if (menu && menu.classList.contains('shown')) {
        debugLog('processSelection: Hiding existing menu due to selection change.');
    }

    removeGGREwriteMenu();

    if (_currentSelectedText.length > 0) {
        const range = selection.getRangeAt(0);
        const startMesText = range.startContainer.parentElement?.closest('.mes_text');
        const endMesText = range.endContainer.parentElement?.closest('.mes_text');

        if (startMesText && endMesText && startMesText === endMesText) {
             showGGREwriteMenu(range); // Renamed from createGGREwriteMenu to reflect showing hidden element
        }
    }
}

/**
 * Shows and positions the Rewrite Context Menu.
 */
function showGGREwriteMenu(range) {
    const menu = document.getElementById('gg_rewrite_menu');
    if (!menu) return;

    const rect = range.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

    menu.style.display = 'block'; // Make it visible to calculate dimensions
    
    // Simple positioning above the selection
    const menuHeight = menu.offsetHeight;
    let top = rect.top + scrollTop - menuHeight - 10;
    let left = rect.left + scrollLeft;

    // Adjust if goes off screen (basic check)
    if (top < 0) top = rect.bottom + scrollTop + 10; 

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.classList.add('shown');
}

/**
 * Hides the Rewrite Context Menu.
 */
function removeGGREwriteMenu() {
    const menu = document.getElementById('gg_rewrite_menu');
    if (menu) {
        menu.style.display = 'none';
        menu.classList.remove('shown');
    }
}

function positionGGREwriteMenu() {
    // Logic to update position on scroll if needed, 
    // or just hide it on scroll which is often simpler/cleaner.
    removeGGREwriteMenu();
}
