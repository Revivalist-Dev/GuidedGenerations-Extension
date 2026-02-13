import { getContext } from '/scripts/extensions.js';
import { debugLog, debugWarn } from './logger.js';
import { extensionName, extension_settings } from '../../index.js';

// Event listener management for profile and preset switching
let eventListenersInitialized = false;
let profileChangePromise = null;
let presetChangePromise = null;

export function escapeCssSelector(value) {
    if (typeof value !== 'string') return value;
    // Escape characters that have special meaning in CSS selectors.
    return value.replace(/([ !\"#$%&'()*+,\.\/:;<=>?@[\\]^`{|}\~])/g, '\\$&');
}

/**
 * Initialize event listeners for profile and preset changes
 * This must be called before any switching operations
 */
export function initializeEventListeners() {
    if (eventListenersInitialized) {
        debugLog(`[${extensionName}] Event listeners already initialized, skipping...`);
        return; // Already initialized
    }
    
    try {
        debugLog(`[${extensionName}] Setting up event listeners for profile and preset changes...`);
        
        // Listen for profile changes via custom events from index.js
        window.addEventListener('gg-profile-changed', (event) => {
            const { profileName } = event.detail;
            debugLog(`[${extensionName}] Event: gg-profile-changed received for profile: "${profileName}"`);
            if (profileChangePromise) {
                debugLog(`[${extensionName}] Resolving profile change promise for: "${profileName}"`);
                profileChangePromise.resolve(profileName);
                profileChangePromise = null;
            } else {
                debugLog(`[${extensionName}] No profile change promise to resolve for: "${profileName}"`);
            }
        });
        
        // Listen for preset changes via custom events from index.js
        window.addEventListener('gg-preset-changed', (event) => {
            const { presetInfo } = event.detail;
            debugLog(`[${extensionName}] Event: gg-preset-changed received:`, presetInfo);
            if (presetChangePromise) {
                debugLog(`[${extensionName}] Resolving preset change promise for:`, presetInfo);
                presetChangePromise.resolve(presetInfo);
                presetChangePromise = null;
            } else {
                debugLog(`[${extensionName}] No preset change promise to resolve for:`, presetInfo);
            }
        });
        
        eventListenersInitialized = true;
        debugLog(`[${extensionName}] Event listeners initialized successfully for: gg-profile-changed, gg-preset-changed`);
        
    } catch (error) {
        debugWarn(`[${extensionName}] Error initializing event listeners:`, error);
    }
}

/**
 * Wait for a profile change event with timeout and safety delay
 * @param {string} expectedProfile - The profile we're waiting for
 * @param {number} timeoutMs - Timeout in milliseconds (default: 10000ms)
 * @returns {Promise<string>} Resolves with the profile name when changed
 */
async function waitForProfileChange(expectedProfile, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            if (profileChangePromise) {
                profileChangePromise.reject(new Error(`Profile change timeout after ${timeoutMs}ms`));
                profileChangePromise = null;
            }
            reject(new Error(`Profile change timeout after ${timeoutMs}ms`));
        }, timeoutMs);
        
        profileChangePromise = {
            resolve: (profileName) => {
                clearTimeout(timeout);
                resolve(profileName);
            },
            reject: (error) => {
                clearTimeout(timeout);
                reject(error);
            }
        };
    });
}

/**
 * Wait for a preset change event with timeout and safety delay
 * @param {string} expectedPreset - The preset we're waiting for
 * @param {number} timeoutMs - Timeout in milliseconds (default: 10000ms)
 * @returns {Promise<Object>} Resolves with the preset info when changed
 */
async function waitForPresetChange(expectedPreset, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            if (presetChangePromise) {
                presetChangePromise.reject(new Error(`Preset change timeout after ${timeoutMs}ms`));
                presetChangePromise = null;
            }
            reject(new Error(`Preset change timeout after ${timeoutMs}ms`));
        }, timeoutMs);
        
        presetChangePromise = {
            resolve: (presetInfo) => {
                clearTimeout(timeout);
                resolve(presetInfo);
            },
            reject: (error) => {
                clearTimeout(timeout);
                reject(error);
            }
        };
    });
}

/**
 * Wait for a profile change by polling (fallback when events don't work)
 * @param {string} expectedProfile - The profile we're waiting for
 * @param {number} timeoutMs - Timeout in milliseconds (default: 5000ms)
 * @param {number} pollIntervalMs - Polling interval in milliseconds (default: 100ms)
 * @returns {Promise<string>} Resolves with the profile name when changed
 */
async function waitForProfileChangeByPolling(expectedProfile, timeoutMs = 5000, pollIntervalMs = 100) {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
        const checkProfile = async () => {
            try {
                const currentProfile = await getCurrentProfile();
                
                if (currentProfile === expectedProfile) {
                    debugLog(`[${extensionName}] Profile change confirmed by polling: "${currentProfile}"`);
                    resolve(currentProfile);
                    return;
                }
                
                // Check if we've exceeded timeout
                if (Date.now() - startTime > timeoutMs) {
                    reject(new Error(`Profile change polling timeout after ${timeoutMs}ms - expected: "${expectedProfile}", current: "${currentProfile}"`));
                    return;
                }
                
                // Continue polling
                setTimeout(checkProfile, pollIntervalMs);
            } catch (error) {
                reject(error);
            }
        };
        
        // Start polling
        checkProfile();
    });
}

/**
 * Extract the API ID from an API type using the CONNECT_API_MAP
 * @param {string} apiType - The API type (e.g., "generic", "openai", "featherless")
 * @returns {string|null} The API ID or null if not found
 */
