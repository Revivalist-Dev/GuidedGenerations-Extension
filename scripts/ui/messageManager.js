import { chat, saveChatConditional, redisplayChat } from '../../../../../../script.js';
import { getContext } from '../../../../../extensions.js';
import { debugLog } from '../../index.js';

/**
 * Returns the avatar URL for a given name, checking the main character and the user.
 * @param {string} name - The name of the speaker.
 * @returns {string|null} The avatar URL or null if not found.
 */
export function getAvatarUrlForName(name) {
    const context = getContext();
    if (!context) {
        return null;
    }

    // Check main character
    if (context.character && context.character.name === name) {
        return context.character.avatar || null;
    }

    // Check user
    if (context.user && context.user.name === name) {
        return context.user.avatar || null;
    }

    return null;
}

/**
 * Inserts a blank message at the specified index.
 * @param {number} index - The index to insert at.
 * @param {string} name - The name for the message.
 * @param {boolean} isUser - Whether it's a user message.
 */
export async function insertMessageAt(index, name, isUser = true) {
    debugLog(`[MessageManager] Inserting message at index ${index} as ${name}`);
    
    const avatarUrl = getAvatarUrlForName(name);

    const newMessage = {
        name: name,
        is_user: isUser,
        is_system: false,
        mes: '',
        extra: {},
        send_date: new Date().toLocaleString(),
        ...(avatarUrl && { avatar: avatarUrl }),
    };
    
    // Insert into the chat array
    chat.splice(index, 0, newMessage);
    
    // Save the chat to persist changes
    if (typeof saveChatConditional === 'function') {
        await saveChatConditional();
    }
    
    // Redisplay chat to show the new message
    if (typeof redisplayChat === 'function') {
        await redisplayChat(chat, index);
    }
    
    // Automatically trigger edit mode for the new message
    setTimeout(() => {
        const $mes = $(`#chat .mes[mesid="${index}"]`);
        if ($mes.length) {
            $mes.find('.mes_edit').click();
            debugLog(`[MessageManager] Triggered edit mode for message at index ${index}`);
        }
    }, 100);
}
