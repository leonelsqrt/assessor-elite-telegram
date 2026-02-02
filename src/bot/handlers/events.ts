import { editMessage, buildKeyboard, sendForceReply, deleteMessage } from '../../utils/telegram.js';
import { setBotState, getLastMessageId, clearBotState } from '../../db/users.js';
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

// Start event creation
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
─────────────────────────

Para criar eventos, preciso acessar seu Google Calendar.

<i>Clique no botão abaixo para autorizar:</i>

─────────────────────────`;

        const keyboard = buildKeyboard([
            [{ text: '🔑 Autorizar Google Calendar', url: authUrl }],
            [{ text: '↩️ Voltar ao Hub', callback_data: 'hub' }],
        ]);

        await editMessage(chatId, messageId, text, { replyMarkup: keyboard });
        return;
    }

    // Create new draft
    const draft = await createEventDraft(userId, messageId);

    // Show draft card
    await showEventDraft(chatId, messageId, userId);
}

// Show event draft card (Card 1 - Rascunho)
export async function showEventDraft(
    chatId: number,
    messageId: number,
    userId: number
): Promise<void> {
    const draft = await getActiveEventDraft(userId);
    if (!draft) return;

    const missing = getMissingFields(draft);
    const isReady = missing.length === 0;

    let text = `
<b>📋 Rascunho do Evento</b>
─────────────────────────

📝 <b>Título:</b> ${draft.title || '<i>(Não definido)</i>'}
📅 <b>Data:</b> ${draft.event_date ? formatDate(new Date(draft.event_date)) : '<i>(Não definido)</i>'}
`;

    if (draft.all_day) {
        text += `🌙 <b>Dia Inteiro:</b> ON\n`;
    } else {
        text += `🟢 <b>Início:</b> ${draft.start_time || '<i>(Não definido)</i>'}\n`;
        text += `🔴 <b>Fim:</b> ${draft.end_time || '<i>(Não definido)</i>'}\n`;
    }

    text += `📍 <b>Local:</b> ${draft.location || '<i>(Não definido)</i>'}

─────────────────────────
`;

    if (!isReady) {
        text += `<b>Para finalizar, falta só:</b>\n`;
        missing.forEach(field => {
            const emoji = getFieldEmoji(field);
            const label = getFieldLabel(field);
            text += `• ${emoji} ${label}\n`;
        });
    } else {
        text += `<i>✅ Tudo pronto! Clique em Confirmar.</i>`;
    }

    // Build buttons
    const buttons: Array<Array<{ text: string; callback_data: string }>> = [];

    if (!isReady) {
        // Add insert buttons for missing fields (max 2 per row)
        const insertButtons = missing.map(field => ({
            text: `${getFieldEmoji(field)} Inserir ${getFieldLabel(field)}`,
            callback_data: `event_${field}`,
        }));

        for (let i = 0; i < insertButtons.length; i += 2) {
            buttons.push(insertButtons.slice(i, i + 2));
        }

        // All day toggle if time fields are missing
        if (missing.includes('start') || missing.includes('end')) {
            buttons.push([{
                text: draft.all_day ? '🌙 Dia Inteiro: ON' : '🌙 Dia Inteiro: OFF',
                callback_data: 'event_all_day'
            }]);
        }
    } else {
        // Ready - show confirm button
        buttons.push([{ text: '✅ Confirmar', callback_data: 'event_confirm' }]);
    }

    // Always add cancel
    buttons.push([{ text: '❌ Cancelar', callback_data: 'event_cancel' }]);

    await editMessage(chatId, messageId, text, { replyMarkup: buildKeyboard(buttons) });
}

// Handle field input request (ForceReply)
export async function handleEventFieldInput(
    chatId: number,
    messageId: number,
    userId: number,
    field: string,
    isEdit = false
): Promise<void> {
    const prompts: Record<string, { text: string; placeholder: string }> = {
        title: { text: '📝 Digite o título do evento:', placeholder: 'Ex: Reunião com cliente' },
        date: { text: '📅 Digite a data (dd/mm/aaaa):', placeholder: 'Ex: 15/02/2026' },
        start: { text: '🟢 Digite o horário de início:', placeholder: 'Ex: 14:30' },
        end: { text: '🔴 Digite o horário de fim:', placeholder: 'Ex: 16:00' },
        location: { text: '📍 Digite o local:', placeholder: 'Ex: Escritório, Sala 302' },
    };

    const prompt = prompts[field];
    if (!prompt) return;

    // Set state to await response
    await setBotState(userId, `event_${field}`, { messageId });

    // Send ForceReply
    const msg = await sendForceReply(chatId, prompt.text, prompt.placeholder);
    if (msg) {
        // Store the prompt message ID so we can delete it later
        await setBotState(userId, `event_${field}`, { messageId, promptMessageId: msg.message_id });
    }
}

// Toggle all day
export async function handleToggleAllDay(
    chatId: number,
    messageId: number,
    userId: number
): Promise<void> {
    const draft = await getActiveEventDraft(userId);
    if (!draft) return;

    await updateEventDraft(draft.id, { all_day: !draft.all_day });
    await showEventDraft(chatId, messageId, userId);
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

        // Show success card (Card 2)
        await showEventCreated(chatId, messageId, userId, draft, eventId);
    } catch (error) {
        console.error('❌ Error creating event:', error);

        const text = `
