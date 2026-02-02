import { editMessage, buildKeyboard, sendMessage, deleteMessage } from '../../utils/telegram.js';
import { showHub, showModules } from './start.js';
import { showHealthCard } from './health.js';
import { showWaterCard, logWaterConsumption, showWaterInsert } from './water.js';
import { showSleepCard } from './sleep.js';
import { handleGoodMorning, handleGoodNight } from './dayNight.js';
import {
    handleCreateEvent,
    handleEventFieldInput,
    handleConfirmEvent,
    handleCancelEvent,
    handleEditEvent,
    handleToggleAllDay,
    handleSaveEvent,
    handleExitEdit,
    handleAllDayResponse
} from './events.js';
import { setLastMessageId, setBotState, getBotState } from '../../db/users.js';

// Main callback router
export async function handleCallback(
    chatId: number,
    messageId: number,
    userId: number,
    data: string
): Promise<void> {
    console.log(`📲 Callback: ${data} from user ${userId}`);

    // Track message for editing
    await setLastMessageId(userId, messageId);

    // Route based on callback data
    switch (data) {
        // Hub navigation
        case 'hub':
        case 'back_hub':
            await showHub(chatId, messageId, userId);
            break;

        // Day/Night buttons
        case 'good_morning':
            await handleGoodMorning(chatId, messageId, userId);
            break;
        case 'good_night':
            await handleGoodNight(chatId, messageId, userId);
            break;

        // Health area
        case 'health':
            await showHealthCard(chatId, messageId, userId);
            break;
        case 'sleep':
            await showSleepCard(chatId, messageId, userId);
            break;
        case 'water':
            await showWaterCard(chatId, messageId, userId);
            break;
        case 'water_quick':
            await showWaterInsert(chatId, messageId, userId);
            break;

        // Water logging
        case 'water_250':
            await logWaterConsumption(chatId, messageId, userId, 250);
            break;
        case 'water_500':
            await logWaterConsumption(chatId, messageId, userId, 500);
            break;
        case 'water_1000':
            await logWaterConsumption(chatId, messageId, userId, 1000);
            break;
        case 'water_insert':
            await showWaterInsert(chatId, messageId, userId);
            break;

        // Event creation
        case 'create_event':
            await handleCreateEvent(chatId, messageId, userId);
            break;
        case 'event_title':
        case 'event_date':
        case 'event_start':
        case 'event_end':
        case 'event_location':
            await handleEventFieldInput(chatId, messageId, userId, data.replace('event_', ''));
            break;
        case 'event_all_day':
            await handleToggleAllDay(chatId, messageId, userId);
            break;
        case 'event_allday_yes':
            await handleAllDayResponse(chatId, messageId, userId, true);
            break;
        case 'event_allday_no':
            await handleAllDayResponse(chatId, messageId, userId, false);
            break;
        case 'event_confirm':
            await handleConfirmEvent(chatId, messageId, userId);
            break;
        case 'event_cancel':
            await handleCancelEvent(chatId, messageId, userId);
            break;
        case 'event_edit':
            await handleEditEvent(chatId, messageId, userId);
            break;
        case 'event_save':
            await handleSaveEvent(chatId, messageId, userId);
            break;
        case 'event_exit':
            await handleExitEdit(chatId, messageId, userId);
            break;

        // Edit event fields
        case 'edit_title':
        case 'edit_date':
        case 'edit_start':
        case 'edit_end':
        case 'edit_location':
            await handleEventFieldInput(chatId, messageId, userId, data.replace('edit_', ''), true);
            break;

        // Future areas (placeholder)
        case 'studies':
            await showPlaceholder(chatId, messageId, '📚 Estudos', 'Em breve você poderá gerenciar seus estudos aqui!');
            break;
        case 'finances':
            await showPlaceholder(chatId, messageId, '💰 Finanças', 'Em breve você poderá gerenciar suas finanças aqui!');
            break;

        // No-op button (separator)
        case 'noop':
            // Do nothing - this is a separator button
            break;

        // Show modules
        case 'show_modules':
            await showModules(chatId, messageId, userId);
            break;

        default:
            console.log(`⚠️ Unknown callback: ${data}`);
    }
}

// Placeholder for future features
async function showPlaceholder(
    chatId: number,
    messageId: number,
    title: string,
    message: string
): Promise<void> {
    const text = `
<b>${title}</b>
─────────────────────────

🚧 <i>${message}</i>

─────────────────────────`;

    const keyboard = buildKeyboard([
        [{ text: '↩️ Voltar ao Hub', callback_data: 'hub' }],
    ]);

    await editMessage(chatId, messageId, text, { replyMarkup: keyboard });
}
