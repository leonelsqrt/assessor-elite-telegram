import { config } from '../config/env.js';

const TELEGRAM_API = `https://api.telegram.org/bot${config.telegramBotToken}`;

// Types
export interface TelegramUser {
    id: number;
    is_bot: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
}

export interface TelegramMessage {
    message_id: number;
    from?: TelegramUser;
    chat: {
        id: number;
        type: string;
    };
    date: number;
    text?: string;
    reply_to_message?: TelegramMessage;
}

export interface TelegramCallbackQuery {
    id: string;
    from: TelegramUser;
    message?: TelegramMessage;
    data?: string;
}

export interface TelegramUpdate {
    update_id: number;
    message?: TelegramMessage;
    callback_query?: TelegramCallbackQuery;
}

export interface InlineKeyboardButton {
    text: string;
    callback_data?: string;
    url?: string;
}

export interface InlineKeyboardMarkup {
    inline_keyboard: InlineKeyboardButton[][];
}

export interface ForceReply {
    force_reply: true;
    input_field_placeholder?: string;
    selective?: boolean;
}

// API Methods
async function telegramRequest(method: string, body: Record<string, any>): Promise<any> {
    try {
        const response = await fetch(`${TELEGRAM_API}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await response.json();

        if (!data.ok) {
            // Ignore "message is not modified" error
            if (data.description?.includes('message is not modified')) {
                console.log('⚠️ Message not modified, ignoring');
                return data;
            }
            console.error(`❌ Telegram API error [${method}]:`, data);
        }

        return data;
    } catch (error) {
        console.error(`❌ Telegram request error [${method}]:`, error);
        throw error;
    }
}

// Send a message
export async function sendMessage(
    chatId: number,
    text: string,
    options: {
        replyMarkup?: InlineKeyboardMarkup | ForceReply;
        parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
        replyToMessageId?: number;
    } = {}
): Promise<TelegramMessage | null> {
    const result = await telegramRequest('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: options.parseMode || 'HTML',
        reply_markup: options.replyMarkup,
        reply_to_message_id: options.replyToMessageId,
    });
    return result.ok ? result.result : null;
}

// Edit a message
export async function editMessage(
    chatId: number,
    messageId: number,
    text: string,
    options: {
        replyMarkup?: InlineKeyboardMarkup;
        parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
    } = {}
): Promise<TelegramMessage | null> {
    const result = await telegramRequest('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: options.parseMode || 'HTML',
        reply_markup: options.replyMarkup,
    });
    return result.ok ? result.result : null;
}

// Delete a message (silently fails)
export async function deleteMessage(chatId: number, messageId: number): Promise<boolean> {
    try {
        const result = await telegramRequest('deleteMessage', {
            chat_id: chatId,
            message_id: messageId,
        });
        return result.ok;
    } catch {
        return false;
    }
}

// Answer callback query
export async function answerCallback(
    callbackId: string,
    text?: string,
    showAlert = false
): Promise<boolean> {
    const result = await telegramRequest('answerCallbackQuery', {
        callback_query_id: callbackId,
        text,
        show_alert: showAlert,
    });
    return result.ok;
}

// Send ForceReply to open keyboard
export async function sendForceReply(
    chatId: number,
    text: string,
    placeholder?: string
): Promise<TelegramMessage | null> {
    return sendMessage(chatId, text, {
        replyMarkup: {
            force_reply: true,
            input_field_placeholder: placeholder,
            selective: true,
        },
    });
}

// Build inline keyboard
export function buildKeyboard(buttons: (InlineKeyboardButton | null)[][]): InlineKeyboardMarkup {
    return {
        inline_keyboard: buttons.map(row => row.filter((btn): btn is InlineKeyboardButton => btn !== null)),
    };
}

// Check if user is allowed
export function isAllowedUser(userId: number): boolean {
    if (config.telegramAllowlist.length === 0) {
        return true; // No allowlist = allow all
    }
    return config.telegramAllowlist.includes(userId);
}
