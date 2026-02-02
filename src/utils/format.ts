import { config } from '../config/env.js';

// Parse date string to Date object
// Accepts: dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy
export function parseDate(input: string): Date | null {
    const match = input.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (!match) return null;

    const [, day, month, year] = match;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));

    // Validate the date is real
    if (
        date.getDate() !== parseInt(day) ||
        date.getMonth() !== parseInt(month) - 1 ||
        date.getFullYear() !== parseInt(year)
    ) {
        return null;
    }

    return date;
}

// Format Date to dd/mm/yyyy
export function formatDate(date: Date): string {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

// Parse time string to { hours, minutes }
// Accepts: HH:MM, H:MM, HHh, HHhMM
export function parseTime(input: string): { hours: number; minutes: number } | null {
    // Format HH:MM or H:MM
    let match = input.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
        const hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
            return { hours, minutes };
        }
        return null;
    }

    // Format HHh or HHhMM
    match = input.match(/^(\d{1,2})h(\d{2})?$/i);
    if (match) {
        const hours = parseInt(match[1]);
        const minutes = match[2] ? parseInt(match[2]) : 0;
        if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
            return { hours, minutes };
        }
        return null;
    }

    return null;
}

// Format time to HH:MM
export function formatTime(hours: number, minutes: number): string {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

// Format duration in minutes to "Xh Xmin"
export function formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours === 0) {
        return `${mins}min`;
    }
    if (mins === 0) {
        return `${hours}h`;
    }
    return `${hours}h ${mins}min`;
}

// Calculate duration between two times in minutes
export function calculateDuration(
    start: { hours: number; minutes: number },
    end: { hours: number; minutes: number }
): number {
    const startMinutes = start.hours * 60 + start.minutes;
    let endMinutes = end.hours * 60 + end.minutes;

    // Handle overnight (e.g., 23:00 to 07:00)
    if (endMinutes < startMinutes) {
        endMinutes += 24 * 60;
    }

    return endMinutes - startMinutes;
}

// Get today's date at midnight in the configured timezone
export function getTodayStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// Get start of the week (Monday)
export function getWeekStart(): Date {
    const today = getTodayStart();
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday is 1, Sunday is 0
    return new Date(today.getTime() + diff * 24 * 60 * 60 * 1000);
}

// Get day name in Portuguese
export function getDayName(date: Date): string {
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return days[date.getDay()];
}

// Format ISO date for Google Calendar
export function toISODate(date: Date): string {
    return date.toISOString().split('T')[0];
}

// Format ISO datetime for Google Calendar
export function toISODateTime(date: Date, time: { hours: number; minutes: number }): string {
    const d = new Date(date);
    d.setHours(time.hours, time.minutes, 0, 0);
    return d.toISOString();
}