export function extractApiIdFromApiType(apiType) {
    try {
        const context = getContext();
        if (!context?.CONNECT_API_MAP) {
            debugWarn(`[${extensionName}] CONNECT_API_MAP not available for API type: ${apiType}`);
            return null;
        }

        const apiInfo = context.CONNECT_API_MAP[apiType];
        if (!apiInfo) {
            debugWarn(`[${extensionName}] No API info found for type: ${apiType}`);
            return null;
        }

        let apiId = null; // Initialize apiId to null

        debugLog(`[${extensionName}] === API ID EXTRACTION - START ===`);
        debugLog(`[${extensionName}] Processing apiType: "${apiType}", apiInfo:`, apiInfo);

        if (apiInfo && typeof apiInfo === 'object' && apiInfo.source && typeof apiInfo.source === 'string' && apiInfo.source.trim() !== '' && apiInfo.source !== apiInfo.selected) {
            apiId = apiInfo.source;
            debugLog(`[${extensionName}] Logic path 1: Used apiInfo.source: "${apiId}"`);
        } else if (apiInfo && typeof apiInfo === 'object' && apiInfo.selected && typeof apiInfo.selected === 'string' && apiInfo.selected.trim() !== '') {
            apiId = apiInfo.selected;
            debugLog(`[${extensionName}] Logic path 2: Used apiInfo.selected: "${apiId}"`);
        } else if (apiInfo && typeof apiInfo === 'object' && apiInfo.apiId && typeof apiInfo.apiId === 'string' && apiInfo.apiId.trim() !== '') {
            apiId = apiInfo.apiId;
            debugLog(`[${extensionName}] Logic path 3: Used apiInfo.apiId: "${apiId}"`);
        } else if (typeof apiInfo === 'string' && apiInfo.trim() !== '') {
            apiId = apiInfo;
            debugLog(`[${extensionName}] Logic path 4: Used apiInfo as string: "${apiId}"`);
        } else {
            debugWarn(`[${extensionName}] Logic path 5: Fallback - Could not extract apiId from API info:`, apiInfo);
            // Don't return null immediately, let the final check handle it
        }

        if (apiId === null) {
            debugWarn(`[${extensionName}] Final apiId is null after extraction attempts.`);
            return null;
        }

        debugLog(`[${extensionName}] === API ID EXTRACTION - END ===`);
        debugLog(`[${extensionName}] Extracted API ID "${apiId}" from API type "${apiType}"`);
        return apiId;
    } catch (error) {
        debugWarn(`[${extensionName}] Error extracting API ID from API type ${apiType}:`, error);
        return null;
    }
}

/**
 * Wait for a preset change by polling (fallback when events don't work)
 * @param {string} expectedPreset - The preset we're waiting for
 * @param {string} apiType - The API type to check
 * @param {number} timeoutMs - Timeout in milliseconds (default: 5000ms)
 * @param {number} pollIntervalMs - Polling interval in milliseconds (default: 100ms)
 * @returns {Promise<Object>} Resolves with the preset info when changed
 */
async function waitForPresetChangeByPolling(expectedPreset, apiType, timeoutMs = 5000, pollIntervalMs = 100) {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
        const checkPreset = async () => {
            try {
                const context = getContext();
                if (!context?.getPresetManager) {
                    reject(new Error('Preset manager not available'));
                    return;
                }
                
                // Extract the API ID from the API type before calling getPresetManager
                const apiId = extractApiIdFromApiType(apiType);
                if (!apiId) {
                    reject(new Error(`Could not extract API ID from API type: ${apiType}`));
                    return;
                }
                
                const presetManager = context.getPresetManager(apiId);
                if (!presetManager?.getSelectedPreset) {
                    reject(new Error(`Preset manager not available for API ID: ${apiId} (from API type: ${apiType})`));
                    return;
                }
                
                const currentPreset = presetManager.getSelectedPreset();
                debugLog(`[${extensionName}] === PRESET NAME EXTRACTION DEBUG ===`);
                debugLog(`[${extensionName}] Raw currentPreset value:`, currentPreset);
                debugLog(`[${extensionName}] CurrentPreset type: ${typeof currentPreset}`);
                debugLog(`[${extensionName}] CurrentPreset is object: ${currentPreset && typeof currentPreset === 'object'}`);
                debugLog(`[${extensionName}] CurrentPreset is null/undefined: ${currentPreset === null || currentPreset === undefined}`);
                
                // Enhanced preset name extraction with detailed logging
                let currentPresetName = '';
                if (currentPreset && typeof currentPreset === 'object') {
                    debugLog(`[${extensionName}] Preset is object, available keys: ${Object.keys(currentPreset).join(', ')}`);
                    currentPresetName = currentPreset.name || currentPreset.id || currentPreset.title || currentPreset.label || '';
                    debugLog(`[${extensionName}] Extracted name from object: "${currentPresetName}" (using name/id/title/label)`);
                } else if (typeof currentPreset === 'string') {
                    currentPresetName = currentPreset;
                    debugLog(`[${extensionName}] Preset is string, using directly: "${currentPresetName}"`);
                } else if (currentPreset !== null && currentPreset !== undefined) {
                    currentPresetName = currentPreset.toString();
                    debugLog(`[${extensionName}] Preset is primitive, converted to string: "${currentPresetName}"`);
                } else {
                    currentPresetName = '';
                    debugLog(`[${extensionName}] Preset is null/undefined, setting to empty string`);
                }
                
                debugLog(`[${extensionName}] Final currentPresetName: "${currentPresetName}"`);
                debugLog(`[${extensionName}] Expected preset: "${expectedPreset}"`);
                debugLog(`[${extensionName}] === END PRESET NAME EXTRACTION DEBUG ===`);
                
                if (currentPresetName === expectedPreset || currentPresetName.includes(expectedPreset)) {
                    debugLog(`[${extensionName}] Preset change confirmed by polling: "${currentPresetName}"`);
                    resolve(currentPreset);
                    return;
                }
                
                // Check if we've exceeded timeout
                if (Date.now() - startTime > timeoutMs) {
                    reject(new Error(`Preset change polling timeout after ${timeoutMs}ms - expected: "${expectedPreset}", current: "${currentPresetName}"`));
                    return;
                }
                
                // Continue polling
                setTimeout(checkPreset, pollIntervalMs);
            } catch (error) {
                reject(error);
            }
        };
        
        // Start polling
        checkPreset();
    });
}

/**
 * Wait for the connection manager to be available
 * @param {number} maxAttempts - Maximum number of attempts
 * @param {number} delayMs - Delay between attempts in milliseconds
 * @returns {Promise<boolean>} True if connection manager becomes available
 */
async function waitForConnectionManager(maxAttempts = 10, delayMs = 200) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const context = getContext();
        if (context?.extensionSettings?.connectionManager) {
            debugLog(`[${extensionName}] Connection manager available on attempt ${attempt}`);
            return true;
        }
        
        if (attempt < maxAttempts) {
            const presetTimeout = extension_settings[extensionName]?.presetSwitchTimeout ?? 200;
            debugLog(`[${extensionName}] Connection manager not available, attempt ${attempt}/${maxAttempts}, waiting ${presetTimeout}ms...`);
            await new Promise(resolve => setTimeout(resolve, presetTimeout));
        }
    }
    
    debugWarn(`[${extensionName}] Connection manager not available after ${maxAttempts} attempts`);
    return false;
}