<b>❌ Erro ao Criar Evento</b>
─────────────────────────

Não foi possível criar o evento no Google Calendar.

<i>Tente novamente ou verifique sua conexão.</i>

─────────────────────────`;

        const keyboard = buildKeyboard([
            [{ text: '🔄 Tentar Novamente', callback_data: 'event_confirm' }],
            [{ text: '↩️ Voltar ao Hub', callback_data: 'hub' }],
        ]);

        await editMessage(chatId, messageId, text, { replyMarkup: keyboard });
    }
}

// Show created event card (Card 2)
async function showEventCreated(
    chatId: number,
    messageId: number,
    userId: number,
    draft: EventDraft,
    eventId: string
): Promise<void> {
    const eventUrl = getEventUrl(eventId);

    let text = `
<b>✅ Criado no Google Agenda!</b>
─────────────────────────

📝 <b>Título:</b> ${draft.title}
📅 <b>Data:</b> ${formatDate(new Date(draft.event_date!))}
`;

    if (draft.all_day) {
        text += `🌙 <b>Dia Inteiro</b>\n`;
    } else {
        text += `⏰ <b>Horário:</b> ${draft.start_time} - ${draft.end_time}\n`;
    }

    text += `📍 <b>Local:</b> ${draft.location}

─────────────────────────`;

    const keyboard = buildKeyboard([
        [
            { text: '✏️ Editar', callback_data: 'event_edit' },
            { text: '❌ Cancelar', callback_data: 'event_cancel' },
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

// Show edit card (Card 3)
async function showEventEdit(
    chatId: number,
    messageId: number,
    userId: number,
    draft: EventDraft
): Promise<void> {
    let text = `
<b>✏️ Edição do Evento</b>
─────────────────────────

📝 <b>Título:</b> ${draft.title}
📅 <b>Data:</b> ${formatDate(new Date(draft.event_date!))}
`;

    if (draft.all_day) {
        text += `🌙 <b>Dia Inteiro:</b> ON\n`;
    } else {
        text += `⏰ <b>Horário:</b> ${draft.start_time} - ${draft.end_time}\n`;
    }

    text += `📍 <b>Local:</b> ${draft.location}

─────────────────────────`;

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
    const text = `
<b>❌ Evento Cancelado</b>
─────────────────────────

O evento foi removido.

─────────────────────────`;

    const keyboard = buildKeyboard([
        [{ text: '↩️ Voltar ao Hub', callback_data: 'hub' }],
    ]);

    await editMessage(chatId, messageId, text, { replyMarkup: keyboard });
}

// Helpers
function getFieldEmoji(field: string): string {
    const emojis: Record<string, string> = {
        title: '📝',
        date: '📅',
        start: '🟢',
        end: '🔴',
        location: '📍',
    };
    return emojis[field] || '📌';
}

function getFieldLabel(field: string): string {
    const labels: Record<string, string> = {
        title: 'Título',
        date: 'Data',
        start: 'Início',
        end: 'Fim',
        location: 'Local',
    };
    return labels[field] || field;
}

function parseTimeString(time: string): { hours: number; minutes: number } {
    const [hours, minutes] = time.split(':').map(Number);
    return { hours, minutes };
}
