import { editMessage, buildKeyboard } from '../../utils/telegram.js';
import { logSleep, getSleepStats } from '../../db/health.js';
import { formatDuration } from '../../utils/format.js';

// Handle "Bom Dia" button
export async function handleGoodMorning(
    chatId: number,
    messageId: number,
    userId: number
): Promise<void> {
    // Log wake time
    await logSleep(userId, 'wake');

    // Calculate sleep duration if we have last night's sleep time
    const stats = await getSleepStats(userId);

    const now = new Date();
    const hours = now.getHours();

    // Greeting based on time
    let greeting = '☀️ Bom dia';
    if (hours >= 12 && hours < 18) {
        greeting = '🌤️ Boa tarde';
    } else if (hours >= 18) {
        greeting = '🌆 Boa noite';
    }

    let text = `
<b>${greeting}, Leonel!</b>
─────────────────────────

⏰ <b>Acordou às:</b> ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}

`;

    // Show sleep duration if available
    if (stats?.lastSleep) {
        const sleepTime = new Date(stats.lastSleep);
        const durationMs = now.getTime() - sleepTime.getTime();
        const durationMinutes = Math.round(durationMs / (1000 * 60));

        text += `😴 <b>Dormiu:</b> ${formatDuration(durationMinutes)}\n\n`;

        if (durationMinutes < 360) { // Less than 6h
            text += `<i>⚠️ Poucas horas de sono. Tente descansar mais hoje!</i>`;
        } else if (durationMinutes >= 420 && durationMinutes <= 540) { // 7-9h
            text += `<i>✅ Ótimo! Noite de sono ideal!</i>`;
        } else if (durationMinutes > 540) { // More than 9h
            text += `<i>💤 Bastante sono! Hora de aproveitar o dia!</i>`;
        } else {
            text += `<i>😊 Bom descanso! Vamos ter um dia produtivo!</i>`;
        }
    } else {
        text += `<i>💡 Seu dia começou! O que vamos fazer hoje?</i>`;
    }

    text += `
─────────────────────────`;

    const keyboard = buildKeyboard([
        [{ text: '📅 Criar Evento', callback_data: 'create_event' }],
        [{ text: '💪 Ver Saúde', callback_data: 'health' }],
        [{ text: '↩️ Voltar ao Hub', callback_data: 'hub' }],
    ]);

    await editMessage(chatId, messageId, text, { replyMarkup: keyboard });
}

// Handle "Boa Noite" button
export async function handleGoodNight(
    chatId: number,
    messageId: number,
    userId: number
): Promise<void> {
    // Log sleep time
    await logSleep(userId, 'sleep');

    const now = new Date();
    const stats = await getSleepStats(userId);

    // Calculate time awake if we have wake time
    let awakeTime = '';
    if (stats?.lastWake) {
        const wakeTime = new Date(stats.lastWake);
        // Only calculate if wake was today
        if (wakeTime.toDateString() === now.toDateString()) {
            const durationMs = now.getTime() - wakeTime.getTime();
            const durationMinutes = Math.round(durationMs / (1000 * 60));
            awakeTime = formatDuration(durationMinutes);
        }
    }

    let text = `
<b>🌙 Boa noite, Leonel!</b>
─────────────────────────

⏰ <b>Dormindo às:</b> ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}

`;

    if (awakeTime) {
        text += `☀️ <b>Dia ativo:</b> ${awakeTime}\n\n`;
    }

    // Check time and give feedback
    const hour = now.getHours();
    if (hour < 22) {
        text += `<i>👏 Ótimo! Dormir cedo é um excelente hábito!</i>`;
    } else if (hour >= 22 && hour < 24) {
        text += `<i>😊 Hora boa para descansar. Bons sonhos!</i>`;
    } else {
        text += `<i>😴 Já é tarde! Descanse bem e recupere as energias.</i>`;
    }

    text += `

💤 <i>Registrado! Até amanhã!</i>

─────────────────────────`;

    const keyboard = buildKeyboard([
        [{ text: '↩️ Voltar ao Hub', callback_data: 'hub' }],
    ]);

    await editMessage(chatId, messageId, text, { replyMarkup: keyboard });
}
