import { google } from 'googleapis';
import { config } from '../config/env.js';
import { query, queryOne } from '../db/connection.js';

const oauth2Client = new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret,
    config.googleRedirectUri
);

// Scopes needed for Calendar access
const SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
];

// Generate authorization URL
export function getAuthUrl(userId: number): string {
    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        state: userId.toString(),
        prompt: 'consent',
    });
}

// Handle OAuth callback
export async function handleOAuthCallback(userId: number, code: string): Promise<void> {
    const { tokens } = await oauth2Client.getToken(code);

    await query(
        `INSERT INTO oauth_tokens (user_id, access_token, refresh_token, token_type, expires_at, scope)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = COALESCE(EXCLUDED.refresh_token, oauth_tokens.refresh_token),
       token_type = EXCLUDED.token_type,
       expires_at = EXCLUDED.expires_at,
       scope = EXCLUDED.scope,
       updated_at = NOW()`,
        [
            userId,
            tokens.access_token,
            tokens.refresh_token,
            tokens.token_type || 'Bearer',
            tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            tokens.scope,
        ]
    );

    console.log(`✅ OAuth tokens saved for user ${userId}`);
}

// Get authenticated client for a user
export async function getAuthClient(userId: number): Promise<typeof oauth2Client | null> {
    const row = await queryOne<{
        access_token: string;
        refresh_token: string | null;
        expires_at: Date | null;
    }>(
        'SELECT access_token, refresh_token, expires_at FROM oauth_tokens WHERE user_id = $1',
        [userId]
    );

    if (!row) return null;

    const client = new google.auth.OAuth2(
        config.googleClientId,
        config.googleClientSecret,
        config.googleRedirectUri
    );

    client.setCredentials({
        access_token: row.access_token,
        refresh_token: row.refresh_token,
        expiry_date: row.expires_at?.getTime(),
    });

    // Handle token refresh
    client.on('tokens', async (tokens) => {
        if (tokens.access_token) {
            await query(
                `UPDATE oauth_tokens SET
           access_token = $1,
           expires_at = $2,
           updated_at = NOW()
         WHERE user_id = $3`,
                [
                    tokens.access_token,
                    tokens.expiry_date ? new Date(tokens.expiry_date) : null,
                    userId,
                ]
            );
        }
    });

    return client;
}

// Check if user is authenticated with Google
export async function isGoogleAuthenticated(userId: number): Promise<boolean> {
    const row = await queryOne(
        'SELECT 1 FROM oauth_tokens WHERE user_id = $1',
        [userId]
    );
    return !!row;
}
