import { debugLog, debugWarn, debugError } from '../utils/logger.js';
import { setGuidedGenerationTargetMessageId, getGuidedGenerationTargetMessageId } from '../../index.js';
import { getSettings, updateSetting } from '../utils/settingsManager.js';
import { safeImport, getContext } from '../utils/moduleManager.js';
import { getSelectedTextInfo } from '../guidedRewrite.js';

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
    const undoButtonHtml = `<div title="Undo Last Rewrite" class="mes_button guided_undo_rewrite_button fa-solid fa-rotate-left interactable" tabindex="0" role="button" style="display:none;"></div>`;
    // Visual separator - inherits color from parent .mes_buttons
    const spacerHtml = `<span class="guided_target_separator" style="margin: 0 5px; color: var(--SmartThemeEmColor); user-select: none;">|</span>`;

    // Template Target - Move guided_target_button out of extraMesButtons to mes_buttons
    const $templateButtons = $("#message_template .mes_buttons");
    const $templateTarget = $templateButtons.find(".extraMesButtons");
    
    if ($templateButtons.length) {
        // Remove from extraMesButtons if present (cleanup old version)
        if ($templateTarget.length) {
             $templateTarget.find('.guided_target_button').remove();
             // Keep undo button in extra menu for now or move it too? Assuming undo stays hidden/rare.
             if ($templateTarget.find('.guided_undo_rewrite_button').length === 0) $templateTarget.prepend(undoButtonHtml);
        }
        
        // Add to main buttons container, e.g. before the Edit button
        if ($templateButtons.find('.guided_target_button').length === 0) {
            const editBtn = $templateButtons.find('.mes_edit');
            if (editBtn.length) {
                editBtn.before(spacerHtml + targetButtonHtml + insertButtonHtml); // Add spacer before target button
            } else {
                $templateButtons.append(spacerHtml + targetButtonHtml + insertButtonHtml);
            }
        }
    }

    $("#chat .mes").each(function() {
        const $mesButtons = $(this).find(".mes_buttons");
        const $extraButtons = $(this).find(".extraMesButtons");
        
        if ($extraButtons.length) {
             // Cleanup old location
             $extraButtons.find(".guided_target_button").remove();
             
             if ($extraButtons.find(".guided_undo_rewrite_button").length === 0) $extraButtons.prepend(undoButtonHtml);
        }
        
        if ($mesButtons.length) {
             if ($mesButtons.find(".guided_target_button").length === 0) {
                 const editBtn = $mesButtons.find('.mes_edit');
                 if (editBtn.length) {
                     editBtn.before(spacerHtml + targetButtonHtml + insertButtonHtml); // Add spacer before target button
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

       const module = await safeImport('./scripts/ui/messageManager.js', 'Message Manager');
       if (!module) return;

       const context = getContext();
       
       // Build character list for selection
       const characters = [];
       // Add User
       characters.push({ name: context.userName, isUser: true });
       
       // Add current character or group members
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

       const labels = characters.map(c => c.name);
       const labelsJson = JSON.stringify(labels);

       try {
           // Create a custom popup for character selection to avoid async issues with /buttons command
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

           // Cleanup function
           const closePopup = () => {
               if (popup) popup.remove();
           };

           // Event Listeners
           $(popup).find('.gg-popup-close').on('click', closePopup);
           $(popup).on('click', (e) => {
               if (e.target === popup) closePopup();
           });

           $(popup).find('button.menu_button').on('click', function() {
               const name = $(this).attr('data-name');
               const isUser = $(this).attr('data-is-user') === 'true';
               debugLog(`[RewriteManager] Selected character from popup: ${name}`);
               module.insertMessageAt(mesId, name, isUser);
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
            
            // NEW WORKFLOW: 
            // 1. Remove target status from any other message
            $("#chat .mes.gg-target").removeClass("gg-target");
            $("#chat .mes .guided_target_button.active").removeClass("active");
            
            if (isNowTarget) {
                // 2. Add visual indicator to current target
                $mes.addClass("gg-target");
                $(this).addClass("active");
                
                // 3. Prompt user to select text
                toastr.info("Message set as Guided Generation Target. Now select the text you wish to rewrite.", "Target Set");
            } else {
                toastr.info("Guided Generation Target cleared.", "Target Cleared");
            }
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
    
    // Track mouse state to prevent spamming menu during drag selection
    window.addEventListener('mousedown', () => {
        _isMouseDown = true;
    });

    // Track mouse up coordinates and trigger selection processing
    window.addEventListener('mouseup', (e) => {
        _isMouseDown = false;
        _lastMouseUpCoordinates = { x: e.clientX, y: e.clientY };

        // Force a check on mouse up (end of drag/click)
        // Clear any pending debounced checks from selectionchange
        if (_selectionDebounceTimer) clearTimeout(_selectionDebounceTimer);
        
        // precise timeout to allow selection to finalize if it hasn't yet
        _selectionDebounceTimer = setTimeout(() => {
             processSelection();
        }, 10);
    });

    // Clear coordinates on keyup to prevent using stale mouse position for keyboard selection
    window.addEventListener('keyup', () => {
        _lastMouseUpCoordinates = null;
    });

    document.addEventListener('selectionchange', () => {
        // If mouse is down, user is likely dragging or double-clicking.
        // We defer processing until mouseup to avoid intermediate states.
        if (_isMouseDown) return;

        // Clear previous timer to effectively debounce
        if (_selectionDebounceTimer) {
            clearTimeout(_selectionDebounceTimer);
        }

        // Debounce to allow selection to settle and prevent menu spam (primarily for keyboard selection)
        _selectionDebounceTimer = setTimeout(() => {
             // Only process if we aren't clicking the menu
             const menu = document.getElementById('gg_rewrite_menu');
             if (menu && menu.matches(':hover')) {
                 debugLog('Skipping selection processing because hovering menu');
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
    if (!menu) {
        debugWarn('attachRewriteMenuListeners: Menu not found');
        return;
    }

    debugLog('attachRewriteMenuListeners: Attaching listeners to menu');

    // Update diff toggle state based on settings
    const updateDiffToggleUI = () => {
        const settings = getSettings();
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

    // Prevent menu clicks from affecting underlying selection
    menu.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        debugLog('Rewrite Menu: mousedown on menu');
    });

    // Delegate click events for menu items
    menu.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        const diffToggle = e.target.closest('.gg-ctx-diff-toggle');
        if (diffToggle) {
            const settings = getSettings();
            updateSetting('showDiffView', !settings.showDiffView);
            updateDiffToggleUI();
            return;
        }

        const item = e.target.closest('.gg-ctx-item');
        if (!item) return;

        if (item.classList.contains('gg-ctx-settings')) {
             debugLog('Rewrite Menu: Settings clicked');
             // TODO: open settings
        } else {
            const action = item.getAttribute('data-action');
            if (action) {
                const selectionToUse = _currentSelectionInfo; 
                removeGGREwriteMenu();

                // History Action
                if (action === 'history') {
                    if (selectionToUse && selectionToUse.mesId !== null) {
                        const historyModule = await safeImport('./scripts/ui/historyManager.js', 'History Manager');
                        if (historyModule) {
                            historyModule.showHistoryPopup(selectionToUse.mesId);
                        }
                    } else {
                        toastr.warning("Could not identify message for history.");
                    }
                    return;
                }

                const module = await safeImport('./scripts/guidedRewrite.js', 'Guided Rewrite');
                if (module) {
                    if (action === 'instruct') {
                        const textarea = document.getElementById('send_textarea');
                        const instructions = textarea ? textarea.value.trim() : '';
                        if (instructions) {
                             if (module.handleGuidedRewrite) {
                                 module.handleGuidedRewrite('Instruct', instructions, selectionToUse); 
                             }
                        } else {
                            alert('Please enter your custom instructions in the chat input box first.');
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
    // debugLog('processSelection running');
    
    // Default to true if not specified
    const settings = getSettings();
    const showRewriteMenu = settings?.showRewriteContextMenu !== false;
    
    if (!showRewriteMenu) {
        debugLog('processSelection: showRewriteContextMenu is disabled in settings');
        removeGGREwriteMenu();
        return;
    }
    
    // EDIT MODE ONLY: Strict check for specific Textareas (Main Input or Message Editor)
    const activeEl = document.activeElement;
    const isInput = activeEl && (activeEl.id === 'curEditTextarea' || activeEl.id === 'send_textarea');
    
    if (!isInput) {
        removeGGREwriteMenu();
        return;
    }

    // Check for valid selection range (length > 0)
    // We do NOT use trim() here to ensure paragraphs with only whitespace or newlines are still detected validly if user wants to rewrite them
    const hasSelection = activeEl.selectionStart !== activeEl.selectionEnd;

    if (hasSelection) {
        // Capture details for the rewrite logic
        _currentSelectionInfo = getSelectedTextInfo();
        _currentSelectedText = _currentSelectionInfo ? _currentSelectionInfo.selectedText : '';

        if (_currentSelectionInfo) {
            debugLog('processSelection: Valid textarea selection', { length: _currentSelectedText.length });
            
            const menu = document.getElementById('gg_rewrite_menu');
            // Use a persistent flag to check if we are already showing for this selection (prevent jitter)
            if (menu && menu.classList.contains('shown') && menu.getAttribute('data-selection-id') === _currentSelectionInfo.selectedText) {
                debugLog('processSelection: Menu already shown for this selection');
                showGGREwriteMenu(); // Just reposition/confirm
                return;
            }

            removeGGREwriteMenu();
            
            // Small timeout to allow potential UI shifts to settle
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
 * Positions it relative to the mouse cursor (Edit Mode Only).
 */
function showGGREwriteMenu() {
    const menu = document.getElementById('gg_rewrite_menu');
    if (!menu) {
        debugWarn('showGGREwriteMenu: Menu element #gg_rewrite_menu not found in DOM');
        return;
    }

    let top = 0;
    let left = 0;
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    // STRATEGY: MOUSE COORDINATES (Primary)
    if (_lastMouseUpCoordinates && 
        (_lastMouseUpCoordinates.x > 0 || _lastMouseUpCoordinates.y > 0)) {
        
        // Position slightly offset from mouse cursor
        top = _lastMouseUpCoordinates.y + scrollY + 10;
        left = _lastMouseUpCoordinates.x + scrollX + 5;
    
    } else {
        // FALLBACK: CENTER SCREEN
        // Used for keyboard selections or lost mouse state
        debugLog('showGGREwriteMenu: No valid mouse coordinates, using center screen fallback');
        top = (window.innerHeight / 2) + scrollY;
        left = (window.innerWidth / 2) + scrollX;
    }

    // Bounds Checking
    menu.style.display = 'block'; // Show temporarily to get dimensions
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Check Right Edge
    if (left + menuWidth > windowWidth + scrollX) {
        // Shift left to fit
        left = (windowWidth + scrollX) - menuWidth - 10;
        
        // If that puts it off-screen left, just pin to left edge
        if (left < scrollX) left = scrollX + 10;
    }

    // Check Bottom Edge
    if (top + menuHeight > windowHeight + scrollY) {
        // Flip to top (above cursor)
        top = (top - 10) - menuHeight - 10;
        
        // If that puts it off-screen top, just pin to top edge
        if (top < scrollY) top = scrollY + 10;
    }
    
    // Check Left Edge
    if (left < scrollX) {
        left = scrollX + 10;
    }
    
    // Check Top Edge
    if (top < scrollY) {
         top = scrollY + 10;
    }

    // Apply Styles
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
        // debugLog('removeGGREwriteMenu: Hiding menu');
        menu.classList.remove('shown');
        menu.style.display = 'none';
        menu.style.visibility = 'hidden';
        menu.style.opacity = '0';
    }
}
