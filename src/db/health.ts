import { query, queryOne } from './connection.js';
import { config } from '../config/env.js';

// ==================== SLEEP TRACKING ====================

export interface SleepStats {
    lastSleep?: Date;
    lastWake?: Date;
    avgHours?: number;
    todaySleepHours?: number;
    lastBadSleepDate?: Date;
    lastBadSleepReason?: string;
}

// Log wake or sleep time
export async function logSleep(userId: number, type: 'wake' | 'sleep'): Promise<void> {
    await query(
        `INSERT INTO sleep_logs (user_id, log_type, logged_at)
     VALUES ($1, $2, NOW())`,
        [userId, type]
    );
}

// Get sleep statistics
export async function getSleepStats(userId: number): Promise<SleepStats | null> {
    // Get last sleep and wake
    const lastSleep = await queryOne<{ logged_at: Date }>(
        `SELECT logged_at FROM sleep_logs 
     WHERE user_id = $1 AND log_type = 'sleep' 
     ORDER BY logged_at DESC LIMIT 1`,
        [userId]
    );

    const lastWake = await queryOne<{ logged_at: Date }>(
        `SELECT logged_at FROM sleep_logs 
     WHERE user_id = $1 AND log_type = 'wake' 
     ORDER BY logged_at DESC LIMIT 1`,
        [userId]
    );

    // Calculate average sleep hours over last 7 days
    const avgResult = await queryOne<{ avg_hours: number }>(
        `WITH sleep_periods AS (
       SELECT 
         s.logged_at as sleep_time,
         (SELECT MIN(w.logged_at) 
          FROM sleep_logs w 
          WHERE w.user_id = s.user_id 
            AND w.log_type = 'wake' 
            AND w.logged_at > s.logged_at) as wake_time
       FROM sleep_logs s
       WHERE s.user_id = $1 
         AND s.log_type = 'sleep'
         AND s.logged_at > NOW() - INTERVAL '7 days'
     )
     SELECT AVG(EXTRACT(EPOCH FROM (wake_time - sleep_time)) / 3600) as avg_hours
     FROM sleep_periods
     WHERE wake_time IS NOT NULL`,
        [userId]
    );

    // Calcular duração do sono: diferença entre último sleep e último wake
    // Só se o wake for DEPOIS do sleep
    let todaySleepHours: number | undefined;
    if (lastSleep?.logged_at && lastWake?.logged_at) {
        const sleepTime = new Date(lastSleep.logged_at).getTime();
        const wakeTime = new Date(lastWake.logged_at).getTime();

        // Só calcula se acordou DEPOIS de dormir
        if (wakeTime > sleepTime) {
            todaySleepHours = (wakeTime - sleepTime) / (1000 * 60 * 60);
        }
    }

    return {
        lastSleep: lastSleep?.logged_at,
        lastWake: lastWake?.logged_at,
        avgHours: avgResult?.avg_hours || undefined,
        todaySleepHours,
    };
}

// Get weekly sleep data
export async function getWeeklySleepData(userId: number): Promise<Array<{
    date: Date;
    sleepTime?: Date;
    wakeTime?: Date;
    hours?: number;
}>> {
    const result = await query<{
        sleep_date: Date;
        sleep_time: Date | null;
        wake_time: Date | null;
    }>(
        `WITH dates AS (
       SELECT generate_series(
         DATE(NOW()) - INTERVAL '6 days',
         DATE(NOW()),
         '1 day'::interval
       )::date as d
     ),
     sleep_data AS (
       SELECT 
         DATE(logged_at) as log_date,
         log_type,
         logged_at,
         ROW_NUMBER() OVER (PARTITION BY DATE(logged_at), log_type ORDER BY logged_at DESC) as rn
       FROM sleep_logs
       WHERE user_id = $1
         AND logged_at > NOW() - INTERVAL '7 days'
     )
     SELECT 
       dates.d as sleep_date,
       (SELECT logged_at FROM sleep_data WHERE log_date = dates.d - 1 AND log_type = 'sleep' AND rn = 1) as sleep_time,
       (SELECT logged_at FROM sleep_data WHERE log_date = dates.d AND log_type = 'wake' AND rn = 1) as wake_time
     FROM dates
     ORDER BY dates.d`,
        [userId]
    );

    return result.rows.map(row => ({
        date: row.sleep_date,
        sleepTime: row.sleep_time || undefined,
        wakeTime: row.wake_time || undefined,
        hours: row.sleep_time && row.wake_time
            ? (new Date(row.wake_time).getTime() - new Date(row.sleep_time).getTime()) / (1000 * 60 * 60)
            : undefined,
    }));
}

