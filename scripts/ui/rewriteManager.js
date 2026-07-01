import { debugLog, debugWarn, debugError, extensionName, setGuidedGenerationTargetMessageId, getGuidedGenerationTargetMessageId } from '../../index.js';
import { getContext, extension_settings } from '../../../../../extensions.js';
import { getSelectedTextInfo } from '../guidedRewrite.js';
import { saveSettingsDebounced } from '../../../../../../script.js';

let _currentSelectedText = '';
let _currentSelectionInfo = null;
let _lastMouseUpCoordinates = null;
let _selectionDebounceTimer = null;
let _isMouseDown = false;

/**
 * Initialize Rewrite Manager
 */
export async function initializeRewriteManager() {
    debugLog("Initializing Rewrite Manager...");
    
    // Target Button
    initializeTargetButton();
    
    // Rewrite Menu
    initRewriteMenu();
}

/**
 * Initialize "Set as Target" button logic
 */
export function initializeTargetButton() {
    const targetButtonHtml = `<div title="Set as Guided Generation Target" class="mes_button guided_target_button fa-solid fa-crosshairs interactable" tabindex="0" role="button"></div>`;
    const insertButtonHtml = `<div title="Insert Blank Message Above" class="mes_button guided_insert_button fa-solid fa-plus interactable" tabindex="0" role="button"></div>`;
    const spacerHtml = `<span class="guided_target_separator" style="margin: 0 5px; color: var(--SmartThemeEmColor); user-select: none;">|</span>`;

    // Template Target
    const $templateButtons = $("#message_template .mes_buttons");
    if ($templateButtons.length) {
        if ($templateButtons.find('.guided_target_button').length === 0) {
            const editBtn = $templateButtons.find('.mes_edit');
            if (editBtn.length) {
                editBtn.before(spacerHtml + targetButtonHtml + insertButtonHtml);
            } else {
                $templateButtons.append(spacerHtml + targetButtonHtml + insertButtonHtml);
            }
        }
    }

    $("#chat .mes").each(function() {
        const $mesButtons = $(this).find(".mes_buttons");
        if ($mesButtons.length) {
             if ($mesButtons.find(".guided_target_button").length === 0) {
                 const editBtn = $mesButtons.find('.mes_edit');
                 if (editBtn.length) {
                     editBtn.before(spacerHtml + targetButtonHtml + insertButtonHtml);
                 } else {
                     $mesButtons.append(spacerHtml + targetButtonHtml + insertButtonHtml);
                 }
             }
       }
    });

    $("#chat").off("click", ".guided_insert_button").on("click", ".guided_insert_button", async function(e) {
        e.stopPropagation();
        const $mes = $(this).closest(".mes");
        const mesId = parseInt($mes.attr("mesid"));
        if (isNaN(mesId)) return;

        const context = getContext();
        
        // Build character list for selection
        const characters = [];
        characters.push({ name: context.userName, isUser: true });
        
        if (context.groupId) {
            const currentGroup = context.groups?.find(g => g.id === context.groupId);
            if (currentGroup?.members) {
                currentGroup.members.forEach(m => {
                    const name = (typeof m === 'string' && m.toLowerCase().endsWith('.png')) ? m.slice(0, -4) : m;
                    characters.push({ name: name, isUser: false });
                });
            }
        } else if (context.name) {
            characters.push({ name: context.name, isUser: false });
        }

        try {
            const popupId = 'gg-character-select-popup';
            let popup = document.getElementById(popupId);
            if (popup) popup.remove();

            const buttonsHtml = characters.map(c => {
                const name = c.name || "User";
                const safeName = name.replace(/"/g, '"');
                return `<button class="menu_button" style="padding: 10px; cursor: pointer; text-align: left; margin-bottom: 5px; width: 100%; border: 1px solid var(--grey30, #444); background: var(--black30, #222); color: var(--smart-theme-body-text, #fff);" data-name="${safeName}" data-is-user="${c.isUser}">
                    ${safeName}
                </button>`;
            }).join('');

            const popupHtml = `
                <div id="${popupId}" class="gg-popup" style="display:flex; align-items: center; justify-content: center; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 20000;">
                    <div class="gg-popup-content" style="background: var(--smart-theme-bg, #222); border: 1px solid var(--smart-theme-border, #444); border-radius: 10px; width: 90%; max-width: 400px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 0 20px rgba(0,0,0,0.8);">
                        <div class="gg-popup-header" style="padding: 15px; border-bottom: 1px solid var(--smart-theme-border, #444); display: flex; justify-content: space-between; align-items: center;">
                            <h3 style="margin: 0;">Select Character</h3>
                            <span class="gg-popup-close" style="cursor: pointer; font-size: 24px;">&times;</span>
                        </div>
                        <div class="gg-popup-body" style="overflow-y: auto; padding: 15px; display: flex; flex-direction: column;">
                            ${buttonsHtml}
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', popupHtml);
            popup = document.getElementById(popupId);

            const closePopup = () => {
                if (popup) popup.remove();
            };

            $(popup).find('.gg-popup-close').on('click', closePopup);
            $(popup).on('click', (e) => {
                if (e.target === popup) closePopup();
            });

            $(popup).find('button.menu_button').on('click', async function() {
                const name = $(this).attr('data-name');
                const isUser = $(this).attr('data-is-user') === 'true';
                debugLog(`[RewriteManager] Selected character from popup: ${name}`);
                
                // insertMessageAt logic
                const { insertMessageAt } = await import('./messageManager.js').catch(() => ({}));
                if (insertMessageAt) {
                    insertMessageAt(mesId, name, isUser);
                } else {
                    debugError("[RewriteManager] messageManager.js not found or insertMessageAt missing.");
                }
                closePopup();
            });

        } catch (error) {
            debugError("[RewriteManager] Error during message insertion persona selection:", error);
        }
    });

    $("#chat").off("click", ".guided_target_button").on("click", ".guided_target_button", function(e) {
         e.stopPropagation();
         const $mes = $(this).closest(".mes");
         const mesId = $mes.attr("mesid");
         if (mesId) {
             const current = getGuidedGenerationTargetMessageId();
             const isNowTarget = (current != mesId);
             setGuidedGenerationTargetMessageId(isNowTarget ? mesId : null);
             
             $("#chat .mes.gg-target").removeClass("gg-target");
             $("#chat .mes .guided_target_button.active").removeClass("active");
             
             if (isNowTarget) {
                 $mes.addClass("gg-target");
                 $(this).addClass("active");
                 toastr.info("Message set as Guided Generation Target. Now select the text you wish to rewrite.", "Target Set");
             } else {
                 toastr.info("Guided Generation Target cleared.", "Target Cleared");
             }
         }
     });
}

/**
 * Initialize Context Menu for Rewrite
 */
export async function initRewriteMenu() {
    await loadRewriteContextMenu();
    
    window.addEventListener('mousedown', () => {
        _isMouseDown = true;
    });

    window.addEventListener('mouseup', (e) => {
        _isMouseDown = false;
        _lastMouseUpCoordinates = { x: e.clientX, y: e.clientY };

        if (_selectionDebounceTimer) clearTimeout(_selectionDebounceTimer);
        
        _selectionDebounceTimer = setTimeout(() => {
             processSelection();
        }, 10);
    });

    window.addEventListener('keyup', () => {
        _lastMouseUpCoordinates = null;
    });

    document.addEventListener('selectionchange', () => {
        if (_isMouseDown) return;
        if (_selectionDebounceTimer) {
            clearTimeout(_selectionDebounceTimer);
        }

        _selectionDebounceTimer = setTimeout(() => {
             const menu = document.getElementById('gg_rewrite_menu');
             if (menu && menu.matches(':hover')) {
                 return;
             }
             processSelection();
        }, 300);
    });
    document.addEventListener('mousedown', (e) => {
        const ggRewriteMenu = document.getElementById('gg_rewrite_menu');
        if (ggRewriteMenu && !ggRewriteMenu.contains(e.target)) {
            removeGGREwriteMenu();
        }
    });
}

/**
 * Loads the Rewrite Context Menu HTML into the DOM.
 */
async function loadRewriteContextMenu() {
    try {
        const existingMenu = document.getElementById('gg_rewrite_menu');
        if (existingMenu) {
             existingMenu.remove();
        }

        const response = await fetch('/scripts/extensions/third-party/GuidedGenerations-Extension/html/rewriteContextMenu.html');
        if (response.ok) {
            const html = await response.text();
            document.body.insertAdjacentHTML('beforeend', html);
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

    const updateDiffToggleUI = () => {
        const settings = extension_settings[extensionName];
        const diffToggle = menu.querySelector('.gg-ctx-diff-toggle');
        if (diffToggle) {
            if (settings?.showDiffView) {
                diffToggle.classList.add('active');
                diffToggle.querySelector('i').className = 'fa-solid fa-eye';
            } else {
                diffToggle.classList.remove('active');
                diffToggle.querySelector('i').className = 'fa-solid fa-eye-slash';
            }
        }
    };
    updateDiffToggleUI();

    menu.addEventListener('mousedown', (e) => {
        e.stopPropagation();
    });

    menu.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        const diffToggle = e.target.closest('.gg-ctx-diff-toggle');
        if (diffToggle) {
            const settings = extension_settings[extensionName];
            settings.showDiffView = !settings.showDiffView;
            saveSettingsDebounced();
            updateDiffToggleUI();
            return;
        }

        const item = e.target.closest('.gg-ctx-item');
        if (!item) return;

        if (item.classList.contains('gg-ctx-settings')) {
             // Open settings panel
             const settingsBtn = document.querySelector('#extensions_settings_button');
             if (settingsBtn) settingsBtn.click();
             const ggSettings = document.querySelector(`.extension_settings[data-extension="${extensionName}"]`);
             if (ggSettings) ggSettings.scrollIntoView();
        } else {
            const action = item.getAttribute('data-action');
            if (action) {
                const selectionToUse = _currentSelectionInfo; 
                removeGGREwriteMenu();

                const module = await import('../guidedRewrite.js');
                if (module) {
                    if (action === 'instruct') {
                        const textarea = document.getElementById('send_textarea');
                        const instructions = textarea ? textarea.value.trim() : '';
                        if (instructions) {
                             if (module.handleGuidedRewrite) {
                                 module.handleGuidedRewrite('Instruct', instructions, selectionToUse); 
                             }
                        } else {
                            toastr.warning('Please enter your custom instructions in the chat input box first.');
                        }
                    } else if (module.handleGuidedRewrite) {
                        const mode = action.charAt(0).toUpperCase() + action.slice(1);
                        module.handleGuidedRewrite(mode, '', selectionToUse);
                    }
                }
            }
        }
    });
}

function processSelection() {
    const settings = extension_settings[extensionName];
    const showRewriteMenu = settings?.showRewriteContextMenu !== false;
    
    if (!showRewriteMenu) {
        removeGGREwriteMenu();
        return;
    }
    
    const activeEl = document.activeElement;
    const isInput = activeEl && (activeEl.id === 'curEditTextarea' || activeEl.id === 'send_textarea');
    
    if (!isInput) {
        removeGGREwriteMenu();
        return;
    }

    const hasSelection = activeEl.selectionStart !== activeEl.selectionEnd;

    if (hasSelection) {
        _currentSelectionInfo = getSelectedTextInfo();
        _currentSelectedText = _currentSelectionInfo ? _currentSelectionInfo.selectedText : '';

        if (_currentSelectionInfo) {
            const menu = document.getElementById('gg_rewrite_menu');
            if (menu && menu.classList.contains('shown') && menu.getAttribute('data-selection-id') === _currentSelectionInfo.selectedText) {
                showGGREwriteMenu();
                return;
            }

            removeGGREwriteMenu();
            
            setTimeout(() => {
                if (menu) menu.setAttribute('data-selection-id', _currentSelectionInfo.selectedText);
                showGGREwriteMenu();
            }, 150);
            return;
        }
    }

    removeGGREwriteMenu();
}

/**
 * Shows the Rewrite Context Menu.
 */
function showGGREwriteMenu() {
    const menu = document.getElementById('gg_rewrite_menu');
    if (!menu) return;

    let top = 0;
    let left = 0;
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    if (_lastMouseUpCoordinates && (_lastMouseUpCoordinates.x > 0 || _lastMouseUpCoordinates.y > 0)) {
        top = _lastMouseUpCoordinates.y + scrollY + 10;
        left = _lastMouseUpCoordinates.x + scrollX + 5;
    } else {
        top = (window.innerHeight / 2) + scrollY;
        left = (window.innerWidth / 2) + scrollX;
    }

    menu.style.display = 'block'; 
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    if (left + menuWidth > windowWidth + scrollX) {
        left = (windowWidth + scrollX) - menuWidth - 10;
        if (left < scrollX) left = scrollX + 10;
    }

    if (top + menuHeight > windowHeight + scrollY) {
        top = (top - 10) - menuHeight - 10;
        if (top < scrollY) top = scrollY + 10;
    }
    
    if (left < scrollX) left = scrollX + 10;
    if (top < scrollY) top = scrollY + 10;

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.classList.add('shown');
    menu.style.setProperty('display', 'block', 'important');
    menu.style.setProperty('visibility', 'visible', 'important');
    menu.style.setProperty('opacity', '1', 'important');
}

/**
 * Hides the Rewrite Context Menu.
 */
function removeGGREwriteMenu() {
    const menu = document.getElementById('gg_rewrite_menu');
    if (menu) {
        menu.classList.remove('shown');
        menu.style.display = 'none';
        menu.style.visibility = 'hidden';
        menu.style.opacity = '0';
    }
}
