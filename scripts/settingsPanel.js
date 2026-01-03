// scripts/settingsPanel.js

import { extensionName, defaultSettings } from './utils/constants.js';
import { extension_settings, debugLog, debugWarn, getDebugMessagesAsText, clearDebugMessages } from '../index.js';
import { getSettings, updateSetting } from './utils/settingsManager.js';
import { renderExtensionTemplateAsync, getContext } from '/scripts/extensions.js';
import { getProfileList, getPresetsForApiType, getProfileApiType, getCurrentProfile } from './utils/presetUtils.js';

/**
 * Loads and renders the settings HTML for the extension.
 */
export async function loadSettingsPanel() {
    const containerId = `extension_settings_${extensionName}`;
    let container = document.getElementById(containerId);

    const parentContainer = document.getElementById('extensions_settings');
    debugLog(`[${extensionName}] Checking parent container #extensions_settings:`, parentContainer ? 'Found' : 'NOT Found');

    if (!container) {
        if (parentContainer) {
            debugLog(`[${extensionName}] Settings container #${containerId} not initially found. Ensuring it exists...`);
            container = document.createElement('div');
            container.id = containerId;
            parentContainer.appendChild(container);
        } else {
            console.error(`${extensionName}: Could not find main settings area (#extensions_settings) to create container.`);
            return;
        }
    } else {
        container.innerHTML = '';
    }

    try {
        const settingsHtml = await renderExtensionTemplateAsync(`third-party/${extensionName}`, 'settings');
        $(container).html(settingsHtml);

        // Remove any manual clear buttons to avoid duplicates
        container.querySelectorAll('.gg-clear-button').forEach(btn => btn.remove());

        setTimeout(async () => {
            loadSettings();
            await updateSettingsUI();
            addSettingsEventListeners();

            // Initialize event listeners for profile and preset switching
            try {
                const { initializeEventListeners } = await import('./utils/presetUtils.js');
                initializeEventListeners();
                debugLog(`[${extensionName}] Event listeners initialized for profile/preset switching in settings panel`);
            } catch (error) {
                debugWarn(`[${extensionName}] Could not initialize event listeners in settings panel:`, error);
            }

            // Setup preset and clear buttons with native event handlers
            const presetButtons = container.querySelectorAll('.gg-preset-button');
            presetButtons.forEach(btn => {
                let clearBtn = btn.nextElementSibling;
                if (!clearBtn || !clearBtn.classList.contains('gg-clear-button')) {
                    clearBtn = document.createElement('button');
                    clearBtn.type = 'button';
                    clearBtn.className = 'gg-clear-button';
                    clearBtn.setAttribute('data-target', btn.getAttribute('data-target'));
                    clearBtn.textContent = '✖';
                    clearBtn.style.marginLeft = '4px';
                    clearBtn.style.color = 'red';
                    btn.insertAdjacentElement('afterend', clearBtn);
                } else {
                    clearBtn.setAttribute('data-target', btn.getAttribute('data-target'));
                }

                btn.addEventListener('click', () => {
                    const key = btn.getAttribute('data-target');
                    const input = document.getElementById(`gg_${key}`);
                    if (input) {
                        input.value = 'GGSytemPrompt';
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });

                clearBtn.addEventListener('click', () => {
                    const key = clearBtn.getAttribute('data-target');
                    const input = document.getElementById(`gg_${key}`);
                    if (input) {
                        input.value = '';
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
            });

            // Setup default buttons
            const defaultButtons = container.querySelectorAll('.gg-default-button');
            defaultButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const key = btn.getAttribute('data-target');
                    const input = document.getElementById(`gg_${key}`);
                    if (input && defaultSettings.hasOwnProperty(key)) {
                        input.value = defaultSettings[key];
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    } else {
                        debugWarn(`[${extensionName}] Could not find input for gg_${key} or default setting for ${key}`);
                    }
                });
            });

            // Setup refresh profile dropdowns button
            const refreshButton = container.querySelector('#refreshProfileDropdowns');
            if (refreshButton) {
                refreshButton.addEventListener('click', async () => {
                    try {
                        await updateSettingsUI();
                    } catch (error) {
                        console.error(`[${extensionName}] Error refreshing profile dropdowns:`, error);
                    }
                });
            }

            // Set width on preset text inputs
            container.querySelectorAll('.gg-setting-input[type="text"]').forEach(input => {
                input.style.minWidth = '200px';
            });

        }, 100);
    } catch (error) {
        console.error(`[${extensionName}] Error rendering settings template:`, error);
        if (container) {
            container.innerHTML = '<p>Error: Could not render settings template. Check browser console (F12).</p>';
        }
    }
}

/**
 * Populates UI fields from extension settings.
 */
export function loadSettings() {
    const settings = getSettings();
    for (const key in settings) {
        const id = `gg_${key}`;
        const element = document.getElementById(id) || document.getElementById(key); // Check both prefixed and non-prefixed
        if (!element) continue;

        if (element.type === 'checkbox') {
            element.checked = !!settings[key];
        } else {
            element.value = settings[key];
        }
    }
    debugLog(`[${extensionName}] Settings loaded into UI.`);
}