// ==================== WATER TRACKING ====================

export interface WaterStats {
    todayMl: number;
    goalMl: number;
    remaining: number;
    percentComplete: number;
}

// Log water consumption
export async function logWater(userId: number, amountMl: number): Promise<void> {
    await query(
        `INSERT INTO water_logs (user_id, amount_ml, logged_at)
     VALUES ($1, $2, NOW())`,
        [userId, amountMl]
    );
}

// Get water statistics for today
export async function getWaterStats(userId: number): Promise<WaterStats | null> {
    const settings = await queryOne<{ water_goal_ml: number }>(
        'SELECT water_goal_ml FROM user_settings WHERE user_id = $1',
        [userId]
    );

    const goalMl = settings?.water_goal_ml || config.waterGoalMl;

    const todayResult = await queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(amount_ml), 0) as total
     FROM water_logs
     WHERE user_id = $1
       AND DATE(logged_at) = DATE(NOW())`,
        [userId]
    );

    const todayMl = todayResult?.total || 0;

    return {
        todayMl,
        goalMl,
        remaining: Math.max(0, goalMl - todayMl),
        percentComplete: Math.round((todayMl / goalMl) * 100),
    };
}

// Compatibilidade com API
export async function getDailyWater(userId: number, date: Date): Promise<{ amount: number }> {
    const stats = await getWaterStats(userId);
    return { amount: stats?.todayMl || 0 };
}

// Get weekly water data
export async function getWeeklyWaterData(userId: number): Promise<Array<{
    date: Date;
    totalMl: number;
    goalMl: number;
    metGoal: boolean;
}>> {
    const settings = await queryOne<{ water_goal_ml: number }>(
        'SELECT water_goal_ml FROM user_settings WHERE user_id = $1',
        [userId]
    );

    const goalMl = settings?.water_goal_ml || config.waterGoalMl;

    const result = await query<{ log_date: Date; total: number }>(
        `WITH dates AS (
       SELECT generate_series(
         DATE(NOW()) - INTERVAL '6 days',
         DATE(NOW()),
         '1 day'::interval
       )::date as d
     )
     SELECT 
       dates.d as log_date,
       COALESCE(SUM(w.amount_ml), 0) as total
     FROM dates
     LEFT JOIN water_logs w ON DATE(w.logged_at) = dates.d AND w.user_id = $1
     GROUP BY dates.d
     ORDER BY dates.d`,
        [userId]
    );

    return result.rows.map(row => ({
        date: row.log_date,
        totalMl: row.total,
        goalMl,
        metGoal: row.total >= goalMl,
    }));
}

// ==================== RESET DATA ====================

// Reset all data for today (Brasília timezone)
export async function resetTodayData(userId: number): Promise<{ waterDeleted: number; sleepDeleted: number }> {
    // Delete water logs from today
    const waterResult = await query(
        `DELETE FROM water_logs 
         WHERE user_id = $1 
         AND DATE(logged_at AT TIME ZONE 'America/Sao_Paulo') = DATE(NOW() AT TIME ZONE 'America/Sao_Paulo')
         RETURNING id`,
        [userId]
    );

    // Delete sleep logs from today
    const sleepResult = await query(
        `DELETE FROM sleep_logs 
         WHERE user_id = $1 
         AND DATE(logged_at AT TIME ZONE 'America/Sao_Paulo') = DATE(NOW() AT TIME ZONE 'America/Sao_Paulo')
         RETURNING id`,
        [userId]
    );

    return {
        waterDeleted: waterResult.rowCount || 0,
        sleepDeleted: sleepResult.rowCount || 0,
    };
}

// Update water goal in database
export async function updateWaterGoal(userId: number, goalMl: number): Promise<void> {
    await query(
        `INSERT INTO user_settings (user_id, water_goal_ml)
         VALUES ($1, $2)
         ON CONFLICT (user_id) 
         DO UPDATE SET water_goal_ml = $2`,
        [userId, goalMl]
    );
}
