import { debugLog, debugError } from '../../index.js';
import { safeImport } from '../utils/moduleManager.js';
import { showCustomRewritePopup } from './uiManager.js'; // Will be a circular dependency, but we'll address that in a later step

let ggRewriteMenu = null;

export function createGGREwriteMenu(currentSelectedText) {
    removeGGREwriteMenu();

    ggRewriteMenu = document.createElement('ul');
    ggRewriteMenu.className = 'gg-ctx-menu';

    // Load the context menu HTML dynamically
    loadRewriteContextMenuHtml(ggRewriteMenu).then(() => {
        document.body.appendChild(ggRewriteMenu);
        positionGGREwriteMenu();

        // Attach event listeners to the dynamically loaded items
        ggRewriteMenu.querySelectorAll('.gg-ctx-item[data-action]').forEach(item => {
            item.addEventListener('mousedown', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const action = item.dataset.action;
                
                const module = await safeImport('./scripts/utils/moduleManager.js', 'Export Manager');
                if (module?.handleGuidedRewrite) {
                    let customInstructions = null;
                    let selectionInfo = null;

                    if (action === 'instruct') {
                        if (module.getSelectedTextInfo) {
                            selectionInfo = await module.getSelectedTextInfo();
                        }
                        customInstructions = await showCustomRewritePopup(currentSelectedText);
                        if (!customInstructions) return;
                        await module.handleGuidedRewrite(action, customInstructions, selectionInfo);
                    } else {
                        await module.handleGuidedRewrite(action, customInstructions, selectionInfo);
                    }
                }
                removeGGREwriteMenu();
            });
        });

        const settingsItem = ggRewriteMenu.querySelector('.gg-ctx-settings-item');
        if (settingsItem) {
            settingsItem.addEventListener('mousedown', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Context menu settings clicked!');
                removeGGREwriteMenu();
            });
        }
    }).catch(error => {
        debugError('Error creating rewrite context menu:', error);
    });
}

async function loadRewriteContextMenuHtml(menuElement) {
    try {
        const response = await fetch('/scripts/extensions/third-party/GuidedGenerations-Extension/html/rewriteContextMenu.html');
        if (response.ok) {
            const html = await response.text();
            menuElement.innerHTML = html;
        } else {
            debugError('Failed to load rewrite context menu HTML:', response.statusText);
            throw new Error('Failed to load rewrite context menu HTML');
        }
    } catch (error) {
        debugError('Error loading rewrite context menu HTML:', error);
        throw error;
    }
}

export function positionGGREwriteMenu() {
    if (!ggRewriteMenu) return;
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    let left = rect.left + window.scrollX;
    let top = rect.bottom + window.scrollY + 5;
    
    if (left + ggRewriteMenu.offsetWidth > window.innerWidth) {
        left = window.innerWidth - ggRewriteMenu.offsetWidth - 10;
    }
    if (top + ggRewriteMenu.offsetHeight > window.innerHeight) {
        top = rect.top + window.scrollY - ggRewriteMenu.offsetHeight - 5;
    }

    ggRewriteMenu.style.left = `${left}px`;
    ggRewriteMenu.style.top = `${top}px`;
}

export function removeGGREwriteMenu() {
    if (ggRewriteMenu) {
        ggRewriteMenu.remove();
        ggRewriteMenu = null;
    }
}


