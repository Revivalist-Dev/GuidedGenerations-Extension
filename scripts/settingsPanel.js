// scripts/settingsPanel.js

import { extension_settings, debugLog, debugWarn, extensionName } from '../index.js';
import { getSettings, updateSetting } from './utils/settingsManager.js';
import { renderExtensionTemplateAsync, getContext, loadExtensionSettings } from '/scripts/extensions.js';
import { getProfileList, getPresetsForApiType, getProfileApiType, getCurrentProfile, escapeCssSelector } from './utils/presetUtils.js';
import { defaultSettings } from './utils/defaultSettings.js';

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

    const templatePath = `third-party/${extensionName}/html/templates`;

    try {
        const settingsMainHtml = await renderExtensionTemplateAsync(templatePath, 'settings-main');
        $(container).html(settingsMainHtml);

        const contentContainer = container.querySelector('.inline-drawer-content');

        const actionButtonsHtml = await renderExtensionTemplateAsync(templatePath, 'settings-action-buttons');
        contentContainer.insertAdjacentHTML('beforeend', actionButtonsHtml);

        const toolButtonsHtml = await renderExtensionTemplateAsync(templatePath, 'settings-tool-buttons');
        contentContainer.insertAdjacentHTML('beforeend', toolButtonsHtml);

        const uiPreferencesHtml = await renderExtensionTemplateAsync(templatePath, 'settings-ui-preferences');
        contentContainer.insertAdjacentHTML('beforeend', uiPreferencesHtml);

        // Auto-Triggers is a removed feature, so it will not be re-added

        const injectionSettingsHtml = await renderExtensionTemplateAsync(templatePath, 'settings-injection');
        contentContainer.insertAdjacentHTML('beforeend', injectionSettingsHtml);

        const promptOverridesSectionHtml = await renderExtensionTemplateAsync(templatePath, 'settings-prompt-overrides');
        contentContainer.insertAdjacentHTML('beforeend', promptOverridesSectionHtml);

        const promptOverrideItemHtml = await renderExtensionTemplateAsync(templatePath, 'settings-prompt-override-item');
        
        // Dynamically add prompt override items
        const promptOverridesContainer = contentContainer.querySelector('.guide-prompt-overrides-section');
        if (promptOverridesContainer) {
            // Load defaults from JSON via settingsManager helper
            const { loadDefaultTemplates } = await import('./utils/settingsManager.js');
            const defaultTemplates = await loadDefaultTemplates();
            const overridesDefaults = defaultTemplates.promptOverrides || [];
            const impersonateTemplates = defaultTemplates.impersonateTemplates || [];

            const promptOverrides = [
                { 
                    name: 'Corrections', 
                    label: 'Corrections Prompt', 
                    placeholder: '', 
                    showRaw: true, 
                    showDepth: true, 
                    default: overridesDefaults.find(t => t.id === 'corrections')?.content || defaultSettings.promptCorrections 
                },
                { 
                    name: 'GuidedContinue', 
                    label: 'Guided Continue Prompt', 
                    placeholder: '', 
                    showRaw: false, 
                    showDepth: false, 
                    default: overridesDefaults.find(t => t.id === 'guidedContinue')?.content || defaultSettings.promptGuidedContinue 
                },
                { 
                    name: 'GuidedResponse', 
                    label: 'Guided Response Prompt', 
                    placeholder: '', 
                    showRaw: false, 
                    showDepth: true, 
                    default: overridesDefaults.find(t => t.id === 'guidedResponse')?.content || defaultSettings.promptGuidedResponse 
                },
                { 
                    name: 'GuidedSwipe', 
                    label: 'Guided Swipe Prompt', 
                    placeholder: '', 
                    showRaw: false, 
                    showDepth: true, 
                    default: overridesDefaults.find(t => t.id === 'guidedSwipe')?.content || defaultSettings.promptGuidedSwipe
                },
                {
                    name: 'Impersonate',
                    label: 'Impersonate Prompt',
                    placeholder: 'Select a template above or enter custom prompt',
                    showRaw: false,
                    showDepth: false,
                    default: impersonateTemplates.find(t => t.id === getSettings().impersonateTemplate)?.content || ''
                },
            ];

            for (const promptOverride of promptOverrides) {
                let itemHtml = promptOverrideItemHtml;
                itemHtml = itemHtml.replaceAll('{{name}}', promptOverride.name);
                itemHtml = itemHtml.replaceAll('{{label}}', promptOverride.label);
                itemHtml = itemHtml.replaceAll('{{placeholder}}', promptOverride.placeholder || '');
                itemHtml = itemHtml.replaceAll('{{default}}', (promptOverride.default || '').replace(/'/g, "'").replace(/"/g, ''));


                if (promptOverride.showRaw) {
                    itemHtml = itemHtml.replace('{{#if showRaw}}', '').replace('{{/if}}', '');
                } else {
                    itemHtml = itemHtml.replace(/{{#if showRaw}}[\s\S]*?{{\/if}}/g, '');
                }
                if (promptOverride.showDepth) {
                    itemHtml = itemHtml.replace('{{#if showDepth}}', '').replace('{{/if}}', '');
                } else {
                    itemHtml = itemHtml.replace(/{{#if showDepth}}[\s\S]*?{{\/if}}/g, '');
                }
                promptOverridesContainer.insertAdjacentHTML('beforeend', itemHtml);
            }
        }

        const rewriteSettingsHtml = await renderExtensionTemplateAsync(templatePath, 'settings-rewrite');
        contentContainer.insertAdjacentHTML('beforeend', rewriteSettingsHtml);

        // Remove any manual clear buttons to avoid duplicates
        container.querySelectorAll('.gg-clear-button').forEach(btn => btn.remove());

        setTimeout(async () => {
            loadExtensionSettings(extensionName);
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
            });
        }, 0);
    } catch (error) {
        console.error(`${extensionName}: Could not load settings panel HTML:`, error);
    }
}

export function addSettingsEventListeners() {
    const settings = getSettings();
    const container = document.getElementById(`extension_settings_${extensionName}`);

    // Event listeners for checkboxes and text inputs
    container.querySelectorAll('.gg-setting-input').forEach(input => {
        input.addEventListener('change', (event) => {
            const key = event.target.name;
            let value;
            if (event.target.type === 'checkbox') {
                value = event.target.checked;
            } else if (event.target.type === 'number') {
                value = Number(event.target.value);
            } else {
                value = event.target.value;
            }
            updateSetting(key, value);
            debugLog(`[${extensionName}] Setting updated: ${key} = ${value}`);
        });
    });

    // Update Impersonate default when template changes
    const impersonateTemplateSelect = document.getElementById('gg_impersonateTemplate');
    if (impersonateTemplateSelect) {
        impersonateTemplateSelect.addEventListener('change', async (event) => {
            const templateId = event.target.value;
            const { loadDefaultTemplates } = await import('./utils/settingsManager.js');
            const defaultTemplates = await loadDefaultTemplates();
            const impersonateTemplates = defaultTemplates.impersonateTemplates || [];
            const template = impersonateTemplates.find(t => t.id === templateId);
            
            if (template) {
                const defaultBtn = container.querySelector('.gg-default-button[data-target="promptImpersonate"]');
                if (defaultBtn) {
                    defaultBtn.dataset.default = template.content.replace(/'/g, "'").replace(/"/g, '"');
                }
                
                // Optional: Automatically update the textarea if it's currently empty
                const textarea = container.querySelector('[name="promptImpersonate"]');
                if (textarea && !textarea.value.trim()) {
                    textarea.value = template.content;
                    updateSetting('promptImpersonate', template.content);
                }
            }
        });
    }

    // Event listeners for default buttons
    container.querySelectorAll('.gg-default-button').forEach(button => {
        button.addEventListener('click', (event) => {
            const targetSetting = event.target.dataset.target;
            const defaultValue = event.target.dataset.default;

            const inputElement = container.querySelector(`[name="${targetSetting}"]`);
            if (inputElement) {
                inputElement.value = defaultValue;
                updateSetting(targetSetting, defaultValue);
                debugLog(`[${extensionName}] Reset setting to default: ${targetSetting} = ${defaultValue}`);
            }
        });
    });

    // Debug log buttons
    document.getElementById('gg_copyDebugLogs')?.addEventListener('click', async () => {
        const { copyDebugLogs } = await import('./utils/logger.js');
        copyDebugLogs();
    });
    document.getElementById('gg_downloadDebugLogs')?.addEventListener('click', async () => {
        const { downloadDebugLogs } = await import('./utils/logger.js');
        downloadDebugLogs();
    });
    document.getElementById('gg_clearDebugLogs')?.addEventListener('click', async () => {
        const { clearDebugLogs } = await import('./utils/logger.js');
        clearDebugLogs();
    });
}

export async function updateSettingsUI() {
    const settings = getSettings();
    const container = document.getElementById(`extension_settings_${extensionName}`);
    const { loadDefaultTemplates } = await import('./utils/settingsManager.js');
    const defaultTemplates = await loadDefaultTemplates();

    // Update checkboxes and text inputs
    for (const key in settings) {
        const inputElement = container.querySelector(`[name="${key}"]`);
        if (inputElement) {
            if (inputElement.type === 'checkbox') {
                inputElement.checked = settings[key];
            } else if (inputElement.type === 'number') {
                inputElement.value = Number(settings[key]);
            } else {
                inputElement.value = settings[key];
            }
        }
    }

    // Populate impersonate template dropdown
    const impersonateTemplateSelect = document.getElementById('gg_impersonateTemplate');
    if (impersonateTemplateSelect) {
        impersonateTemplateSelect.innerHTML = '';
        const impersonateTemplates = defaultTemplates.impersonateTemplates || [];
        
        impersonateTemplates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = template.name;
            impersonateTemplateSelect.appendChild(option);
        });
        
        if (settings.impersonateTemplate && impersonateTemplates.some(t => t.id === settings.impersonateTemplate)) {
            impersonateTemplateSelect.value = settings.impersonateTemplate;
            
            // Update the Default button for promptImpersonate
            const currentTemplate = impersonateTemplates.find(t => t.id === settings.impersonateTemplate);
            if (currentTemplate) {
                const defaultBtn = container.querySelector('.gg-default-button[data-target="promptImpersonate"]');
                if (defaultBtn) {
                    defaultBtn.dataset.default = currentTemplate.content.replace(/'/g, "'").replace(/"/g, '"');
                }
            }
        } else if (impersonateTemplates.length > 0) {
             // Default to first if not set or invalid
             impersonateTemplateSelect.value = impersonateTemplates[0].id;
             updateSetting('impersonateTemplate', impersonateTemplates[0].id);
        }
    }
}
