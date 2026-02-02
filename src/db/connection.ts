import pg from 'pg';
import { config } from '../config/env.js';

const { Pool } = pg;

export const pool = new Pool({
    connectionString: config.databaseUrl,
});

// Test connection
pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL');
});

pool.on('error', (err) => {
    console.error('❌ PostgreSQL error:', err);
});

// Query helper with logging
export async function query<T extends pg.QueryResultRow = any>(
    text: string,
    params?: any[]
): Promise<pg.QueryResult<T>> {
    const start = Date.now();
    try {
        const result = await pool.query<T>(text, params);
        const duration = Date.now() - start;
        if (config.nodeEnv === 'development') {
            console.log('📊 Query:', { text: text.substring(0, 50), duration: `${duration}ms`, rows: result.rowCount });
        }
        return result;
    } catch (error) {
        console.error('❌ Query error:', { text, error });
        throw error;
    }
}

// Get single row or null
export async function queryOne<T extends pg.QueryResultRow = any>(
    text: string,
    params?: any[]
): Promise<T | null> {
    const result = await query<T>(text, params);
    return result.rows[0] || null;
}

// Transaction helper
export async function transaction<T>(
    callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
