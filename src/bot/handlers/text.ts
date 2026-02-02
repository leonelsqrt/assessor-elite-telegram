import { TelegramMessage, sendMessage, deleteMessage, editMessage, buildKeyboard } from '../../utils/telegram.js';
import { getBotState, clearBotState, getLastMessageId, updateBotStateData } from '../../db/users.js';
import { updateEventDraft, getActiveEventDraft } from '../../db/events.js';
import { parseDate, parseTime, formatDate, formatTime } from '../../utils/format.js';
import { processWithAI } from '../../ai/gemini.js';
import { saveMemory } from '../../db/memory.js';
import { showEventDraft } from './events.js';
import { logWater } from '../../db/health.js';
import { showWaterCard } from './water.js';
import { handleStart, showHub } from './start.js';

// Handle text messages (for ForceReply and AI responses)
export async function handleTextMessage(message: TelegramMessage): Promise<void> {
    const chatId = message.chat.id;
    const userId = message.from?.id;
    const text = message.text?.trim() || '';

    if (!userId || !text) return;

    // Check if we're in a state expecting input
    const state = await getBotState(userId);

    if (state.currentState) {
        await handleStateInput(message, state);
        return;
    }

    // No active state - use AI to respond
    await handleAIResponse(message);
}

// Handle input based on current state
async function handleStateInput(
    message: TelegramMessage,
    state: { currentState: string | null; stateData: Record<string, any>; lastMessageId: number | null }
): Promise<void> {
    const chatId = message.chat.id;
    const userId = message.from!.id;
    const text = message.text!.trim();

    // Try to delete the user's message and the ForceReply prompt
    if (state.stateData.promptMessageId) {
        await deleteMessage(chatId, state.stateData.promptMessageId);
    }
    await deleteMessage(chatId, message.message_id);

    switch (state.currentState) {
        case 'event_title':
            await handleEventTitleInput(chatId, userId, text, state);
            break;
        case 'event_date':
            await handleEventDateInput(chatId, userId, text, state);
            break;
        case 'event_start':
            await handleEventStartInput(chatId, userId, text, state);
            break;
        case 'event_end':
            await handleEventEndInput(chatId, userId, text, state);
            break;
        case 'event_location':
            await handleEventLocationInput(chatId, userId, text, state);
            break;
        default:
            // Clear unknown state and respond with AI
            await clearBotState(userId);
            await handleAIResponse(message);
    }
}

// Event field handlers
async function handleEventTitleInput(chatId: number, userId: number, text: string, state: any): Promise<void> {
    const draft = await getActiveEventDraft(userId);
    if (!draft) {
        await clearBotState(userId);
        return;
    }

    await updateEventDraft(draft.id, { title: text });
    await clearBotState(userId);

    if (state.lastMessageId) {
        await showEventDraft(chatId, state.lastMessageId, userId);
    }
}

async function handleEventDateInput(chatId: number, userId: number, text: string, state: any): Promise<void> {
    const draft = await getActiveEventDraft(userId);
    if (!draft) {
        await clearBotState(userId);
        return;
    }

    const date = parseDate(text);
    if (!date) {
        // Send error and ask again
        const msg = await sendMessage(chatId, '❌ Data inválida. Use o formato dd/mm/aaaa (ex: 15/02/2026)', {
            replyMarkup: { force_reply: true, input_field_placeholder: 'Ex: 15/02/2026' },
        });
        if (msg) {
            await updateBotStateData(userId, { promptMessageId: msg.message_id });
        }
        return;
    }

    await updateEventDraft(draft.id, { event_date: date });
    await clearBotState(userId);

    if (state.lastMessageId) {
        await showEventDraft(chatId, state.lastMessageId, userId);
    }
}

async function handleEventStartInput(chatId: number, userId: number, text: string, state: any): Promise<void> {
    const draft = await getActiveEventDraft(userId);
    if (!draft) {
        await clearBotState(userId);
        return;
    }

    const time = parseTime(text);
    if (!time) {
        const msg = await sendMessage(chatId, '❌ Horário inválido. Use o formato HH:MM (ex: 14:30)', {
            replyMarkup: { force_reply: true, input_field_placeholder: 'Ex: 14:30' },
        });
        if (msg) {
            await updateBotStateData(userId, { promptMessageId: msg.message_id });
        }
        return;
    }

    await updateEventDraft(draft.id, { start_time: formatTime(time.hours, time.minutes) });
    await clearBotState(userId);

    if (state.lastMessageId) {
        await showEventDraft(chatId, state.lastMessageId, userId);
    }
}

async function handleEventEndInput(chatId: number, userId: number, text: string, state: any): Promise<void> {
    const draft = await getActiveEventDraft(userId);
    if (!draft) {
        await clearBotState(userId);
        return;
    }

    const time = parseTime(text);
    if (!time) {
        const msg = await sendMessage(chatId, '❌ Horário inválido. Use o formato HH:MM (ex: 16:00)', {
            replyMarkup: { force_reply: true, input_field_placeholder: 'Ex: 16:00' },
        });
        if (msg) {
            await updateBotStateData(userId, { promptMessageId: msg.message_id });
        }
        return;
    }

    await updateEventDraft(draft.id, { end_time: formatTime(time.hours, time.minutes) });
    await clearBotState(userId);

    if (state.lastMessageId) {
        await showEventDraft(chatId, state.lastMessageId, userId);
    }
}

async function handleEventLocationInput(chatId: number, userId: number, text: string, state: any): Promise<void> {
    const draft = await getActiveEventDraft(userId);
    if (!draft) {
        await clearBotState(userId);
        return;
    }

    await updateEventDraft(draft.id, { location: text });
    await clearBotState(userId);

    if (state.lastMessageId) {
        await showEventDraft(chatId, state.lastMessageId, userId);
    }
}

// Handle AI-powered responses
async function handleAIResponse(message: TelegramMessage): Promise<void> {
    const chatId = message.chat.id;
    const userId = message.from!.id;
    const text = message.text!.trim();
    const firstName = message.from?.first_name || 'Usuário';

    // Process with AI
    const response = await processWithAI(userId, text, firstName);

    // Handle AI-detected actions
    if (response.action) {
        await executeAIAction(chatId, userId, response.action, response.params || {});
    }

    // Send the AI message
    if (response.message) {
        await sendMessage(chatId, response.message);
    }

    // Save memory if needed
    if (response.shouldSaveMemory && response.memoryContent && response.memoryType) {
        await saveMemory(userId, response.memoryContent, response.memoryType);
    }
}

// Execute action detected by AI
async function executeAIAction(
    chatId: number,
    userId: number,
    action: string,
    params: Record<string, any>
): Promise<void> {
    switch (action) {
        case 'show_hub':
            await handleStart(chatId, userId);
            break;
        case 'show_health':
            // Will be handled via card update
            break;
        case 'log_water':
            if (params.amount) {
                await logWater(userId, params.amount);
                await sendMessage(chatId, `💧 ${params.amount}ml registrado com sucesso!`);
            }
            break;
        case 'create_event':
            // AI extracted event data - create draft and show card
            break;
        default:
            console.log(`⚠️ Unknown AI action: ${action}`);
    }
}
