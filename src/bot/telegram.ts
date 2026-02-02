import { config } from '../config/env.js';
import {
    TelegramUpdate,
    TelegramMessage,
    TelegramCallbackQuery,
    sendMessage,
    editMessage,
    answerCallback,
    isAllowedUser,
} from '../utils/telegram.js';
import { ensureUser, getBotState, clearBotState } from '../db/users.js';
import { handleStart } from './handlers/start.js';
import { handleCallback } from './handlers/callback.js';
import { handleTextMessage } from './handlers/text.js';

const TELEGRAM_API = `https://api.telegram.org/bot${config.telegramBotToken}`;

// Initialize bot and set webhook
export async function initBot(): Promise<void> {
    // Set webhook
    try {
        const webhookUrl = config.nodeEnv === 'production'
            ? 'https://assistant.lpanel.cloud/telegram/webhook'
            : `http://localhost:${config.port}/telegram/webhook`;

        if (config.nodeEnv === 'production') {
            const response = await fetch(`${TELEGRAM_API}/setWebhook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: webhookUrl,
                    drop_pending_updates: true,
                }),
            });
            const data = await response.json();
            console.log('🔗 Webhook set:', data.ok ? 'success' : data.description);
        }
    } catch (error) {
        console.error('❌ Error setting webhook:', error);
    }
}

// Handle incoming update
export async function handleUpdate(update: TelegramUpdate): Promise<void> {
    try {
        // Handle callback queries (button clicks)
        if (update.callback_query) {
            await processCallback(update.callback_query);
            return;
        }

        // Handle messages
        if (update.message) {
            await processMessage(update.message);
            return;
        }
    } catch (error) {
        console.error('❌ Error handling update:', error);
    }
}

// Process message
async function processMessage(message: TelegramMessage): Promise<void> {
    const userId = message.from?.id;
    if (!userId) return;

    // Check allowlist
    if (!isAllowedUser(userId)) {
        console.log(`⚠️ Unauthorized user: ${userId}`);
        await sendMessage(message.chat.id, '🚫 Acesso não autorizado.');
        return;
    }

    // Ensure user exists in DB
    await ensureUser(userId, message.from?.username, message.from?.first_name);

    const text = message.text?.trim() || '';

    // Handle commands
    if (text.startsWith('/')) {
        const command = text.split(' ')[0].toLowerCase();

        switch (command) {
            case '/start':
                await handleStart(message.chat.id, userId);
                return;
            default:
                await sendMessage(message.chat.id, '❓ Comando não reconhecido. Use /start para voltar ao Hub.');
                return;
        }
    }

    // Handle text responses (for ForceReply flows)
    await handleTextMessage(message);
}

// Process callback query
async function processCallback(callback: TelegramCallbackQuery): Promise<void> {
    const userId = callback.from.id;
    const chatId = callback.message?.chat.id;
    const messageId = callback.message?.message_id;

    if (!chatId || !messageId) {
        await answerCallback(callback.id);
        return;
    }

    // Check allowlist
    if (!isAllowedUser(userId)) {
        await answerCallback(callback.id, '🚫 Acesso não autorizado', true);
        return;
    }

    // Ensure user exists
    await ensureUser(userId, callback.from.username, callback.from.first_name);

    // Answer callback immediately to remove loading state
    await answerCallback(callback.id);

    // Route to callback handler
    await handleCallback(chatId, messageId, userId, callback.data || '');
}