/**
 * Get the current active connection profile name
 * @returns {Promise<string>} The name of the current profile or empty string if none
 */
export async function getCurrentProfile() {
    try {
        // Wait for connection manager to be available
        const isAvailable = await waitForConnectionManager();
        if (!isAvailable) {
            return '';
        }

        const context = getContext();
        const { selectedProfile, profiles } = context.extensionSettings.connectionManager;
        if (!selectedProfile || !profiles || !Array.isArray(profiles)) {
            debugLog(`[${extensionName}] No profile selected or profiles not available`);
            return '';
        }

        const currentProfile = profiles.find(p => p.id === selectedProfile);
        if (!currentProfile) {
            debugLog(`[${extensionName}] Current profile not found in profiles list`);
            return '';
        }

        debugLog(`[${extensionName}] Current profile: "${currentProfile.name}" (ID: ${currentProfile.id})`);
        return currentProfile.name;
    } catch (error) {
        debugWarn(`[${extensionName}] Error getting current profile:`, error);
        return '';
    }
}

/**
 * Get list of all available connection profile names
 * @returns {Promise<string[]>} Array of profile names
 */
export async function getProfileList() {
    try {
        // Wait for connection manager to be available
        const isAvailable = await waitForConnectionManager();
        if (!isAvailable) {
            return [];
        }

        const context = getContext();
        const { profiles } = context.extensionSettings.connectionManager;
        if (!profiles || !Array.isArray(profiles)) {
            debugLog(`[${extensionName}] Profiles not available`);
            return [];
        }

        const profileNames = profiles.map(p => {
            const escapedName = escapeCssSelector(p.name);
            debugLog(`[${extensionName}] Profile in list: "${escapedName}" (Original: "${p.name}", ID: ${p.id})`);
            return escapedName;
        });
        return profileNames;
    } catch (error) {
        debugWarn(`[${extensionName}] Error getting profile list:`, error);
        return [];
    }
}



