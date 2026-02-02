import { editMessage, buildKeyboard, sendMessage, deleteMessage } from '../../utils/telegram.js';
import { getWaterStats, getWeeklyWaterData, logWater } from '../../db/health.js';
import { getDayName } from '../../utils/format.js';

// Show water consumption card with weekly calendar
export async function showWaterCard(
    chatId: number,
    messageId: number,
    userId: number
): Promise<void> {
    const waterStats = await getWaterStats(userId);
    const weeklyData = await getWeeklyWaterData(userId);

    let text = `
<b>💧 CONSUMO DE ÁGUA</b>
─────────────────────────

<b>Semana passada:</b>
`;

    // Weekly calendar
    const calendarLine: string[] = [];
    weeklyData.forEach(day => {
        const dayName = getDayName(day.date);
        const icon = day.metGoal ? '✅' : '❌';
        calendarLine.push(`${dayName} ${icon}`);
    });

    // Split into two lines for better display
    text += `<code>${calendarLine.slice(0, 4).join(' | ')}</code>\n`;
    text += `<code>${calendarLine.slice(4).join(' | ')}</code>\n`;

    text += `
─────────────────────────

`;

    // Today's progress
    if (waterStats) {
        const bar = getProgressBar(waterStats.percentComplete);
        text += `📊 <b>Hoje:</b> ${waterStats.todayMl}ml / ${waterStats.goalMl}ml\n`;
        text += `${bar} ${waterStats.percentComplete}%\n\n`;

        if (waterStats.remaining > 0) {
            text += `<i>Faltam <b>${waterStats.remaining}ml</b> para a meta! 💪</i>`;
        } else {
            text += `<i>🎉 Parabéns! Você atingiu a meta de hoje!</i>`;
        }
    }

    text += `
─────────────────────────`;

    const keyboard = buildKeyboard([
        [{ text: '💧 Inserir Consumo', callback_data: 'water_insert' }],
        [{ text: '↩️ Voltar', callback_data: 'health' }],
    ]);

    await editMessage(chatId, messageId, text, { replyMarkup: keyboard });
}

// Show water insert buttons
export async function showWaterInsert(
    chatId: number,
    messageId: number,
    userId: number
): Promise<void> {
    const waterStats = await getWaterStats(userId);

    let text = `
<b>💧 INSERIR CONSUMO</b>
─────────────────────────

`;

    if (waterStats) {
        text += `📊 <b>Hoje:</b> ${waterStats.todayMl}ml / ${waterStats.goalMl}ml\n\n`;
    }

    text += `<i>Selecione a quantidade consumida:</i>

─────────────────────────`;

    const keyboard = buildKeyboard([
        [
            { text: '🥛 1 copo (200ml)', callback_data: 'water_250' },
        ],
        [
            { text: '💧 250ml', callback_data: 'water_250' },
        ],
        [
            { text: '🧴 500ml', callback_data: 'water_500' },
        ],
        [{ text: '↩️ Voltar', callback_data: 'water' }],
    ]);

    await editMessage(chatId, messageId, text, { replyMarkup: keyboard });
}

// Log water consumption and show updated card
export async function logWaterConsumption(
    chatId: number,
    messageId: number,
    userId: number,
    amountMl: number
): Promise<void> {
    // Log the consumption
    await logWater(userId, amountMl);

    // Show success toast briefly (we'll update the card immediately)
    const waterStats = await getWaterStats(userId);

    let text = `
<b>💧 CONSUMO DE ÁGUA</b>
─────────────────────────

✅ <b>${amountMl}ml registrado!</b>

`;

    if (waterStats) {
        const bar = getProgressBar(waterStats.percentComplete);
        text += `📊 <b>Total hoje:</b> ${waterStats.todayMl}ml / ${waterStats.goalMl}ml\n`;
        text += `${bar} ${waterStats.percentComplete}%\n\n`;

        if (waterStats.remaining > 0) {
            text += `<i>Faltam <b>${waterStats.remaining}ml</b> para a meta! 💪</i>`;
        } else {
            text += `<i>🎉 Parabéns! Meta atingida!</i>`;
        }
    }

    text += `
─────────────────────────`;

    const keyboard = buildKeyboard([
        [{ text: '💧 Inserir Mais', callback_data: 'water_insert' }],
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
