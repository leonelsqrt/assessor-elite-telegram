import { editMessage, buildKeyboard } from '../../utils/telegram.js';
import { getSleepStats, getWaterStats } from '../../db/health.js';
import { formatDuration } from '../../utils/format.js';

// Show health area card
export async function showHealthCard(
    chatId: number,
    messageId: number,
    userId: number
): Promise<void> {
    const sleepStats = await getSleepStats(userId);
    const waterStats = await getWaterStats(userId);

    let text = `
<b>💪 SAÚDE</b>
─────────────────────────

`;

    // Sleep info
    if (sleepStats?.todaySleepHours) {
        text += `😴 <b>Sono hoje:</b> ${formatDuration(Math.round(sleepStats.todaySleepHours * 60))}\n`;
    } else {
        text += `😴 <b>Sono hoje:</b> <i>Sem dados</i>\n`;
    }

    if (sleepStats?.avgHours) {
        text += `📊 <b>Média semanal:</b> ${sleepStats.avgHours.toFixed(1)}h\n`;
    }

    text += '\n';

    // Water info
    if (waterStats) {
        const bar = getProgressBar(waterStats.percentComplete);
        text += `💧 <b>Água hoje:</b> ${waterStats.todayMl}ml / ${waterStats.goalMl}ml\n`;
        text += `📊 <b>Progresso:</b> ${bar} ${waterStats.percentComplete}%\n`;

        if (waterStats.remaining > 0) {
            text += `\n<i>Faltam ${waterStats.remaining}ml para a meta! 💪</i>\n`;
        } else {
            text += `\n<i>🎉 Meta atingida! Parabéns!</i>\n`;
        }
    }

    text += `
─────────────────────────`;

    const keyboard = buildKeyboard([
        [{ text: '🛏️ Monitoramento de Sono', callback_data: 'sleep' }],
        [{ text: '💧 Ver Consumo de Água', callback_data: 'water' }],
        [{ text: '↩️ Voltar ao Hub', callback_data: 'hub' }],
    ]);

    await editMessage(chatId, messageId, text, { replyMarkup: keyboard });
}

// Progress bar helper
function getProgressBar(percent: number): string {
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    return '▓'.repeat(Math.min(filled, 10)) + '░'.repeat(Math.max(empty, 0));
}
