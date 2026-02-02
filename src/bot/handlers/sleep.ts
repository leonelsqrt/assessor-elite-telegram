import { editMessage, buildKeyboard } from '../../utils/telegram.js';
import { getWeeklySleepData, getSleepStats } from '../../db/health.js';
import { getDayName, formatDuration } from '../../utils/format.js';
import { config } from '../../config/env.js';

// Show sleep monitoring card
export async function showSleepCard(
    chatId: number,
    messageId: number,
    userId: number
): Promise<void> {
    const sleepStats = await getSleepStats(userId);
    const weeklyData = await getWeeklySleepData(userId);

    let text = `
<b>🛏️ MONITORAMENTO DE SONO</b>
─────────────────────────

`;

    // Weekly sleep data
    text += `<b>Últimos 7 dias:</b>\n\n`;

    weeklyData.forEach(day => {
        const dayName = getDayName(day.date);
        if (day.hours) {
            const quality = getSleepQuality(day.hours);
            text += `${dayName}: ${formatDuration(Math.round(day.hours * 60))} ${quality}\n`;
        } else {
            text += `${dayName}: <i>Sem dados</i>\n`;
        }
    });

    text += `
─────────────────────────

`;

    // Stats
    if (sleepStats?.avgHours) {
        text += `📊 <b>Média:</b> ${sleepStats.avgHours.toFixed(1)}h por noite\n`;
    }

    if (sleepStats?.todaySleepHours) {
        const todayQuality = getSleepQuality(sleepStats.todaySleepHours);
        text += `😴 <b>Última noite:</b> ${formatDuration(Math.round(sleepStats.todaySleepHours * 60))} ${todayQuality}\n`;
    }

    // Insights
    text += `\n`;
    const insight = generateSleepInsight(sleepStats, weeklyData);
    text += `<i>${insight}</i>`;

    text += `
─────────────────────────`;

    const keyboard = buildKeyboard([
        [{ text: '↩️ Voltar', callback_data: 'health' }],
    ]);

    await editMessage(chatId, messageId, text, { replyMarkup: keyboard });
}

// Get sleep quality emoji
function getSleepQuality(hours: number): string {
    if (hours >= 7 && hours <= 9) return '😊';
    if (hours >= 6 && hours < 7) return '😐';
    if (hours > 9) return '😴';
    return '😫';
}

// Generate sleep insight
function generateSleepInsight(
    stats: Awaited<ReturnType<typeof getSleepStats>>,
    weeklyData: Array<{ date: Date; hours?: number }>
): string {
    if (!stats?.avgHours) {
        return '💡 Use os botões "Bom Dia" e "Boa Noite" para registrar seu sono!';
    }

    const avg = stats.avgHours;

    if (avg >= 7 && avg <= 8) {
        return '💚 Excelente! Sua média de sono está ideal. Continue assim!';
    }

    if (avg < 6) {
        return '⚠️ Sua média de sono está baixa. Tente dormir mais cedo hoje para recuperar sua energia!';
    }

    if (avg > 9) {
        return '💤 Você está dormindo bastante! Certifique-se de que a qualidade do sono está boa.';
    }

    // Find worst day
    const worstDay = weeklyData
        .filter(d => d.hours !== undefined)
        .sort((a, b) => (a.hours || 0) - (b.hours || 0))[0];

    if (worstDay && worstDay.hours && worstDay.hours < 5) {
        const dayName = getDayName(worstDay.date);
        return `😴 ${dayName} foi um dia difícil (${formatDuration(Math.round(worstDay.hours * 60))}). Priorize descanso hoje!`;
    }

    return '💡 Mantenha uma rotina consistente de sono para melhorar sua energia!';
}
