import { editMessage, buildKeyboard, sendForceReply, deleteMessage } from '../../utils/telegram.js';
import { setBotState, getLastMessageId, clearBotState, updateBotStateData } from '../../db/users.js';
import {
    createEventDraft,
    getActiveEventDraft,
    updateEventDraft,
    deleteEventDraft,
    getMissingFields,
    startEventEditing,
    finishEventEditing,
    markEventCreated,
    EventDraft
} from '../../db/events.js';
import { createEvent, updateEvent, deleteEvent, getEventUrl } from '../../google/calendar.js';
import { isGoogleAuthenticated, getAuthUrl } from '../../google/auth.js';
import { formatDate } from '../../utils/format.js';

// Start event creation - immediately ask for title with ForceReply
export async function handleCreateEvent(
    chatId: number,
    messageId: number,
    userId: number
): Promise<void> {
    // Check if user is authenticated with Google
    const isAuth = await isGoogleAuthenticated(userId);
    if (!isAuth) {
        const authUrl = getAuthUrl(userId);
        const text = `
<b>🔐 Autorização Necessária</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Para criar eventos, preciso acessar seu Google Calendar.

<i>Clique no botão abaixo para autorizar:</i>

━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

        const keyboard = buildKeyboard([
            [{ text: '🔑 Autorizar Google Calendar', url: authUrl }],
            [{ text: '↩️ Voltar ao Hub', callback_data: 'hub' }],
        ]);

        await editMessage(chatId, messageId, text, { replyMarkup: keyboard });
        return;
    }

    // Create new draft
    await createEventDraft(userId, messageId);

    // Set state to await title
    await setBotState(userId, 'event_title', { messageId });

    // Immediately ask for title with ForceReply
    const msg = await sendForceReply(chatId, '📝 Qual o título do evento?', 'Ex: Reunião com cliente');
    if (msg) {
        await updateBotStateData(userId, { promptMessageId: msg.message_id });
    }
}

// Show event draft card (clean version - no missing fields list, no floating buttons)
export async function showEventDraft(
    chatId: number,
    messageId: number,
    userId: number
): Promise<void> {
    const draft = await getActiveEventDraft(userId);
    if (!draft) return;

    let text = `
<b>📅 NOVO EVENTO</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 <b>Título:</b> ${draft.title || '<i>─</i>'}
📅 <b>Data:</b> ${draft.event_date ? formatDate(new Date(draft.event_date)) : '<i>─</i>'}
`;

    if (draft.all_day) {
        text += `🌙 <b>Dia Inteiro:</b> Sim\n`;
    } else {
        text += `🟢 <b>Início:</b> ${draft.start_time || '<i>─</i>'}\n`;
        text += `🔴 <b>Fim:</b> ${draft.end_time || '<i>─</i>'}\n`;
    }

    text += `📍 <b>Local:</b> ${draft.location || '<i>─</i>'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

    // Check if event is ready
    const missing = getMissingFields(draft);
    const isReady = missing.length === 0;

    let keyboard;

    if (isReady) {
        // Show final buttons: Confirmar | Cancelar, then Editar below
        keyboard = buildKeyboard([
            [
                { text: '✅ Confirmar', callback_data: 'event_confirm' },
                { text: '❌ Cancelar', callback_data: 'event_cancel' },
            ],
            [
                { text: '✏️ Editar', callback_data: 'event_edit' },
            ],
        ]);
    } else {
        // Just cancel button while filling
        keyboard = buildKeyboard([
            [{ text: '❌ Cancelar', callback_data: 'event_cancel' }],
        ]);
    }

    await editMessage(chatId, messageId, text, { replyMarkup: keyboard });
}

// Handle field input request (ForceReply) - called from text.ts after user responds
export async function handleEventFieldInput(
    chatId: number,
    messageId: number,
    userId: number,
    field: string,
    isEdit = false
): Promise<void> {
    const prompts: Record<string, { text: string; placeholder: string }> = {
        title: { text: '📝 Qual o título do evento?', placeholder: 'Ex: Reunião com cliente' },
        date: { text: '📅 Qual a data? (dd/mm/aaaa)', placeholder: 'Ex: 15/02/2026' },
        start: { text: '🟢 Horário de início?', placeholder: 'Ex: 14:30' },
        end: { text: '🔴 Horário de fim?', placeholder: 'Ex: 16:00' },
        location: { text: '📍 Qual o local?', placeholder: 'Ex: Escritório, Sala 302' },
    };

    const prompt = prompts[field];
    if (!prompt) return;

    // Set state to await response
    await setBotState(userId, `event_${field}`, { messageId });

    // Send ForceReply
    const msg = await sendForceReply(chatId, prompt.text, prompt.placeholder);
    if (msg) {
        await updateBotStateData(userId, { promptMessageId: msg.message_id });
    }
}

// Ask if event is all day (called after date is set)
export async function askAllDay(
    chatId: number,
    messageId: number,
    userId: number
): Promise<void> {
    const text = `
<b>📅 NOVO EVENTO</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━━

<i>Este evento é o dia inteiro?</i>

━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    const keyboard = buildKeyboard([
        [
            { text: '✅ Sim, dia inteiro', callback_data: 'event_allday_yes' },
            { text: '❌ Não', callback_data: 'event_allday_no' },
        ],
    ]);

    await editMessage(chatId, messageId, text, { replyMarkup: keyboard });
}

// Handle all day response
export async function handleAllDayResponse(
    chatId: number,
    messageId: number,
    userId: number,
    isAllDay: boolean
): Promise<void> {
    const draft = await getActiveEventDraft(userId);
    if (!draft) return;

    await updateEventDraft(draft.id, { all_day: isAllDay });

    if (isAllDay) {
        // Skip time fields, go directly to location
        await setBotState(userId, 'event_location', { messageId });
        const msg = await sendForceReply(chatId, '📍 Qual o local?', 'Ex: Escritório, Sala 302');
        if (msg) {
            await updateBotStateData(userId, { promptMessageId: msg.message_id });
        }
    } else {
        // Ask for start time
        await setBotState(userId, 'event_start', { messageId });
        const msg = await sendForceReply(chatId, '🟢 Horário de início?', 'Ex: 14:30');
        if (msg) {
            await updateBotStateData(userId, { promptMessageId: msg.message_id });
        }
    }
}

// Toggle all day (for edit mode)
export async function handleToggleAllDay(
    chatId: number,
    messageId: number,
    userId: number
): Promise<void> {
    const draft = await getActiveEventDraft(userId);
    if (!draft) return;

    await updateEventDraft(draft.id, { all_day: !draft.all_day });
    await showEventEdit(chatId, messageId, userId, draft);
}

// Confirm event creation
export async function handleConfirmEvent(
    chatId: number,
    messageId: number,
    userId: number
): Promise<void> {
    const draft = await getActiveEventDraft(userId);
    if (!draft) return;

    // Validate all fields
    const missing = getMissingFields(draft);
    if (missing.length > 0) {
        await showEventDraft(chatId, messageId, userId);
        return;
    }

    // Create event in Google Calendar
    try {
        const eventId = await createEvent(userId, {
            title: draft.title!,
            date: new Date(draft.event_date!),
            startTime: draft.start_time ? parseTimeString(draft.start_time) : undefined,
            endTime: draft.end_time ? parseTimeString(draft.end_time) : undefined,
            location: draft.location,
            allDay: draft.all_day,
        });

        if (!eventId) {
            throw new Error('Failed to create event');
        }

        // Mark as created
        await markEventCreated(draft.id, eventId);

        // Update draft with message ID
        await updateEventDraft(draft.id, { message_id: messageId });

        // Show success card
        await showEventCreated(chatId, messageId, userId, draft, eventId);
    } catch (error) {
        console.error('❌ Error creating event:', error);

        const text = `
<b>❌ Erro ao Criar Evento</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Não foi possível criar o evento no Google Calendar.

<i>Tente novamente ou verifique sua conexão.</i>

━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

        const keyboard = buildKeyboard([
            [{ text: '🔄 Tentar Novamente', callback_data: 'event_confirm' }],
            [{ text: '↩️ Voltar ao Hub', callback_data: 'hub' }],
        ]);

        await editMessage(chatId, messageId, text, { replyMarkup: keyboard });
    }
}

// Show created event card
async function showEventCreated(
    chatId: number,
    messageId: number,
    userId: number,
    draft: EventDraft,
    eventId: string
): Promise<void> {
    const eventUrl = getEventUrl(eventId);

    let text = `
<b>✅ EVENTO CRIADO!</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 <b>Título:</b> ${draft.title}
📅 <b>Data:</b> ${formatDate(new Date(draft.event_date!))}
`;

    if (draft.all_day) {
        text += `🌙 <b>Dia Inteiro</b>\n`;
    } else {
        text += `⏰ <b>Horário:</b> ${draft.start_time} - ${draft.end_time}\n`;
    }

    text += `📍 <b>Local:</b> ${draft.location}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
<i>✨ Evento salvo no Google Agenda!</i>
`;

    const keyboard = buildKeyboard([
        [
            { text: '✏️ Editar', callback_data: 'event_edit' },
            { text: '❌ Excluir', callback_data: 'event_cancel' },
        ],
        [{ text: '📅 Abrir na Agenda', url: eventUrl }],
        [{ text: '↩️ Voltar ao Hub', callback_data: 'hub' }],
    ]);

    await editMessage(chatId, messageId, text, { replyMarkup: keyboard });
}

// Handle edit event
export async function handleEditEvent(
    chatId: number,
    messageId: number,
    userId: number
): Promise<void> {
    const draft = await getActiveEventDraft(userId);
    if (!draft) return;

    await startEventEditing(draft.id);
    await showEventEdit(chatId, messageId, userId, draft);
}

// Show edit card
async function showEventEdit(
    chatId: number,
    messageId: number,
    userId: number,
    draft: EventDraft
): Promise<void> {
    let text = `
<b>✏️ EDITAR EVENTO</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 <b>Título:</b> ${draft.title}
📅 <b>Data:</b> ${formatDate(new Date(draft.event_date!))}
`;

    if (draft.all_day) {
        text += `🌙 <b>Dia Inteiro:</b> Sim\n`;
    } else {
        text += `⏰ <b>Horário:</b> ${draft.start_time} - ${draft.end_time}\n`;
    }

    text += `📍 <b>Local:</b> ${draft.location}

━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    const keyboard = buildKeyboard([
        [{ text: '📝 Alterar Título', callback_data: 'edit_title' }],
        [{ text: '📅 Alterar Data', callback_data: 'edit_date' }],
        [{ text: '⏰ Alterar Horário', callback_data: 'edit_start' }],
        [{ text: '📍 Alterar Local', callback_data: 'edit_location' }],
        [{ text: draft.all_day ? '🌙 Dia Inteiro: ON' : '🌙 Dia Inteiro: OFF', callback_data: 'event_all_day' }],
        [
            { text: '✅ Salvar', callback_data: 'event_save' },
            { text: '↩️ Sair', callback_data: 'event_exit' },
        ],
    ]);

    await editMessage(chatId, messageId, text, { replyMarkup: keyboard });
}

// Save edited event
export async function handleSaveEvent(
    chatId: number,
    messageId: number,
    userId: number
): Promise<void> {
    const draft = await getActiveEventDraft(userId);
    if (!draft || !draft.google_event_id) return;

    try {
        await updateEvent(userId, draft.google_event_id, {
            title: draft.title!,
            date: new Date(draft.event_date!),
            startTime: draft.start_time ? parseTimeString(draft.start_time) : undefined,
            endTime: draft.end_time ? parseTimeString(draft.end_time) : undefined,
            location: draft.location,
            allDay: draft.all_day,
        });

        await finishEventEditing(draft.id);
        await showEventCreated(chatId, messageId, userId, draft, draft.google_event_id);
    } catch (error) {
        console.error('❌ Error updating event:', error);
    }
}

// Exit edit mode
export async function handleExitEdit(
    chatId: number,
    messageId: number,
    userId: number
): Promise<void> {
    const draft = await getActiveEventDraft(userId);
    if (!draft || !draft.google_event_id) return;

    await finishEventEditing(draft.id);
    await showEventCreated(chatId, messageId, userId, draft, draft.google_event_id);
}

// Cancel event
export async function handleCancelEvent(
    chatId: number,
    messageId: number,
    userId: number
): Promise<void> {
    const draft = await getActiveEventDraft(userId);
    if (!draft) {
        // Just go back to hub
        const { showHub } = await import('./start.js');
        await showHub(chatId, messageId, userId);
        return;
    }

    // If event was created, delete from Google
    if (draft.google_event_id) {
        await deleteEvent(userId, draft.google_event_id);
    }

    // Delete draft
    await deleteEventDraft(draft.id);

    // Show cancellation message and go to hub
    const { showHub } = await import('./start.js');
    await showHub(chatId, messageId, userId);
}

// Helpers
function parseTimeString(time: string): { hours: number; minutes: number } {
    const [hours, minutes] = time.split(':').map(Number);
    return { hours, minutes };
}