/**
 * Switch to a specific connection profile
 * @param {string} profileName - Name of the profile to switch to
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
export async function switchToProfile(profileName) {
    try {
        // Wait for connection manager to be available
        const isAvailable = await waitForConnectionManager();
        if (!isAvailable) {
            return false;
        }

        const context = getContext();
        const { profiles } = context.extensionSettings.connectionManager;
        if (!profiles || !Array.isArray(profiles)) {
            debugWarn(`[${extensionName}] Profiles not available`);
            return false;
        }

        // Find the profile by name
        const targetProfile = profiles.find(p => p.name === profileName);
        if (!targetProfile) {
            debugWarn(`[${extensionName}] Profile not found: ${profileName}`);
            return false;
        }

        // Debug: Log all potential profile-related elements
        debugLog(`[${extensionName}] Searching for profiles dropdown...`);
        // Use a more specific, standard querySelectorAll to avoid syntax errors with invalid characters
        // We filter manually instead of relying on complex selectors that might break
        const allSelects = document.getElementsByTagName('select');
        const profileRelatedSelects = Array.from(allSelects).filter(select => {
            const id = select.id || '';
            const name = select.name || '';
            const className = select.className || '';
            return id.includes('profile') || name.includes('profile') || className.includes('profile');
        });
        
        debugLog(`[${extensionName}] Found ${profileRelatedSelects.length} profile-related select elements:`, 
            profileRelatedSelects.map(s => ({ id: s.id, name: s.name, className: s.className })));

        // Try multiple selectors to find the profiles dropdown
        let profilesDropdown = document.getElementById('profiles') || 
                             document.querySelector('#profiles') ||
                             document.querySelector('select[name="profiles"]') ||
                             document.querySelector('.profiles-select') ||
                             document.querySelector('[data-profile-selector]');

        if (!profilesDropdown) {
            // Use a more specific, standard querySelectorAll to avoid syntax errors with invalid characters
            // We filter manually instead of relying on complex selectors that might break
            const allSelects = document.getElementsByTagName('select');
            profilesDropdown = Array.from(allSelects).find(select => {
                const id = select.id || '';
                const name = select.name || '';
                const className = select.className || '';
                return id.includes('profile') || name.includes('profile') || className.includes('profile');
            });
        }

        if (!profilesDropdown) {
            // Try to find by looking at the connection manager UI
            debugLog(`[${extensionName}] Trying to find profiles dropdown in connection manager UI...`);
            
            // Look for elements that might be the profiles dropdown
            const possibleDropdowns = document.getElementsByTagName('select');
            for (const dropdown of possibleDropdowns) {
                const options = Array.from(dropdown.options);
                const hasMatchingProfiles = options.some(option => 
                    profiles.some(profile => profile.name === option.text || profile.id === option.value)
                );
                
                if (hasMatchingProfiles) {
                    debugLog(`[${extensionName}] Found potential profiles dropdown:`, {
                        id: dropdown.id,
                        name: dropdown.name,
                        className: dropdown.className,
                        optionsCount: options.length,
                        sampleOptions: options.slice(0, 3).map(o => ({ text: o.text, value: o.value }))
                    });
                    profilesDropdown = dropdown;
                    break;
                }
            }
        }

        if (!profilesDropdown) {
            debugWarn(`[${extensionName}] Profiles dropdown not found with any selector`);
            debugWarn(`[${extensionName}] Available select elements:`, 
                Array.from(document.getElementsByTagName('select')).map(s => ({ id: s.id, name: s.name, className: s.className })));
            return false;
        }

        debugLog(`[${extensionName}] Found profiles dropdown:`, {
            id: profilesDropdown.id,
            name: profilesDropdown.name,
            className: profilesDropdown.className,
            optionsCount: profilesDropdown.options.length
        });

        // Find the index of the target profile
        const profileIndex = Array.from(profilesDropdown.options).findIndex(o => o.value === targetProfile.id);
        if (profileIndex === -1) {
            debugWarn(`[${extensionName}] Profile not found in dropdown: ${profileName}`);
            debugWarn(`[${extensionName}] Available dropdown options:`, 
                Array.from(profilesDropdown.options).map(o => ({ text: o.text, value: o.value })));
            debugWarn(`[${extensionName}] Looking for profile with ID: ${targetProfile.id}`);
            return false;
        }

        debugLog(`[${extensionName}] Attempting to switch profilesDropdown selectedIndex to: ${profileIndex} (targetProfile.id: "${targetProfile.id}")`);
        profilesDropdown.selectedIndex = profileIndex;
        profilesDropdown.dispatchEvent(new Event('change'));

        debugLog(`[${extensionName}] Switched to profile: ${profileName}`);
        return true;
        } catch (error) {
        debugWarn(`[${extensionName}] Error switching to profile:`, error);
        return false;
    }
}

/**
 * Switch to a specific preset using the preset manager
 * @param {string} presetValue - The preset value (ID or name)
 * @param {string} apiType - The API type for the current profile
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
export async function switchToPreset(presetValue, apiType) {
    try {
        if (!presetValue || !apiType) {
            debugLog(`[${extensionName}] No preset value or API type provided for preset switch`);
            return false;
        }

        const context = getContext();
        if (!context || !context.CONNECT_API_MAP) {
            debugWarn(`[${extensionName}] Context or CONNECT_API_MAP not available`);
            return false;
        }

        const apiInfo = context.CONNECT_API_MAP[apiType];
        if (!apiInfo) {
            debugWarn(`[${extensionName}] No API info found for type: ${apiType}`);
            return false;
        }

        // Extract the apiId using the centralized, fixed function
        const apiId = extractApiIdFromApiType(apiType);

        if (!apiId) {
            debugWarn(`[${extensionName}] Could not extract apiId from API type: ${apiType} using the centralized function.`);
            return false;
        }
        
        debugLog(`[${extensionName}] Using API ID "${apiId}" extracted from centralized function for preset switch.`);

        debugLog(`[${extensionName}] === PRESET MANAGER RETRIEVAL DEBUG ===`);
        debugLog(`[${extensionName}] Attempting to get preset manager for apiId: "${apiId}"`);

        let currentApiId = apiId;
        let presetManager = context.getPresetManager(currentApiId);

        // Fallback logic: if preset manager is not found for specific API, try 'generic'
        if (!presetManager && currentApiId !== 'generic') {
            const fallbackApiId = 'generic';
            debugWarn(`[${extensionName}] Preset manager not available for API ID: ${currentApiId}. Falling back to API ID: "${fallbackApiId}"`);
            presetManager = context.getPresetManager(fallbackApiId);
            currentApiId = fallbackApiId;
        }

        debugLog(`[${extensionName}] Preset manager retrieved for "${currentApiId}": ${!!presetManager}`);

        if (presetManager) {
            debugLog(`[${extensionName}] Preset manager type: ${typeof presetManager}`);
            debugLog(`[${extensionName}] Preset manager constructor: ${presetManager.constructor?.name || 'unknown'}`);
            debugLog(`[${extensionName}] Preset manager has selectPreset method: ${typeof presetManager.selectPreset === 'function'}`);
            debugLog(`[${extensionName}] Preset manager methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(presetManager)).filter(name => typeof presetManager[name] === 'function').join(', ')}`);
            debugLog(`[${extensionName}] Preset manager own properties: ${Object.keys(presetManager).join(', ')}`);
        }

        if (!presetManager || typeof presetManager.selectPreset !== 'function') {
            debugWarn(`[${extensionName}] Final attempt: Preset manager not available for API ID: ${currentApiId}`);
            debugLog(`[${extensionName}] === END PRESET MANAGER RETRIEVAL DEBUG ===`);
            return false;
        }
        
        debugLog(`[${extensionName}] === END PRESET MANAGER RETRIEVAL DEBUG ===`);

        // Try to select the preset
        debugLog(`[${extensionName}] === PRESET SELECTION DEBUG ===`);
        debugLog(`[${extensionName}] Attempting to select preset: "${presetValue}" for API type: "${apiType}"`);
        debugLog(`[${extensionName}] Using preset manager for apiId: "${apiId}"`);
        debugLog(`[${extensionName}] Preset manager selectPreset method: ${typeof presetManager.selectPreset}`);
        
        const result = presetManager.selectPreset(presetValue);
        debugLog(`[${extensionName}] Preset selection result:`, result);
        debugLog(`[${extensionName}] Result type: ${typeof result}`);
        debugLog(`[${extensionName}] Result is false: ${result === false}`);
        debugLog(`[${extensionName}] === END PRESET SELECTION DEBUG ===`);
        
        debugLog(`[${extensionName}] Switched to preset: ${presetValue} for API type: ${apiType} (${apiId})`);
        
        // Wait for jQuery AJAX completion if selectPreset triggers one
        if (typeof jQuery !== 'undefined' && jQuery.active > 0) {
             debugLog(`[${extensionName}] Waiting for active jQuery requests...`);
             await new Promise(resolve => {
                 const check = () => {
                     if (jQuery.active === 0) resolve();
                     else setTimeout(check, 50);
                 };
                 check();
             });
        }

        return result !== false;
    } catch (error) {
        debugWarn(`[${extensionName}] Error switching to preset:`, error);
        return false;
        }
    }

    /**
 * Get the API type of a specific profile
 * @param {string} profileName - Name of the profile
 * @returns {Promise<string>} The API type (e.g., "featherless", "openai") or empty string if not found
 */
export async function getProfileApiType(profileName) {
    try {
        // Wait for connection manager to be available
        const isAvailable = await waitForConnectionManager();
        if (!isAvailable) {
            return '';
        }

        const context = getContext();
        const { profiles } = context.extensionSettings.connectionManager;
        if (!profiles || !Array.isArray(profiles)) {
            debugWarn(`[${extensionName}] Profiles not available`);
            return '';
        }

        const profile = profiles.find(p => p.name === profileName);
        if (!profile) {
            debugWarn(`[${extensionName}] Profile not found: ${profileName}`);
            return '';
        }

        const apiType = profile.api || '';
        debugLog(`[${extensionName}] Profile ${profileName} API type: "${apiType}"`);
        return apiType;
    } catch (error) {
        debugWarn(`[${extensionName}] Error getting profile API type:`, error);
        return '';
    }
}

/**
 * Get presets for a specific API type
 * @param {string} apiType - The API type (e.g., "featherless", "openai")
 * @returns {Promise<Array>} Array of preset objects
 */
