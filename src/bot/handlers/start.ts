import { sendMessage, editMessage, buildKeyboard, deleteMessage } from '../../utils/telegram.js';
import { setLastMessageId, getLastMessageId } from '../../db/users.js';
import { getSleepStats, getWaterStats } from '../../db/health.js';
import { formatDuration, formatTimeOnly } from '../../utils/format.js';

// Espaços Unicode para centralização/padding
const SPACE = ' ';
const THIN_SPACE = '\u2009';

// Centraliza texto com caracteres de espaço
function centerText(text: string, width: number = 32): string {
    const textLength = [...text].length;
    const padding = Math.max(0, Math.floor((width - textLength) / 2));
    return SPACE.repeat(padding) + text;
}

// Barras de progresso visuais PREMIUM
function getPremiumProgressBar(percent: number, length: number = 16): string {
    const filled = Math.round((percent / 100) * length);
    const empty = length - filled;
    const filledBar = '█'.repeat(Math.min(filled, length));
    const emptyBar = '░'.repeat(Math.max(empty, 0));
    return filledBar + emptyBar;
}

// Emoji de status baseado na porcentagem
function getStatusEmoji(percent: number): string {
    if (percent >= 100) return '✅';
    if (percent >= 75) return '🔥';
    if (percent >= 50) return '💪';
    if (percent >= 25) return '⚡';
    return '💧';
}

// Saudação baseada no horário
function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
}

// Linha separadora centralizada
function getSeparator(): string {
    return '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
}

// Build the Hub Central Premium card
export async function handleStart(chatId: number, userId: number): Promise<void> {
    // Delete previous message if exists
    const lastMsgId = await getLastMessageId(userId);
    if (lastMsgId) {
        await deleteMessage(chatId, lastMsgId);
    }

    // Get current stats for display
    const sleepStats = await getSleepStats(userId);
    const waterStats = await getWaterStats(userId);

    const greeting = getGreeting();
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    });

    // Build premium dashboard with centralized title
    let text = `
${centerText('🧠 ASSESSOR ELITE')}

${getSeparator()}

<b>${greeting}, Leonel!</b>
🗓 <i>${dateStr}</i>

${centerText(getSeparator())}
${centerText('⚡ DASHBOARD DO DIA')}
${centerText(getSeparator())}

`;

    // Sleep status (alinhado à esquerda)
    if (sleepStats?.lastWake) {
        const wakeTime = formatTimeOnly(sleepStats.lastWake);
        text += `☀️ Acordou às <b>${wakeTime}</b>\n`;
    }

    if (sleepStats?.todaySleepHours) {
        const duration = formatDuration(Math.round(sleepStats.todaySleepHours * 60));
        text += `😴 Dormiu <b>${duration}</b>\n`;
    }

    // Water status with PREMIUM visual progress
    if (waterStats) {
        const percent = waterStats.percentComplete;
        const bar = getPremiumProgressBar(percent);
        const emoji = getStatusEmoji(percent);

        text += `\n💧 <b>Hidratação</b>\n`;
        text += `<code>${bar}</code>\n`;
        text += `<b>${waterStats.todayMl}ml</b> de ${waterStats.goalMl}ml ${emoji} <i>(${percent}%)</i>\n`;

        if (waterStats.remaining > 0) {
            text += `<i>🎯 Faltam ${waterStats.remaining}ml para a meta</i>\n`;
        } else {
            text += `<i>✨ Meta atingida! Excelente!</i>\n`;
        }
    }

    text += `
${getSeparator()}
`;

    // Build keyboard with premium hierarchical layout
    const keyboard = buildKeyboard([
        // Section: Quick Status Actions (centered)
        [
            { text: '☀️ Acordar', callback_data: 'good_morning' },
            { text: '🌙 Dormir', callback_data: 'good_night' },
        ],
        // Section: Quick Water (centered)
        [
            { text: '💧 +250ml', callback_data: 'water_250' },
            { text: '💧 +500ml', callback_data: 'water_500' },
            { text: '💧 +1L', callback_data: 'water_1000' },
        ],
        // Section: Create Event (centered)
        [
            { text: '📅 Criar Evento', callback_data: 'create_event' },
        ],
        // Section separator - MÓDULOS
        [
            { text: '── 📂 MÓDULOS ──', callback_data: 'show_modules' },
        ],
    ]);

    const msg = await sendMessage(chatId, text, { replyMarkup: keyboard });

    if (msg) {
        await setLastMessageId(userId, msg.message_id);
    }
}

