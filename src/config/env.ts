import dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value.trim();
}

function optionalEnv(key: string, defaultValue: string): string {
    return (process.env[key] || defaultValue).trim();
}

export const config = {
    // Server
    port: parseInt(optionalEnv('PORT', '3000'), 10),
    nodeEnv: optionalEnv('NODE_ENV', 'development'),

    // Telegram
    telegramBotToken: requireEnv('TELEGRAM_BOT_TOKEN'),
    telegramAllowlist: optionalEnv('TELEGRAM_ALLOWLIST', '')
        .split(',')
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => !isNaN(id)),

    // Database
    databaseUrl: requireEnv('DATABASE_URL'),

    // Google OAuth
    googleClientId: requireEnv('GOOGLE_CLIENT_ID'),
    googleClientSecret: requireEnv('GOOGLE_CLIENT_SECRET'),
    googleRedirectUri: requireEnv('GOOGLE_REDIRECT_URI'),
    googleCalendarId: optionalEnv('GOOGLE_CALENDAR_ID', 'primary'),

    // App Settings
    timezone: optionalEnv('TIMEZONE', 'America/Sao_Paulo'),
    waterGoalMl: parseInt(optionalEnv('WATER_GOAL_ML', '4000'), 10),
    idealSleepStart: optionalEnv('IDEAL_SLEEP_START', '23:00'),
    idealSleepEnd: optionalEnv('IDEAL_SLEEP_END', '07:00'),

    // Gemini AI
    geminiApiKey: requireEnv('GEMINI_API_KEY'),
    geminiModel: optionalEnv('GEMINI_MODEL', 'gemini-pro'),
} as const;

export type Config = typeof config;