export async function getPresetsForApiType(apiType) {
    try {
        const context = getContext();
        if (!context || !context.CONNECT_API_MAP) {
            debugWarn(`[${extensionName}] Context or CONNECT_API_MAP not available`);
            return [];
        }

        const apiInfo = context.CONNECT_API_MAP[apiType];
        if (!apiInfo) {
            debugWarn(`[${extensionName}] No API info found for type: ${apiType}`);
            return [];
        }

        // Extract the apiId from the API info
        let apiId;
        if (typeof apiInfo === 'string') {
            apiId = apiInfo;
        } else if (apiInfo && typeof apiInfo === 'object' && apiInfo.selected) {
            apiId = apiInfo.selected;
        } else if (apiInfo && typeof apiInfo === 'object' && apiInfo.apiId) {
            apiId = apiInfo.apiId;
        } else {
            debugWarn(`[${extensionName}] Could not extract apiId from API info:`, apiInfo);
            return [];
        }

        const presetManager = context.getPresetManager(apiId);
        if (!presetManager || typeof presetManager.getPresetList !== 'function') {
            debugWarn(`[${extensionName}] Preset manager not available for API ID: ${apiId}`);
            return [];
        }

        const presetList = presetManager.getPresetList();
        presetList.forEach(preset => {
            const name = typeof preset === 'object' ? (preset.name || preset.id || preset.title || preset.label) : preset;
            debugLog(`[${extensionName}] Preset in list for ${apiType} (${apiId}): "${name}"`);
        });
        debugLog(`[${extensionName}] Presets for ${apiType} (${apiId}):`, presetList);
        return Array.isArray(presetList) ? presetList : [];
    } catch (error) {
        debugWarn(`[${extensionName}] Error getting presets for API type:`, error);
        return [];
    }
}

/**
 * Get the CONNECT_API_MAP from SillyTavern context
 * @returns {Object} The CONNECT_API_MAP object
 */
export function getConnectApiMap() {
    try {
        const context = getContext();
        return context?.CONNECT_API_MAP || {};
                } catch (error) {
        debugWarn(`[${extensionName}] Error getting CONNECT_API_MAP:`, error);
        return {};
    }
}

/**
 * Temporarily switch to a profile, execute an operation, then restore the original profile
 * @param {string} targetProfile - Profile to temporarily switch to
 * @param {Function} operation - Async function to execute while on the target profile
 * @returns {Promise<any>} Result of the operation
 */
export async function withProfile(targetProfile, operation) {
    const originalProfile = await getCurrentProfile();
    
    try {
        // Ensure event listeners are initialized
        initializeEventListeners();
        
        // Switch to target profile
        const switchSuccess = await switchToProfile(targetProfile);
        if (!switchSuccess) {
            throw new Error(`Failed to switch to profile: ${targetProfile}`);
        }

        // Try event-based waiting first, fall back to short polling if events timeout
        debugLog(`[${extensionName}] Waiting for profile change event...`);
        try {
            await waitForProfileChange(targetProfile, 3000); // Reduced timeout to 3 seconds
            debugLog(`[${extensionName}] Profile change event received for: "${targetProfile}"`);
                } catch (error) {
            debugLog(`[${extensionName}] Profile change event timeout, falling back to short polling:`, error.message);
            // Fall back to short polling - wait for profile to actually change
            await waitForProfileChangeByPolling(targetProfile, 5000, 100);
        }
        
        // Safety delay after profile switch
        const profileTimeout = extension_settings[extensionName]?.profileSwitchTimeout ?? 500;
        debugLog(`[${extensionName}] Waiting ${profileTimeout}ms safety delay after profile switch...`);
        await new Promise(resolve => setTimeout(resolve, profileTimeout));

        // Execute the operation
        const result = await operation();

        return result;
    } finally {
        // Always restore the original profile
        if (originalProfile && originalProfile !== targetProfile) {
            debugLog(`[${extensionName}] Restoring original profile: "${originalProfile}"`);
            await switchToProfile(originalProfile);
            
            // Try event-based waiting first, fall back to short polling if events timeout
            try {
                await waitForProfileChange(originalProfile, 3000); // Reduced timeout to 3 seconds
                debugLog(`[${extensionName}] Profile restore event received for: "${originalProfile}"`);
            } catch (error) {
                debugLog(`[${extensionName}] Profile restore event timeout, falling back to short polling:`, error.message);
                // Fall back to short polling - wait for profile to actually change
                await waitForProfileChangeByPolling(originalProfile, 5000, 100);
            }
            
            // Safety delay after profile restore
            const profileTimeout = extension_settings[extensionName]?.profileSwitchTimeout ?? 500;
            debugLog(`[${extensionName}] Waiting ${profileTimeout}ms safety delay after profile restore...`);
            await new Promise(resolve => setTimeout(resolve, profileTimeout));
        }
    }
}

/**
 * Unified function to handle profile and preset switching
 * This single function can handle all scenarios:
 * - Profile only (presetValue = null/empty)
 * - Preset only (profileValue = null/empty) 
 * - Both profile and preset
 * - Neither (returns no-op functions)
 * 
 * @param {string|null} profileValue - The profile to switch to (optional)
 * @param {string|null} presetValue - The preset to switch to (optional)
 * @param {string|null} originalProfile - The original profile to restore to (optional, auto-detected if not provided)
 * @returns {Promise<{switch: Function, restore: Function, originalProfile: string, originalPreset: string}>} Object with switch, restore, and original values
 */
