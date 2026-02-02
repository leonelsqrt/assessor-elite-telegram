import { query, queryOne } from './connection.js';

// Ensure user exists in database
export async function ensureUser(
    userId: number,
    username?: string,
    firstName?: string
): Promise<void> {
    await query(
        `INSERT INTO users (user_id, username, first_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET
       username = COALESCE(EXCLUDED.username, users.username),
       first_name = COALESCE(EXCLUDED.first_name, users.first_name)`,
        [userId, username, firstName]
    );

    // Also ensure user_settings exists
    await query(
        `INSERT INTO user_settings (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
        [userId]
    );
}

// Bot state management
export interface BotState {
    currentState: string | null;
    stateData: Record<string, any>;
    lastMessageId: number | null;
}

export async function getBotState(userId: number): Promise<BotState> {
    const row = await queryOne<{
        current_state: string | null;
        state_data: Record<string, any>;
        last_message_id: number | null;
    }>(
        'SELECT current_state, state_data, last_message_id FROM bot_state WHERE user_id = $1',
        [userId]
    );

    if (!row) {
        return { currentState: null, stateData: {}, lastMessageId: null };
    }

    return {
        currentState: row.current_state,
        stateData: row.state_data || {},
        lastMessageId: row.last_message_id,
    };
}

export async function setBotState(
    userId: number,
    state: string | null,
    data: Record<string, any> = {},
    messageId?: number
): Promise<void> {
    await query(
        `INSERT INTO bot_state (user_id, current_state, state_data, last_message_id, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       current_state = EXCLUDED.current_state,
       state_data = EXCLUDED.state_data,
       last_message_id = COALESCE(EXCLUDED.last_message_id, bot_state.last_message_id),
       updated_at = NOW()`,
        [userId, state, JSON.stringify(data), messageId]
    );
}

export async function updateBotStateData(
    userId: number,
    updates: Record<string, any>
): Promise<void> {
    const current = await getBotState(userId);
    const newData = { ...current.stateData, ...updates };

    await query(
        `UPDATE bot_state SET state_data = $1, updated_at = NOW() WHERE user_id = $2`,
        [JSON.stringify(newData), userId]
    );
}

export async function clearBotState(userId: number): Promise<void> {
    await query(
        'DELETE FROM bot_state WHERE user_id = $1',
        [userId]
    );
}

export async function setLastMessageId(userId: number, messageId: number): Promise<void> {
    await query(
        `INSERT INTO bot_state (user_id, last_message_id, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       last_message_id = EXCLUDED.last_message_id,
       updated_at = NOW()`,
        [userId, messageId]
    );
}

export async function getLastMessageId(userId: number): Promise<number | null> {
    const state = await getBotState(userId);
    return state.lastMessageId;
}
