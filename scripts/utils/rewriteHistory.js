import { debugLog } from './logger.js';
import { extensionName } from '../../index.js';

// In-memory history storage
// Structure: { [mesId]: [ { timestamp, content, type } ] }
let rewriteHistory = {}; 

/**
 * Utility to manage rewrite history for messages.
 * Tracks full message content changes confirmed by the user.
 */
export const rewriteHistoryManager = {
    /**
     * Stores a rewrite entry for a given message ID.
     * @param {string} mesId - The message ID.
     * @param {string} originalFullContent - The full message content BEFORE change.
     * @param {string} newFullContent - The full message content AFTER change.
     */
    addEntry(mesId, originalFullContent, newFullContent) {
        if (!mesId) return;
        if (!rewriteHistory[mesId]) {
            rewriteHistory[mesId] = [];
        }

        // If history is empty, initialize with the original state
        if (rewriteHistory[mesId].length === 0) {
            rewriteHistory[mesId].push({
                timestamp: Date.now(),
                content: originalFullContent,
                type: 'original' // Marker for the base state
            });
        }

        // Avoid duplicate consecutive entries
        const lastEntry = rewriteHistory[mesId][rewriteHistory[mesId].length - 1];
        if (lastEntry && lastEntry.content === newFullContent) {
            return;
        }

        rewriteHistory[mesId].push({
            timestamp: Date.now(),
            content: newFullContent,
            type: 'rewrite'
        });
        
        debugLog(`[${extensionName}][RewriteHistory] Added entry for message ${mesId}. History size: ${rewriteHistory[mesId].length}`);
    },

    /**
     * Clears the history for a specific message.
     * @param {string} mesId - The message ID.
     */
    clearHistory(mesId) {
        if (rewriteHistory[mesId]) {
            delete rewriteHistory[mesId];
            debugLog(`[${extensionName}][RewriteHistory] Cleared history for message ${mesId}.`);
        }
    },

    /**
     * Clears all rewrite history.
     */
    clearAllHistory() {
        rewriteHistory = {};
        debugLog(`[${extensionName}][RewriteHistory] Cleared all history.`);
    },

    /**
     * Retrieves the full history for a message.
     * @param {string} mesId - The message ID.
     * @returns {Array} The history array.
     */
    getHistory(mesId) {
        return rewriteHistory[mesId] || [];
    },
    
    /**
     * Helper to format timestamp
     */
    formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString();
    }
};