export async function handleSwitching(profileValue = null, presetValue = null, originalProfile = null) {
    debugLog(`[${extensionName}] handleSwitching called with profileValue: "${profileValue}", presetValue: "${presetValue}", originalProfile: "${originalProfile}"`);
    
    // Clean up input values
    const targetProfile = profileValue?.trim() || null;
    const targetPreset = presetValue?.trim() || null;
    
    // If neither profile nor preset is specified, return no-op functions
    if (!targetProfile && !targetPreset) {
        debugLog(`[${extensionName}] No profile or preset specified, returning no-op functions`);
        return {
            switch: async () => {},
            restore: async () => {},
            originalProfile: null,
            originalPreset: null
        };
    }
    
    // Capture current state before switching
    let currentProfile = null;
    let currentPreset = null;
    
    try {
        // Get current profile
        currentProfile = await getCurrentProfile();
        debugLog(`[${extensionName}] Current profile: "${currentProfile}"`);
        
        // Note: We'll capture the current preset AFTER profile switching to get the actual preset
        // that SillyTavern sets when the profile changes
        debugLog(`[${extensionName}] Will capture current preset after profile switch to get actual preset value`);
    } catch (error) {
        debugWarn(`[${extensionName}] Error capturing current state:`, error);
        // Set defaults if capture fails
        currentProfile = currentProfile || '';
        currentPreset = currentPreset || '';
    }
    
    // Determine what to restore to
    const profileToRestore = originalProfile || currentProfile || '';
    let presetToRestore = currentPreset !== undefined && currentPreset !== null ? currentPreset : '';
    
    // Create clear summary of what will happen
    const profileAction = targetProfile ? `switch to "${targetProfile}"` : 'keep unchanged';
    const presetAction = targetPreset ? `switch to "${targetPreset}"` : 'keep unchanged';
    
    debugLog(`[${extensionName}] Operation summary:`);
    debugLog(`[${extensionName}]   - Profile: ${profileAction} (current: "${currentProfile}")`);
    debugLog(`[${extensionName}]   - Preset: ${presetAction} (current: "will capture after profile switch")`);
    debugLog(`[${extensionName}]   - Will restore to: profile "${profileToRestore}", preset "will capture after profile switch"`);
    
    /**
     * Switch to the target profile and/or preset
     */
    async function switchToTarget() {
        try {
            // Ensure event listeners are initialized
            initializeEventListeners();
            
            // Step 1: Switch profile if specified
            if (targetProfile) {
                debugLog(`[${extensionName}] Switching to profile: "${targetProfile}"`);
                const profileSwitchSuccess = await switchToProfile(targetProfile);
            if (!profileSwitchSuccess) {
                    throw new Error(`Failed to switch to profile: ${targetProfile}`);
                }
                
                // Try event-based waiting first, fall back to short polling if events timeout
                debugLog(`[${extensionName}] Waiting for profile change event...`);
                try {
                    await waitForProfileChange(targetProfile, 3000); // Reduced timeout to 3 seconds
                    debugLog(`[${extensionName}] Profile change event received for: "${targetProfile}"`);
                } catch (error) {
                    debugLog(`[${extensionName}] Profile change event timeout, falling back to short polling:`, error.message);
                    // Fall back to short polling - wait for profile to actually change
                    await waitForProfileChangeByPolling(targetProfile, 5000, 100);
                }
                
                // Safety delay after profile switch
                const profileTimeout = extension_settings[extensionName]?.profileSwitchTimeout ?? 500;
                debugLog(`[${extensionName}] Waiting ${profileTimeout}ms safety delay after profile switch...`);
                await new Promise(resolve => setTimeout(resolve, profileTimeout));
                
                // Update currentProfile to reflect the new state for restoration
                currentProfile = targetProfile;
                debugLog(`[${extensionName}] Updated currentProfile to: "${currentProfile}" for restoration tracking`);
                
                // NOW capture the current preset after profile switch to get the actual preset
                // that SillyTavern automatically set when switching profiles
                // Add a small delay to ensure preset manager is ready
                const presetTimeout = extension_settings[extensionName]?.presetSwitchTimeout ?? 200;
                debugLog(`[${extensionName}] Waiting ${presetTimeout}ms for preset manager to be ready after profile switch...`);
                await new Promise(resolve => setTimeout(resolve, presetTimeout));
                
                debugLog(`[${extensionName}] Capturing current preset after profile switch...`);
                const context = getContext();
                debugLog(`[${extensionName}] Context available: ${!!context}, getPresetManager available: ${!!context?.getPresetManager}`);
                
                if (context?.getPresetManager) {
                    try {
                        // Use the default preset manager (current active API type)
                        const presetManager = context.getPresetManager();
                        debugLog(`[${extensionName}] Default preset manager: ${!!presetManager}, has getSelectedPreset: ${!!presetManager?.getSelectedPreset}`);
                        
                        // ENHANCED DEBUGGING: Log all preset manager properties
                        if (presetManager) {
                            debugLog(`[${extensionName}] === PRESET MANAGER PROPERTIES ===`);
                            debugLog(`[${extensionName}] Preset manager type: ${typeof presetManager}`);
                            debugLog(`[${extensionName}] Preset manager constructor: ${presetManager.constructor?.name || 'unknown'}`);
                            debugLog(`[${extensionName}] Preset manager API ID: ${presetManager.apiId || 'unknown'}`);
                            debugLog(`[${extensionName}] Preset manager methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(presetManager)).filter(name => typeof presetManager[name] === 'function').join(', ')}`);
                            debugLog(`[${extensionName}] Preset manager own properties: ${Object.keys(presetManager).join(', ')}`);
                            debugLog(`[${extensionName}] === END PRESET MANAGER PROPERTIES ===`);
                        }
                        
                        if (presetManager?.getSelectedPreset) {
                            // Get the API ID to determine expected preset format
                            const apiId = presetManager.apiId;
                            debugLog(`[${extensionName}] Preset manager API ID: "${apiId}"`);
                            
                            const selected = presetManager.getSelectedPreset();
                            debugLog(`[${extensionName}] Selected preset from default manager:`, selected);
                            debugLog(`[${extensionName}] Preset type: ${typeof selected}, is object: ${selected && typeof selected === 'object'}`);
                            if (selected && typeof selected === 'object') {
                                debugLog(`[${extensionName}] Preset object keys: ${Object.keys(selected).join(', ')}`);
                            }
                            
                            // Handle presets based on API ID type
                            if (apiId === 'textgenerationwebui') {
                                // TextGenerationWebUI typically returns string names
                                if (selected && typeof selected === 'string') {
                                    currentPreset = selected;
                                    debugLog(`[${extensionName}] Current preset after profile switch: "${currentPreset}" (TextGenerationWebUI string) from default manager`);
                                } else {
                                    debugLog(`[${extensionName}] TextGenerationWebUI preset is not a string, using toString(): "${selected}"`);
                                    currentPreset = selected ? selected.toString() : '';
                                }
                            } else {
                                // All other API IDs (openai, kobold, etc.) return primitive values (string/number)
                                if (selected !== null && selected !== undefined) {
                                    currentPreset = selected.toString();
                                    debugLog(`[${extensionName}] Current preset after profile switch: "${currentPreset}" (${apiId} primitive) from default manager`);
                                } else {
                                    debugLog(`[${extensionName}] ${apiId} preset is null/undefined, setting to empty string`);
                                    currentPreset = '';
                                }
                            }
                    } else {
                            debugLog(`[${extensionName}] Default preset manager doesn't have getSelectedPreset method`);
                            currentPreset = '';
                        }
                    } catch (e) {
                        debugLog(`[${extensionName}] Error getting preset from default manager:`, e.message);
                        currentPreset = '';
                    }
                } else {
                    debugLog(`[${extensionName}] Preset manager not available after profile switch, setting currentPreset to empty string`);
                    currentPreset = '';
                }
                
                debugLog(`[${extensionName}] Final currentPreset value after profile switch: "${currentPreset}"`);
                
                // Update the restoration variables with the actual captured preset
                presetToRestore = currentPreset;
                debugLog(`[${extensionName}] Updated presetToRestore to: "${presetToRestore}"`);
                
            } else {
                debugLog(`[${extensionName}] No profile change requested, keeping current profile: "${currentProfile}"`);
                
                // If no profile change but we're switching presets, capture current preset now
                if (targetPreset) {
                    debugLog(`[${extensionName}] No profile change, capturing current preset before preset switch...`);
                    const context = getContext();
                    if (context?.getPresetManager) {
                        try {
                            // Use the default preset manager (current active API type)
                            const presetManager = context.getPresetManager();
                            debugLog(`[${extensionName}] Default preset manager: ${!!presetManager}, has getSelectedPreset: ${!!presetManager?.getSelectedPreset}`);
                            
                            // ENHANCED DEBUGGING: Log all preset manager properties
                            if (presetManager) {
                                debugLog(`[${extensionName}] === PRESET MANAGER PROPERTIES (NO PROFILE CHANGE) ===`);
                                debugLog(`[${extensionName}] Preset manager type: ${typeof presetManager}`);
                                debugLog(`[${extensionName}] Preset manager constructor: ${presetManager.constructor?.name || 'unknown'}`);
                                debugLog(`[${extensionName}] Preset manager API ID: ${presetManager.apiId || 'unknown'}`);
                                debugLog(`[${extensionName}] Preset manager methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(presetManager)).filter(name => typeof presetManager[name] === 'function').join(', ')}`);
                                debugLog(`[${extensionName}] Preset manager own properties: ${Object.keys(presetManager).join(', ')}`);
                                debugLog(`[${extensionName}] === END PRESET MANAGER PROPERTIES (NO PROFILE CHANGE) ===`);
                            }
                            
                            if (presetManager?.getSelectedPreset) {
                                // Get the API ID to determine expected preset format
                                const apiId = presetManager.apiId;
                                debugLog(`[${extensionName}] Preset manager API ID: "${apiId}"`);
                                
                                const selected = presetManager.getSelectedPreset();
                                debugLog(`[${extensionName}] Selected preset from default manager:`, selected);
                                debugLog(`[${extensionName}] Preset type: ${typeof selected}, is object: ${selected && typeof selected === 'object'}`);
                                if (selected && typeof selected === 'object') {
                                    debugLog(`[${extensionName}] Preset object keys: ${Object.keys(selected).join(', ')}`);
                                }
                                
                                // Handle presets based on API ID type
                                if (apiId === 'textgenerationwebui') {
                                    // TextGenerationWebUI typically returns string names
                                    if (selected && typeof selected === 'string') {
                                        currentPreset = selected;
                                        debugLog(`[${extensionName}] Current preset before preset switch: "${currentPreset}" (TextGenerationWebUI string) from default manager`);
                                    } else {
                                        debugLog(`[${extensionName}] TextGenerationWebUI preset is not a string, using toString(): "${selected}"`);
                                        currentPreset = selected ? selected.toString() : '';
                                    }
                                } else {
                                    // All other API IDs (openai, kobold, etc.) return primitive values (string/number)
                                    if (selected !== null && selected !== undefined) {
                                        currentPreset = selected.toString();
                                        debugLog(`[${extensionName}] Current preset before preset switch: "${currentPreset}" (${apiId} primitive) from default manager`);
                                    } else {
                                        debugLog(`[${extensionName}] ${apiId} preset is null/undefined, setting to empty string`);
                                        currentPreset = '';
                                    }
                                }
                            } else {
                                debugLog(`[${extensionName}] Default preset manager doesn't have getSelectedPreset method`);
                                currentPreset = '';
                            }
                        } catch (e) {
                            debugLog(`[${extensionName}] Error getting preset from default manager:`, e.message);
                            currentPreset = '';
                        }
                    } else {
                        debugLog(`[${extensionName}] Preset manager not available before preset switch, setting currentPreset to empty string`);
                        currentPreset = '';
                    }
                    
                    debugLog(`[${extensionName}] Final currentPreset value before preset switch: "${currentPreset}"`);
                    
                    // Update the restoration variables with the actual captured preset
                    presetToRestore = currentPreset;
                    debugLog(`[${extensionName}] Updated presetToRestore to: "${presetToRestore}"`);
                }
            }
            
            // Step 2: Switch preset if specified
            if (targetPreset) {
                debugLog(`[${extensionName}] Switching to preset: "${targetPreset}"`);
                
                // Determine which profile to use for preset switching
                const profileForPreset = targetProfile || currentProfile;
                if (!profileForPreset) {
                    debugWarn(`[${extensionName}] No profile available for preset switching - skipping preset switch and continuing with current settings`);
                    return; // Skip preset switching but continue execution
                }
                
                debugLog(`[${extensionName}] Using profile "${profileForPreset}" for preset switching`);
                
                // Get the API type for the profile
                const apiType = await getProfileApiType(profileForPreset);
                if (!apiType) {
                    debugWarn(`[${extensionName}] Could not determine API type for profile: ${profileForPreset} - skipping preset switch and continuing with current settings`);
                    return; // Skip preset switching but continue execution
                }
                
                const presetSwitchSuccess = await switchToPreset(targetPreset, apiType);
                if (!presetSwitchSuccess) {
                    debugWarn(`[${extensionName}] Failed to switch to preset: ${targetPreset} - skipping preset switch and continuing with current settings`);
                    return; // Skip preset switching but continue execution
                }
                
                // Try event-based waiting first, fall back to short polling if events timeout
                debugLog(`[${extensionName}] Waiting for preset change event...`);
                try {
                    await waitForPresetChange(targetPreset, 3000); // Reduced timeout to 3 seconds
                    debugLog(`[${extensionName}] Preset change event received for: "${targetPreset}"`);
                } catch (error) {
                    debugLog(`[${extensionName}] Preset change event timeout, falling back to short polling:`, error.message);
                    // Fall back to short polling - wait for preset to actually change
                    await waitForPresetChangeByPolling(targetPreset, apiType, 5000, 100);
                }
                
                // Safety delay after preset switch
                const presetTimeout = extension_settings[extensionName]?.presetSwitchTimeout ?? 200;
                debugLog(`[${extensionName}] Waiting ${presetTimeout}ms safety delay after preset switch...`);
                await new Promise(resolve => setTimeout(resolve, presetTimeout));
                
                // Update currentPreset to reflect the new state for restoration
                currentPreset = targetPreset;
                debugLog(`[${extensionName}] Updated currentPreset to: "${currentPreset}" for restoration tracking`);
            } else {
                debugLog(`[${extensionName}] No preset change requested, keeping current preset: "${currentPreset || 'none'}"`);
            }
            
            debugLog(`[${extensionName}] Successfully completed switching operations - Profile: "${targetProfile || 'unchanged'}", Preset: "${targetPreset || 'unchanged'}"`);
            
            // Final summary of what was accomplished
            if (targetProfile && targetPreset) {
                debugLog(`[${extensionName}] ✅ Switched to profile "${targetProfile}" and preset "${targetPreset}"`);
            } else if (targetProfile) {
                debugLog(`[${extensionName}] ✅ Switched to profile "${targetProfile}", preset unchanged`);
            } else if (targetPreset) {
                debugLog(`[${extensionName}] ✅ Profile unchanged, switched to preset "${targetPreset}"`);
            } else {
                debugLog(`[${extensionName}] ✅ No changes made - profile and preset unchanged`);
            }
            
            // Final restoration summary
            debugLog(`[${extensionName}] Final restoration summary:`);
            debugLog(`[${extensionName}]   - Will restore profile to: "${profileToRestore}"`);
            debugLog(`[${extensionName}]   - Will restore preset to: "${presetToRestore}"`);
        } catch (error) {
            debugWarn(`[${extensionName}] Error in switchToTarget:`, error);
            throw error;
        }
    }

    /**
     * Restore the original profile and preset
     */
    async function restore() {
        try {
            debugLog(`[${extensionName}] Restore function called`);
            debugLog(`[${extensionName}] Current state for restoration:`);
            debugLog(`[${extensionName}]   - currentPreset: "${currentPreset || 'none'}"`);
            debugLog(`[${extensionName}]   - presetToRestore: "${presetToRestore || 'none'}"`);
            debugLog(`[${extensionName}]   - currentProfile: "${currentProfile || 'none'}"`);
            debugLog(`[${extensionName}]   - profileToRestore: "${profileToRestore || 'none'}"`);
            debugLog(`[${extensionName}]   - targetProfile: "${targetProfile || 'none'}"`);
            debugLog(`[${extensionName}]   - targetPreset: "${targetPreset || 'none'}"`);
            
            // Restore order: 1) Preset restore, 2) Profile restore
            // This prevents conflicts between profile and preset settings
            
            let restoreActions = [];
            
            // Step 1: Restore preset if we had one and it was changed
            if (currentPreset && presetToRestore && currentPreset !== presetToRestore) {
                debugLog(`[${extensionName}] Step 1: Restoring preset from "${currentPreset}" back to "${presetToRestore}"`);
                
                // Get the API type for the current profile
                const currentProfileForRestore = targetProfile || currentProfile;
                if (currentProfileForRestore) {
                    const apiType = await getProfileApiType(currentProfileForRestore);
                    if (apiType) {
                        await switchToPreset(presetToRestore, apiType);
                        
                        // Wait for preset change event with the same hybrid approach
                        try {
                            await waitForPresetChange(presetToRestore, 3000); // 3 second timeout
                            debugLog(`[${extensionName}] Preset restore event received for: "${presetToRestore}"`);
                        } catch (error) {
                            debugLog(`[${extensionName}] Preset restore event timeout, falling back to short polling:`, error.message);
                            // Fall back to short polling - wait for preset to actually change
                            await waitForPresetChangeByPolling(presetToRestore, apiType, 5000, 100);
                        }
                        
                        // Safety delay after preset restore
                        const presetTimeout = extension_settings[extensionName]?.presetSwitchTimeout ?? 200;
                        debugLog(`[${extensionName}] Waiting ${presetTimeout}ms safety delay after preset restore...`);
                        await new Promise(resolve => setTimeout(resolve, presetTimeout));
                        
                        debugLog(`[${extensionName}] ✅ Successfully restored preset to: "${presetToRestore}"`);
                        restoreActions.push(`preset to "${presetToRestore}"`);
                    }
                }
            } else {
                debugLog(`[${extensionName}] Step 1: No preset restore needed (current: "${currentPreset || 'none'}", target: "${presetToRestore}")`);
            }
            
            // Step 2: Restore profile if we switched to a different one
            if (targetProfile && profileToRestore && targetProfile !== profileToRestore) {
                debugLog(`[${extensionName}] Step 2: Restoring profile from "${targetProfile}" back to "${profileToRestore}"`);
                
                // Ensure event listeners are initialized
                initializeEventListeners();
                
                await switchToProfile(profileToRestore);
                
                // Wait for profile change event with the same hybrid approach
                try {
                    await waitForProfileChange(profileToRestore, 3000); // 3 second timeout
                    debugLog(`[${extensionName}] Profile restore event received for: "${profileToRestore}"`);
                } catch (error) {
                    debugLog(`[${extensionName}] Profile restore event timeout, falling back to short polling:`, error.message);
                    // Fall back to short polling - wait for profile to actually change
                    await waitForProfileChangeByPolling(profileToRestore, 5000, 100);
                }
                
                // Safety delay after profile restore
                const profileTimeout = extension_settings[extensionName]?.profileSwitchTimeout ?? 500;
                debugLog(`[${extensionName}] Waiting ${profileTimeout}ms safety delay after profile restore...`);
                await new Promise(resolve => setTimeout(resolve, profileTimeout));
                
                debugLog(`[${extensionName}] ✅ Successfully restored profile to: "${profileToRestore}"`);
                restoreActions.push(`profile to "${profileToRestore}"`);
            } else {
                debugLog(`[${extensionName}] Step 2: No profile restore needed (current: "${targetProfile || 'unchanged'}", target: "${profileToRestore}")`);
            }
            
            if (restoreActions.length > 0) {
                debugLog(`[${extensionName}] ✅ Successfully restored: ${restoreActions.join(' and ')}`);
            } else {
                debugLog(`[${extensionName}] ✅ No restoration needed - everything is already in the correct state`);
            }
        } catch (error) {
            debugWarn(`[${extensionName}] Error in restore:`, error);
        }
    }

    return {
        switch: switchToTarget,
        restore: restore,
        originalProfile: profileToRestore,
        originalPreset: presetToRestore
    };
}