// Show Hub (for back navigation) - edit existing message
export async function showHub(chatId: number, messageId: number, userId: number): Promise<void> {
    // Get current stats
    const sleepStats = await getSleepStats(userId);
    const waterStats = await getWaterStats(userId);

    const greeting = getGreeting();
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    });

    let text = `
${centerText('🧠 ASSESSOR ELITE')}

${getSeparator()}

<b>${greeting}, Leonel!</b>
🗓 <i>${dateStr}</i>

${centerText(getSeparator())}
${centerText('⚡ DASHBOARD DO DIA')}
${centerText(getSeparator())}

`;

    if (sleepStats?.lastWake) {
        const wakeTime = formatTimeOnly(sleepStats.lastWake);
        text += `☀️ Acordou às <b>${wakeTime}</b>\n`;
    }

    if (sleepStats?.todaySleepHours) {
        const duration = formatDuration(Math.round(sleepStats.todaySleepHours * 60));
        text += `😴 Dormiu <b>${duration}</b>\n`;
    }

    if (waterStats) {
        const percent = waterStats.percentComplete;
        const bar = getPremiumProgressBar(percent);
        const emoji = getStatusEmoji(percent);

        text += `\n💧 <b>Hidratação</b>\n`;
        text += `<code>${bar}</code>\n`;
        text += `<b>${waterStats.todayMl}ml</b> de ${waterStats.goalMl}ml ${emoji} <i>(${percent}%)</i>\n`;

        if (waterStats.remaining > 0) {
            text += `<i>🎯 Faltam ${waterStats.remaining}ml para a meta</i>\n`;
        } else {
            text += `<i>✨ Meta atingida! Excelente!</i>\n`;
        }
    }

    text += `
${getSeparator()}
`;

    const keyboard = buildKeyboard([
        [
            { text: '☀️ Acordar', callback_data: 'good_morning' },
            { text: '🌙 Dormir', callback_data: 'good_night' },
        ],
        [
            { text: '💧 +250ml', callback_data: 'water_250' },
            { text: '💧 +500ml', callback_data: 'water_500' },
            { text: '💧 +1L', callback_data: 'water_1000' },
        ],
        [
            { text: '📅 Criar Evento', callback_data: 'create_event' },
        ],
        [
            { text: '── 📂 MÓDULOS ──', callback_data: 'show_modules' },
        ],
    ]);

    await editMessage(chatId, messageId, text, { replyMarkup: keyboard });
}

// Show modules view (hide other buttons, show only module buttons below hub)
export async function showModules(chatId: number, messageId: number, userId: number): Promise<void> {
    // Get current stats to keep dashboard visible
    const sleepStats = await getSleepStats(userId);
    const waterStats = await getWaterStats(userId);

    const greeting = getGreeting();
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    });

    let text = `
${centerText('🧠 ASSESSOR ELITE')}

${getSeparator()}

<b>${greeting}, Leonel!</b>
🗓 <i>${dateStr}</i>

${centerText(getSeparator())}
${centerText('⚡ DASHBOARD DO DIA')}
${centerText(getSeparator())}

`;

    if (sleepStats?.lastWake) {
        const wakeTime = formatTimeOnly(sleepStats.lastWake);
        text += `☀️ Acordou às <b>${wakeTime}</b>\n`;
    }

    if (sleepStats?.todaySleepHours) {
        const duration = formatDuration(Math.round(sleepStats.todaySleepHours * 60));
        text += `😴 Dormiu <b>${duration}</b>\n`;
    }

    if (waterStats) {
        const percent = waterStats.percentComplete;
        const bar = getPremiumProgressBar(percent);
        const emoji = getStatusEmoji(percent);

        text += `\n💧 <b>Hidratação</b>\n`;
        text += `<code>${bar}</code>\n`;
        text += `<b>${waterStats.todayMl}ml</b> de ${waterStats.goalMl}ml ${emoji} <i>(${percent}%)</i>\n`;

        if (waterStats.remaining > 0) {
            text += `<i>🎯 Faltam ${waterStats.remaining}ml para a meta</i>\n`;
        } else {
            text += `<i>✨ Meta atingida! Excelente!</i>\n`;
        }
    }

    text += `
${getSeparator()}

${centerText('📂 MÓDULOS DISPONÍVEIS')}

`;

    // Only show module buttons
    const keyboard = buildKeyboard([
        [
            { text: '💪 Saúde', callback_data: 'health' },
        ],
        [
            { text: '📚 Estudos', callback_data: 'studies' },
            { text: '💰 Finanças', callback_data: 'finances' },
        ],
        [
            { text: '↩️ Voltar ao Hub', callback_data: 'hub' },
        ],
    ]);

    await editMessage(chatId, messageId, text, { replyMarkup: keyboard });
}