/**
 * Updates settings UI dropdowns (profiles and presets).
 */
export async function updateSettingsUI() {
    try {
        const profileList = await getProfileList();
        const currentProfile = await getCurrentProfile();
        const settings = getSettings();

        // Get all profile select elements
        const profileSelects = document.querySelectorAll('select[id^="profile"]');
        for (const select of profileSelects) {
            const key = select.id;
            const currentValue = settings[key] || '';
            
            select.innerHTML = '<option value="">(Current Profile)</option>';
            profileList.forEach(profileName => {
                const option = document.createElement('option');
                option.value = profileName;
                option.text = profileName;
                option.selected = profileName === currentValue;
                select.appendChild(option);
            });

            // Also populate the corresponding preset dropdown
            const presetId = key.replace('profile', 'preset');
            const presetSelect = document.getElementById(presetId);
            if (presetSelect) {
                await updatePresetDropdown(presetSelect, currentValue || currentProfile, settings[presetId]);
            }
        }
        debugLog(`[${extensionName}] Profile and preset dropdowns updated.`);
    } catch (error) {
        console.error(`[${extensionName}] Error updating settings UI:`, error);
    }
}

/**
 * Helper to update a preset dropdown based on a profile.
 */
async function updatePresetDropdown(select, profileName, currentValue) {
    if (!profileName) {
        select.innerHTML = '<option value="">None</option>';
        return;
    }

    try {
        const apiType = await getProfileApiType(profileName);
        if (!apiType) {
            select.innerHTML = '<option value="">(Select Profile First)</option>';
            return;
        }

        const presets = await getPresetsForApiType(apiType);
        select.innerHTML = '<option value="">None</option>';
        
        if (Array.isArray(presets)) {
            presets.forEach(preset => {
                const option = document.createElement('option');
                // Support both object and string formats from ST
                const name = typeof preset === 'object' ? (preset.name || preset.id) : preset;
                option.value = name;
                option.text = name;
                option.selected = name === currentValue;
                select.appendChild(option);
            });
        } else {
            debugWarn(`[${extensionName}] Presets for API type ${apiType} is not an array:`, presets);
        }
    } catch (error) {
        debugWarn(`[${extensionName}] Error updating presets for profile ${profileName}:`, error);
    }
}

/**
 * Attaches event listeners to all GG setting inputs.
 */
export function addSettingsEventListeners() {
    const inputs = document.querySelectorAll('.gg-setting-input');
    inputs.forEach(input => {
        // Remove existing listener to avoid duplicates
        input.removeEventListener('change', handleSettingChange);
        input.addEventListener('change', handleSettingChange);
    });

    // Special handling for profile changes to update preset lists
    const profileSelects = document.querySelectorAll('select[id^="profile"]');
    profileSelects.forEach(select => {
        select.addEventListener('change', async () => {
            const presetId = select.id.replace('profile', 'preset');
            const presetSelect = document.getElementById(presetId);
            if (presetSelect) {
                await updatePresetDropdown(presetSelect, select.value || await getCurrentProfile(), '');
            }
        });
    });

    // Debug Log Buttons
    const copyDebugLogBtn = document.getElementById('gg_copy_debug_log');
    if (copyDebugLogBtn) {
        copyDebugLogBtn.addEventListener('click', () => {
            const debugMessages = getDebugMessagesAsText();
            navigator.clipboard.writeText(debugMessages).then(() => {
                copyDebugLogBtn.textContent = 'Copied!';
                setTimeout(() => copyDebugLogBtn.textContent = 'Copy Debug Log', 1500);
            }).catch(err => {
                console.error('Failed to copy debug log: ', err);
            });
        });
    }

    const downloadDebugLogBtn = document.getElementById('gg_download_debug_log');
    if (downloadDebugLogBtn) {
        downloadDebugLogBtn.addEventListener('click', () => {
            const debugMessages = getDebugMessagesAsText();
            const blob = new Blob([debugMessages], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `guided_generations_debug_log_${new Date().toISOString().slice(0, 10)}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            downloadDebugLogBtn.textContent = 'Downloaded!';
            setTimeout(() => downloadDebugLogBtn.textContent = 'Download Debug Log', 1500);
        });
    }

    const clearDebugLogBtn = document.getElementById('gg_clear_debug_log');
    if (clearDebugLogBtn) {
        clearDebugLogBtn.addEventListener('click', () => {
            clearDebugMessages();
            clearDebugLogBtn.textContent = 'Cleared!';
            setTimeout(() => clearDebugLogBtn.textContent = 'Clear Debug Log', 1500);
        });
    }
}

/**
 * Handles individual setting change.
 */
async function handleSettingChange(event) {
    const element = event.target;
    const key = element.id.startsWith('gg_') ? element.id.substring(3) : element.id;
    const value = element.type === 'checkbox' ? element.checked : element.value;

    updateSetting(key, value);
    debugLog(`[${extensionName}] Setting "${key}" updated to:`, value);
}
