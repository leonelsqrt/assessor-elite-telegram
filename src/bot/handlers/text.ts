import { TelegramMessage, sendMessage, deleteMessage, editMessage, buildKeyboard, sendForceReply } from '../../utils/telegram.js';
import { getBotState, clearBotState, getLastMessageId, updateBotStateData, setBotState } from '../../db/users.js';
import { updateEventDraft, getActiveEventDraft } from '../../db/events.js';
import { parseDate, parseTime, formatDate, formatTime } from '../../utils/format.js';
import { processWithAI } from '../../ai/gemini.js';
import { saveMemory } from '../../db/memory.js';
import { showEventDraft, askAllDay } from './events.js';
import { logWater } from '../../db/health.js';
import { showWaterCard } from './water.js';
import { handleStart, showHub } from './start.js';

// Handle text messages (for ForceReply and AI responses)
export async function handleTextMessage(message: TelegramMessage): Promise<void> {
    const chatId = message.chat.id;
    const userId = message.from?.id;
    const text = message.text?.trim() || '';

    if (!userId || !text) return;

    // Delete user message for clean chat
    await deleteMessage(chatId, message.message_id);

    // Check if we're in a state expecting input
    const state = await getBotState(userId);

    if (state.currentState) {
        await handleStateInput(chatId, userId, text, state);
        return;
    }

    // No active state - use AI to respond
    await handleAIResponse(chatId, userId, text, message.from?.first_name || 'Usuário');
}

// Handle input based on current state
async function handleStateInput(
    chatId: number,
    userId: number,
    text: string,
    state: { currentState: string | null; stateData: Record<string, any>; lastMessageId: number | null }
): Promise<void> {
    // Delete the ForceReply prompt message
    if (state.stateData.promptMessageId) {
        await deleteMessage(chatId, state.stateData.promptMessageId);
    }

    const messageId = state.stateData.messageId || state.lastMessageId;

    switch (state.currentState) {
        case 'event_title':
            await handleEventTitleInput(chatId, userId, text, messageId);
            break;
        case 'event_date':
            await handleEventDateInput(chatId, userId, text, messageId);
            break;
        case 'event_start':
            await handleEventStartInput(chatId, userId, text, messageId);
            break;
        case 'event_end':
            await handleEventEndInput(chatId, userId, text, messageId);
            break;
        case 'event_location':
            await handleEventLocationInput(chatId, userId, text, messageId);
            break;
        default:
            // Clear unknown state and respond with AI
            await clearBotState(userId);
            await handleAIResponse(chatId, userId, text, 'Usuário');
    }
}

// Event field handlers - Sequential flow
async function handleEventTitleInput(chatId: number, userId: number, text: string, messageId: number): Promise<void> {
    const draft = await getActiveEventDraft(userId);
    if (!draft) {
        await clearBotState(userId);
        return;
    }

    // Save title
    await updateEventDraft(draft.id, { title: text });

    // Clear state and ask for date
    await setBotState(userId, 'event_date', { messageId });
    const msg = await sendForceReply(chatId, '📅 Qual a data? (dd/mm/aaaa)', 'Ex: 15/02/2026');
    if (msg) {
        await updateBotStateData(userId, { promptMessageId: msg.message_id });
    }
}

async function handleEventDateInput(chatId: number, userId: number, text: string, messageId: number): Promise<void> {
    const draft = await getActiveEventDraft(userId);
    if (!draft) {
        await clearBotState(userId);
        return;
    }

    const date = parseDate(text);
    if (!date) {
        // Send error and ask again
        const msg = await sendForceReply(chatId, '❌ Data inválida. Use o formato dd/mm/aaaa', 'Ex: 15/02/2026');
        if (msg) {
            await updateBotStateData(userId, { promptMessageId: msg.message_id });
        }
        return;
    }

    // Save date
    await updateEventDraft(draft.id, { event_date: date });
    await clearBotState(userId);

    // Ask if it's all day (update the main card message)
    if (messageId) {
        await askAllDay(chatId, messageId, userId);
    }
}

async function handleEventStartInput(chatId: number, userId: number, text: string, messageId: number): Promise<void> {
    const draft = await getActiveEventDraft(userId);
    if (!draft) {
        await clearBotState(userId);
        return;
    }

    const time = parseTime(text);
    if (!time) {
        const msg = await sendForceReply(chatId, '❌ Horário inválido. Use o formato HH:MM', 'Ex: 14:30');
        if (msg) {
            await updateBotStateData(userId, { promptMessageId: msg.message_id });
        }
        return;
    }

    // Save start time
    await updateEventDraft(draft.id, { start_time: formatTime(time.hours, time.minutes) });

    // Ask for end time
    await setBotState(userId, 'event_end', { messageId });
    const msg = await sendForceReply(chatId, '🔴 Horário de fim?', 'Ex: 16:00');
    if (msg) {
        await updateBotStateData(userId, { promptMessageId: msg.message_id });
    }
}

async function handleEventEndInput(chatId: number, userId: number, text: string, messageId: number): Promise<void> {
    const draft = await getActiveEventDraft(userId);
    if (!draft) {
        await clearBotState(userId);
        return;
    }

    const time = parseTime(text);
    if (!time) {
        const msg = await sendForceReply(chatId, '❌ Horário inválido. Use o formato HH:MM', 'Ex: 16:00');
        if (msg) {
            await updateBotStateData(userId, { promptMessageId: msg.message_id });
        }
        return;
    }

    // Save end time
    await updateEventDraft(draft.id, { end_time: formatTime(time.hours, time.minutes) });

    // Ask for location
    await setBotState(userId, 'event_location', { messageId });
    const msg = await sendForceReply(chatId, '📍 Qual o local?', 'Ex: Escritório, Sala 302');
    if (msg) {
        await updateBotStateData(userId, { promptMessageId: msg.message_id });
    }
}

async function handleEventLocationInput(chatId: number, userId: number, text: string, messageId: number): Promise<void> {
    const draft = await getActiveEventDraft(userId);
    if (!draft) {
        await clearBotState(userId);
        return;
    }

    // Save location
    await updateEventDraft(draft.id, { location: text });
    await clearBotState(userId);

    // Show final draft with confirm/cancel/edit buttons
    if (messageId) {
        await showEventDraft(chatId, messageId, userId);
    }
}

// Handle AI-powered responses
async function handleAIResponse(chatId: number, userId: number, text: string, firstName: string): Promise<void> {
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
