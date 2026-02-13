// Import logging from the new logger util
import { debugLog, debugWarn, debugError } from '../utils/logger.js';
import { getImpersonateTemplate } from '../../index.js';
import { getSettings } from '../utils/settingsManager.js';
import { guidedCorrections } from '../guidedCorrections.js'; 

import { simpleSend } from '../simpleSend.js';
import { recoverInput } from '../inputRecovery.js';
import { guidedSwipe } from '../guidedSwipe.js';
import { guidedResponse } from '../guidedResponse.js';
import { guidedContinue, undoLastGuidedAddition, revertToOriginalGuidedContinue } from '../guidedContinue.js';
import { guidedImpersonate } from '../guidedImpersonate.js';

/**
 * Initialize Button Manager
 */
export async function initializeButtonManager() {
    debugLog("Initializing Button Manager...");
    
    // Initial buttons render
    await updateExtensionButtons();
    
    // QR Bar Integration - Targeted Observer
    setupQRMutationObserver();
    integrateQRBar(); 
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



    if (settings.showCorrectionsButton) {
        actionButtonsContainer.appendChild(createBtn('gg_corrections_button', 'Guided Corrections', 'fa-solid fa-file-alt', guidedCorrections));
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
    

    
    addItem('fa-rotate-left', 'Undo Last Addition', undoLastGuidedAddition, "Removes last guided continue segment.");
    addItem('fa-history', 'Revert to Original', revertToOriginalGuidedContinue, "Restores message to original state.");
    
    const sep2 = document.createElement('hr'); sep2.className = 'pg-separator'; menu.appendChild(sep2);

    addItem('fa-file-alt', 'Guided Corrections', guidedCorrections, "Instruct AI to rewrite last message with corrections.");

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
