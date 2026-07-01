import { diffWords } from '../utils/diffViewer.js';
import { debugLog, debugError } from '../../index.js';

/**
 * Renders the diff object into a document fragment.
 * @param {Array} diff - Array of diff objects { value, added, removed }
 * @returns {DocumentFragment}
 */
function renderDiffToHtml(diff) {
    const fragment = document.createDocumentFragment();
    diff.forEach(part => {
        const span = document.createElement('span');
        if (part.added) {
            span.className = 'gg-diff-added';
        } else if (part.removed) {
            span.className = 'gg-diff-removed';
        } else {
            span.className = 'gg-diff-unchanged';
        }
        span.textContent = part.value;
        fragment.appendChild(span);
    });
    return fragment;
}

async function ensurePopupLoaded() {
    if (document.getElementById('gg-diff-popup')) return true;
    try {
        const response = await fetch('/scripts/extensions/third-party/GuidedGenerations-Extension/html/diffPopup.html');
        if (response.ok) {
            const html = await response.text();
            document.body.insertAdjacentHTML('beforeend', html);
            return true;
        }
    } catch (err) {
        debugError('Failed to load diff popup HTML:', err);
        return false;
    }
}

export async function showLoading(message = "Generating rewrites...") {
    await ensurePopupLoaded();
    const loadingPopup = document.getElementById('gg-loading-popup');
    if (loadingPopup) {
        const msgEl = loadingPopup.querySelector('#gg-loading-message');
        if (msgEl) msgEl.textContent = message;
        loadingPopup.style.display = 'flex';
        document.body.classList.add('gg-popup-open');
    }
}

export function hideLoading() {
    const loadingPopup = document.getElementById('gg-loading-popup');
    if (loadingPopup) {
        loadingPopup.style.display = 'none';
        // Only remove body class if diff popup is not open
        const diffPopup = document.getElementById('gg-diff-popup');
        if (!diffPopup || getComputedStyle(diffPopup).display === 'none') {
            document.body.classList.remove('gg-popup-open');
        }
    }
}

/**
 * Shows the diff preview popup and returns a promise that resolves to true (apply) or false (cancel)
 * @param {string} oldText - The original text
 * @param {string|Array} newTextOrCandidates - The new text string OR array of {text, analysis} objects
 * @param {string|null} analysisText - Optional analysis/CoT text to display (legacy)
 * @returns {Promise<string|null>} - Returns the confirmed text (possibly edited) or null if cancelled
 */
export async function showDiffPreview(oldText, newTextOrCandidates, analysisText = null) {
    return new Promise(async (resolve) => {
        const loaded = await ensurePopupLoaded();
        if (!loaded) {
             const text = Array.isArray(newTextOrCandidates) ? newTextOrCandidates[0].text : newTextOrCandidates;
             resolve(text);
             return;
        }
        
        let popup = document.getElementById('gg-diff-popup');

        // Normalize candidates
        let candidates = [];
        if (Array.isArray(newTextOrCandidates)) {
            // Clone to avoid mutating original if needed, and add editedText property
            candidates = newTextOrCandidates.map(c => ({ ...c, editedText: c.text }));
        } else {
            candidates = [{ text: newTextOrCandidates, analysis: analysisText, editedText: newTextOrCandidates }];
        }

        let currentIndex = 0;

        const container = popup.querySelector('#gg-diff-container');
        const editor = popup.querySelector('#gg-diff-editor');
        const confirmBtn = popup.querySelector('#gg-diff-confirm');
        const cancelBtn = popup.querySelector('#gg-diff-cancel');
        const closeBtn = popup.querySelector('.gg-popup-close');
        const tabs = popup.querySelectorAll('.gg-diff-tab');
        
        // Navigation Elements
        const navContainer = popup.querySelector('#gg-candidate-nav');
        const prevBtn = popup.querySelector('#gg-prev-candidate');
        const nextBtn = popup.querySelector('#gg-next-candidate');
        const counter = popup.querySelector('#gg-candidate-counter');

        // Analysis Elements
        const analysisContainer = popup.querySelector('#gg-analysis-container');
        const analysisContent = popup.querySelector('#gg-analysis-content');
        const analysisDetails = popup.querySelector('.gg-analysis-details');

        // Setup Navigation Visibility
        if (candidates.length > 1) {
            navContainer.style.display = 'flex';
        } else {
            navContainer.style.display = 'none';
        }

        // Helper to update the view based on current index
        const renderCurrentCandidate = () => {
            const candidate = candidates[currentIndex];
            const textToShow = candidate.editedText; // Use edited version if available

            // Update Analysis
            if (analysisContainer && analysisContent) {
                if (candidate.analysis) {
                    analysisContent.textContent = candidate.analysis;
                    analysisContainer.style.display = 'block';
                    // Auto-open analysis for visibility on change
                    if (analysisDetails) analysisDetails.setAttribute('open', 'true');
                } else {
                    analysisContainer.style.display = 'none';
                }
            }

            // Update Counter
            if (counter) {
                counter.textContent = `Candidate ${currentIndex + 1} / ${candidates.length}`;
            }

            // Update Diff and Editor
            const diff = diffWords(oldText, textToShow);
            container.innerHTML = '';
            container.appendChild(renderDiffToHtml(diff));
            editor.value = textToShow;
        };

        // Initialize view
        renderCurrentCandidate();

        // Navigation Handlers
        const saveCurrentState = () => {
            // Save whatever is in the editor to the current candidate
            candidates[currentIndex].editedText = editor.value;
        };

        prevBtn.onclick = (e) => {
            e.preventDefault();
            saveCurrentState();
            currentIndex = (currentIndex - 1 + candidates.length) % candidates.length;
            renderCurrentCandidate();
        };

        nextBtn.onclick = (e) => {
            e.preventDefault();
            saveCurrentState();
            currentIndex = (currentIndex + 1) % candidates.length;
            renderCurrentCandidate();
        };

        // Editor Change Handler (to ensure state is captured even if they don't switch candidate)
        editor.oninput = () => {
             candidates[currentIndex].editedText = editor.value;
        };

        // Tab switching logic
        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                const target = tab.dataset.tab;
                popup.querySelectorAll('.gg-tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                popup.querySelector(`#gg-${target}-tab`).classList.add('active');
                
                // If switching back to preview, update it with current editor content
                if (target === 'preview') {
                    // Update diff view with current editor content
                    const diff = diffWords(oldText, editor.value);
                    container.innerHTML = '';
                    container.appendChild(renderDiffToHtml(diff));
                }
            };
        });

        // Bring popup to foreground
        popup.style.display = 'flex';
        document.body.classList.add('gg-popup-open');

        const cleanup = (result) => {
            popup.style.display = 'none';
            document.body.classList.remove('gg-popup-open');
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
            closeBtn.onclick = null;
            prevBtn.onclick = null;
            nextBtn.onclick = null;
            editor.oninput = null;
            tabs.forEach(t => t.onclick = null);
            resolve(result);
        };

        confirmBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Always return what's in the editor (which is sync'd with current candidate)
            const finalResult = editor.value;
            debugLog('Diff Popup: Confirm clicked with result:', finalResult);
            cleanup(finalResult);
        };
        
        cancelBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            debugLog('Diff Popup: Cancel clicked');
            cleanup(null);
        };

        closeBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            cleanup(null);
        };
    });
}
