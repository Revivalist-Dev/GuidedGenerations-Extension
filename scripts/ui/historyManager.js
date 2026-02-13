import { rewriteHistoryManager } from '../utils/rewriteHistory.js';
import { debugLog, debugError } from '../utils/logger.js';
import { extensionName } from '../../index.js';

async function ensureHistoryPopupLoaded() {
    if (document.getElementById('gg-history-popup')) return true;
    try {
        const response = await fetch('/scripts/extensions/third-party/GuidedGenerations-Extension/html/historyPopup.html');
        if (response.ok) {
            const html = await response.text();
            document.body.insertAdjacentHTML('beforeend', html);
            return true;
        }
    } catch (err) {
        debugError('Failed to load history popup HTML:', err);
        return false;
    }
}

export async function showHistoryPopup(mesId) {
    if (!mesId && mesId !== 0) return;
    
    await ensureHistoryPopupLoaded();
    const popup = document.getElementById('gg-history-popup');
    const list = popup.querySelector('#gg-history-list');
    const closeBtn = popup.querySelector('.gg-popup-close');
    
    // Clear list
    list.innerHTML = '';
    
    const history = rewriteHistoryManager.getHistory(mesId);
    
    if (history.length === 0) {
        list.innerHTML = '<div class="gg-history-empty">No history available for this message.</div>';
    } else {
        // Reverse order (newest first)
        [...history].reverse().forEach((entry, index) => {
            const item = document.createElement('div');
            item.className = 'gg-history-item';
            
            const meta = document.createElement('div');
            meta.className = 'gg-history-meta';
            
            const timeSpan = document.createElement('span');
            timeSpan.textContent = `${rewriteHistoryManager.formatTime(entry.timestamp)} (${entry.type})`;
            
            const restoreBtn = document.createElement('button');
            restoreBtn.className = 'gg-history-restore-btn';
            restoreBtn.textContent = 'Restore';
            restoreBtn.onclick = () => restoreHistoryEntry(mesId, entry.content);
            
            meta.appendChild(timeSpan);
            meta.appendChild(restoreBtn);
            
            const content = document.createElement('div');
            content.className = 'gg-history-content';
            content.textContent = entry.content;
            
            item.appendChild(meta);
            item.appendChild(content);
            list.appendChild(item);
        });
    }
    
    popup.style.display = 'flex';
    document.body.classList.add('gg-popup-open');
    
    const close = () => {
        popup.style.display = 'none';
        document.body.classList.remove('gg-popup-open');
        closeBtn.onclick = null;
        popup.onclick = null;
    };
    
    closeBtn.onclick = close;
    
    // Close on click outside
    popup.onclick = (e) => {
        if (e.target === popup) close();
    };
}

function restoreHistoryEntry(mesId, content) {
    // We assume we are in edit mode for this message
    const activeElement = document.activeElement;
    // Check if active element is a textarea/input OR if we can find the specific message editor
    // The history popup might have stolen focus?
    // Actually, when we click "Restore", the button inside the popup has focus.
    
    // We need to find the editor for this mesId.
    // SillyTavern usually has one active editor.
    const editor = document.querySelector(`textarea[id*="edit_textarea"]`) || document.querySelector('#send_textarea'); 
    // Wait, typical ST edit box class/id?
    // Usually it's injected.
    
    // Let's try to find the textarea that corresponds to the message.
    // Or just look for any visible textarea.
    const textareas = Array.from(document.querySelectorAll('textarea'));
    // Filter for the one that likely contains the message or is being edited.
    // Or we rely on the fact that the user opened the menu from an editor.
    
    // Let's iterate all textareas and see if any match the mesid if possible, or just update the one that is visible in the chat stream?
    // Actually, ST puts the editor *inside* the message div usually, or replaces the message div.
    
    let targetTextarea = null;
    
    // Try to find an open editor for this message
    const messageDiv = document.querySelector(`.mes[mesid="${mesId}"]`);
    if (messageDiv) {
        targetTextarea = messageDiv.querySelector('textarea');
    }
    
    if (!targetTextarea) {
        // Fallback to active element if it's a textarea (though popup button has focus now)
        // Fallback to querySelector('textarea') if only one is open?
        // This is tricky.
        
        // If we can't find the textarea, we update the chat object and refresh the message?
        // Updating global chat is easy. Refreshing the DOM without a full reload is harder.
        
        let globalChat = (typeof chat !== 'undefined') ? chat : window.chat;
        if (!globalChat && typeof SillyTavern !== 'undefined') globalChat = SillyTavern.chat;

        if (globalChat && globalChat[mesId]) {
            globalChat[mesId].mes = content;
            const swipeId = globalChat[mesId].swipe_id || 0;
            if (globalChat[mesId].swipes && globalChat[mesId].swipes[swipeId] !== undefined) {
                 globalChat[mesId].swipes[swipeId] = content;
            }
            
            // Trigger a redraw of this message if possible
            // moduleManager has updateMessageBlock?
            // or just toastr info
            toastr.success("Message restored. You may need to refresh the page if the editor wasn't open.");
        }
        return;
    }
    
    if (targetTextarea) {
        targetTextarea.value = content;
        targetTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        toastr.success("Message restored from history.");
    }
}
