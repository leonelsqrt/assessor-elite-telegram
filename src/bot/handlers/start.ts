import { sendMessage, editMessage, buildKeyboard, deleteMessage } from '../../utils/telegram.js';
import { setLastMessageId, getLastMessageId } from '../../db/users.js';
import { getSleepStats, getWaterStats } from '../../db/health.js';
import { formatDuration } from '../../utils/format.js';

// Build the Hub Central card
export async function handleStart(chatId: number, userId: number): Promise<void> {
    // Delete previous message if exists
    const lastMsgId = await getLastMessageId(userId);
    if (lastMsgId) {
        await deleteMessage(chatId, lastMsgId);
    }

    // Get current stats for display
    const sleepStats = await getSleepStats(userId);
    const waterStats = await getWaterStats(userId);

    // Build welcome message
    let text = `
<b>🧩 ASSESSOR ELITE</b>
─────────────────────────
<i>Sua central de controle pessoal</i>

`;

    // Add quick status
    if (sleepStats?.todaySleepHours) {
        text += `😴 Sono: <b>${formatDuration(Math.round(sleepStats.todaySleepHours * 60))}</b>\n`;
    }
    if (waterStats) {
        const percent = waterStats.percentComplete;
        const bar = getProgressBar(percent);
        text += `💧 Água: <b>${waterStats.todayMl}ml</b> / ${waterStats.goalMl}ml ${bar}\n`;
    }

    text += `
─────────────────────────
<i>Selecione uma opção abaixo:</i>`;

    // Build keyboard with hierarchical buttons
    const keyboard = buildKeyboard([
        // Row 1: Morning/Night
        [
            { text: '☀️ Bom Dia', callback_data: 'good_morning' },
            { text: '🌙 Boa Noite', callback_data: 'good_night' },
        ],
        // Row 2: Create Event (full width)
        [
            { text: '📅 Criar Evento', callback_data: 'create_event' },
        ],
        // Row 3: Health with sub-action
        [
            { text: '💪 Saúde', callback_data: 'health' },
            { text: '💧 Água Rápido', callback_data: 'water_quick' },
        ],
        // Row 4: Other areas
        [
            { text: '📚 Estudos', callback_data: 'studies' },
            { text: '💰 Finanças', callback_data: 'finances' },
        ],
    ]);

    const msg = await sendMessage(chatId, text, { replyMarkup: keyboard });

    if (msg) {
        await setLastMessageId(userId, msg.message_id);
    }
}

// Helper: Progress bar
function getProgressBar(percent: number): string {
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    return '▓'.repeat(Math.min(filled, 10)) + '░'.repeat(Math.max(empty, 0));
}

// Show Hub (for back navigation)
export async function showHub(chatId: number, messageId: number, userId: number): Promise<void> {
    // Get current stats
    const sleepStats = await getSleepStats(userId);
    const waterStats = await getWaterStats(userId);

    let text = `
<b>🧩 ASSESSOR ELITE</b>
─────────────────────────
<i>Sua central de controle pessoal</i>

`;

    if (sleepStats?.todaySleepHours) {
        text += `😴 Sono: <b>${formatDuration(Math.round(sleepStats.todaySleepHours * 60))}</b>\n`;
    }
    if (waterStats) {
        const percent = waterStats.percentComplete;
        const bar = getProgressBar(percent);
        text += `💧 Água: <b>${waterStats.todayMl}ml</b> / ${waterStats.goalMl}ml ${bar}\n`;
    }

    text += `
─────────────────────────
<i>Selecione uma opção abaixo:</i>`;

    const keyboard = buildKeyboard([
        [
            { text: '☀️ Bom Dia', callback_data: 'good_morning' },
            { text: '🌙 Boa Noite', callback_data: 'good_night' },
        ],
        [
            { text: '📅 Criar Evento', callback_data: 'create_event' },
        ],
        [
            { text: '💪 Saúde', callback_data: 'health' },
            { text: '💧 Água Rápido', callback_data: 'water_quick' },
        ],
        [
            { text: '📚 Estudos', callback_data: 'studies' },
            { text: '💰 Finanças', callback_data: 'finances' },
        ],
    ]);

    await editMessage(chatId, messageId, text, { replyMarkup: keyboard });
}
