import { query, queryOne } from './connection.js';

export interface EventDraft {
    id: number;
    user_id: number;
    state: 'collecting' | 'ready' | 'created' | 'editing';
    title?: string;
    event_date?: Date;
    start_time?: string;
    end_time?: string;
    location?: string;
    all_day: boolean;
    google_event_id?: string;
    message_id?: number;
    src_message_id?: number;
}

// Create new event draft
export async function createEventDraft(
    userId: number,
    messageId?: number,
    srcMessageId?: number
): Promise<EventDraft> {
    // Cancel any existing drafts first
    await query(
        `UPDATE event_drafts SET state = 'ready' 
     WHERE user_id = $1 AND state IN ('collecting', 'editing')`,
        [userId]
    );

    const result = await queryOne<EventDraft>(
        `INSERT INTO event_drafts (user_id, state, message_id, src_message_id)
     VALUES ($1, 'collecting', $2, $3)
     RETURNING *`,
        [userId, messageId, srcMessageId]
    );

    return result!;
}

// Get active event draft
export async function getActiveEventDraft(userId: number): Promise<EventDraft | null> {
    return queryOne<EventDraft>(
        `SELECT * FROM event_drafts 
     WHERE user_id = $1 AND state IN ('collecting', 'ready', 'editing')
     ORDER BY created_at DESC LIMIT 1`,
        [userId]
    );
}

// Get event by ID
export async function getEventDraft(draftId: number): Promise<EventDraft | null> {
    return queryOne<EventDraft>(
        'SELECT * FROM event_drafts WHERE id = $1',
        [draftId]
    );
}

// Update event draft field
export async function updateEventDraft(
    draftId: number,
    updates: Partial<Pick<EventDraft, 'title' | 'event_date' | 'start_time' | 'end_time' | 'location' | 'all_day' | 'state' | 'google_event_id' | 'message_id'>>
): Promise<EventDraft | null> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
        setClauses.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
    }

    values.push(draftId);

    const result = await queryOne<EventDraft>(
        `UPDATE event_drafts SET ${setClauses.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
        values
    );

    // Check if ready
    if (result) {
        const isReady = checkIfEventReady(result);
        if (isReady && result.state === 'collecting') {
            await query(
                'UPDATE event_drafts SET state = $1 WHERE id = $2',
                ['ready', draftId]
            );
            result.state = 'ready';
        }
    }

    return result;
}

// Check if event is ready to be created
function checkIfEventReady(draft: EventDraft): boolean {
    if (!draft.title || !draft.event_date || !draft.location) {
        return false;
    }

    if (draft.all_day) {
        return true;
    }

    return !!(draft.start_time && draft.end_time);
}

// Mark event as created
export async function markEventCreated(
    draftId: number,
    googleEventId: string
): Promise<void> {
    await query(
        `UPDATE event_drafts SET state = 'created', google_event_id = $1, updated_at = NOW()
     WHERE id = $2`,
        [googleEventId, draftId]
    );
}

// Start editing mode
export async function startEventEditing(draftId: number): Promise<void> {
    await query(
        `UPDATE event_drafts SET state = 'editing', updated_at = NOW()
     WHERE id = $1`,
        [draftId]
    );
}

// Finish editing mode
export async function finishEventEditing(draftId: number): Promise<void> {
    await query(
        `UPDATE event_drafts SET state = 'created', updated_at = NOW()
     WHERE id = $1`,
        [draftId]
    );
}

// Delete event draft
export async function deleteEventDraft(draftId: number): Promise<string | null> {
    const result = await queryOne<{ google_event_id: string | null }>(
        'DELETE FROM event_drafts WHERE id = $1 RETURNING google_event_id',
        [draftId]
    );
    return result?.google_event_id || null;
}

// Get draft by message ID
export async function getEventDraftByMessage(
    userId: number,
    messageId: number
): Promise<EventDraft | null> {
    return queryOne<EventDraft>(
        `SELECT * FROM event_drafts 
     WHERE user_id = $1 AND message_id = $2
     ORDER BY created_at DESC LIMIT 1`,
        [userId, messageId]
    );
}

// Get missing fields for draft
export function getMissingFields(draft: EventDraft): string[] {
    const missing: string[] = [];

    if (!draft.title) missing.push('title');
    if (!draft.event_date) missing.push('date');
    if (!draft.all_day) {
        if (!draft.start_time) missing.push('start');
        if (!draft.end_time) missing.push('end');
    }
    if (!draft.location) missing.push('location');

    return missing;
}
