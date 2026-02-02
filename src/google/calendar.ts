import { google, calendar_v3 } from 'googleapis';
import { config } from '../config/env.js';
import { getAuthClient } from './auth.js';
import { toISODate } from '../utils/format.js';

interface EventData {
    title: string;
    date: Date;
    startTime?: { hours: number; minutes: number };
    endTime?: { hours: number; minutes: number };
    location?: string;
    allDay?: boolean;
}

// Create a calendar event
export async function createEvent(userId: number, data: EventData): Promise<string | null> {
    const auth = await getAuthClient(userId);
    if (!auth) return null;

    const calendar = google.calendar({ version: 'v3', auth });

    let start: calendar_v3.Schema$EventDateTime;
    let end: calendar_v3.Schema$EventDateTime;

    if (data.allDay) {
        // All-day event
        start = { date: toISODate(data.date) };
        // For all-day events, end date is exclusive (next day)
        const endDate = new Date(data.date);
        endDate.setDate(endDate.getDate() + 1);
        end = { date: toISODate(endDate) };
    } else if (data.startTime && data.endTime) {
        // Timed event
        const startDateTime = new Date(data.date);
        startDateTime.setHours(data.startTime.hours, data.startTime.minutes, 0, 0);

        const endDateTime = new Date(data.date);
        endDateTime.setHours(data.endTime.hours, data.endTime.minutes, 0, 0);

        // Handle overnight events
        if (endDateTime <= startDateTime) {
            endDateTime.setDate(endDateTime.getDate() + 1);
        }

        start = { dateTime: startDateTime.toISOString(), timeZone: config.timezone };
        end = { dateTime: endDateTime.toISOString(), timeZone: config.timezone };
    } else {
        throw new Error('Event must be all-day or have start and end times');
    }

    const event: calendar_v3.Schema$Event = {
        summary: data.title,
        location: data.location,
        start,
        end,
    };

    try {
        const response = await calendar.events.insert({
            calendarId: config.googleCalendarId,
            requestBody: event,
        });

        console.log(`✅ Created event: ${response.data.id}`);
        return response.data.id || null;
    } catch (error) {
        console.error('❌ Error creating event:', error);
        throw error;
    }
}

// Update a calendar event
export async function updateEvent(
    userId: number,
    eventId: string,
    data: Partial<EventData>
): Promise<boolean> {
    const auth = await getAuthClient(userId);
    if (!auth) return false;

    const calendar = google.calendar({ version: 'v3', auth });

    const updateData: calendar_v3.Schema$Event = {};

    if (data.title) {
        updateData.summary = data.title;
    }

    if (data.location !== undefined) {
        updateData.location = data.location;
    }

    if (data.date || data.startTime || data.endTime || data.allDay !== undefined) {
        // Need to get current event to update times properly
        const current = await calendar.events.get({
            calendarId: config.googleCalendarId,
            eventId,
        });

        const eventDate = data.date || (current.data.start?.date
            ? new Date(current.data.start.date)
            : current.data.start?.dateTime
                ? new Date(current.data.start.dateTime)
                : new Date());

        if (data.allDay) {
            updateData.start = { date: toISODate(eventDate) };
            const endDate = new Date(eventDate);
            endDate.setDate(endDate.getDate() + 1);
            updateData.end = { date: toISODate(endDate) };
        } else if (data.startTime && data.endTime) {
            const startDateTime = new Date(eventDate);
            startDateTime.setHours(data.startTime.hours, data.startTime.minutes, 0, 0);

            const endDateTime = new Date(eventDate);
            endDateTime.setHours(data.endTime.hours, data.endTime.minutes, 0, 0);

            if (endDateTime <= startDateTime) {
                endDateTime.setDate(endDateTime.getDate() + 1);
            }

            updateData.start = { dateTime: startDateTime.toISOString(), timeZone: config.timezone };
            updateData.end = { dateTime: endDateTime.toISOString(), timeZone: config.timezone };
        }
    }

    try {
        await calendar.events.patch({
            calendarId: config.googleCalendarId,
            eventId,
            requestBody: updateData,
        });

        console.log(`✅ Updated event: ${eventId}`);
        return true;
    } catch (error) {
        console.error('❌ Error updating event:', error);
        return false;
    }
}

// Delete a calendar event
export async function deleteEvent(userId: number, eventId: string): Promise<boolean> {
    const auth = await getAuthClient(userId);
    if (!auth) return false;

    const calendar = google.calendar({ version: 'v3', auth });

    try {
        await calendar.events.delete({
            calendarId: config.googleCalendarId,
            eventId,
        });

        console.log(`✅ Deleted event: ${eventId}`);
        return true;
    } catch (error) {
        console.error('❌ Error deleting event:', error);
        return false;
    }
}

// Get event URL
export function getEventUrl(eventId: string): string {
    return `https://calendar.google.com/calendar/event?eid=${Buffer.from(eventId).toString('base64')}`;
}
