/**
 * Timezone Utilities - Berlin Time
 *
 * All timestamps in Aether should be Berlin time. This utility ensures
 * consistent timezone handling across the codebase.
 *
 * IMPORTANT: Never use raw toISOString() or toLocaleString() without timezone.
 * Always use these helpers instead.
 */

const TIMEZONE = 'Europe/Berlin';

/**
 * Get current time as ISO 8601 string with Berlin timezone offset.
 * Use this instead of `new Date().toISOString()` which returns UTC.
 *
 * @returns ISO string like "2025-01-12T09:45:00+01:00"
 */
export function nowBerlinISO(): string {
	return toBerlinISO(new Date());
}

/**
 * Convert a Date to ISO 8601 string with Berlin timezone offset.
 * Unlike toISOString() which always returns UTC (Z suffix),
 * this returns the time in Berlin with proper offset (+01:00 or +02:00).
 *
 * @param date - Date to convert
 * @returns ISO string like "2025-01-12T09:45:00+01:00"
 */
export function toBerlinISO(date: Date): string {
	// Format in Berlin timezone
	const formatter = new Intl.DateTimeFormat('sv-SE', {
		timeZone: TIMEZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false
	});

	const parts = formatter.formatToParts(date);
	const get = (type: string) => parts.find((p) => p.type === type)?.value || '';

	const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
	const timeStr = `${get('hour')}:${get('minute')}:${get('second')}`;

	// Get Berlin timezone offset
	const offset = getBerlinOffset(date);

	return `${dateStr}T${timeStr}${offset}`;
}

/**
 * Get Berlin timezone offset string for a given date.
 * Returns "+01:00" (winter) or "+02:00" (summer/DST).
 */
export function getBerlinOffset(date: Date): string {
	// Create a date string in Berlin timezone and parse the offset
	const berlinStr = date.toLocaleString('en-US', {
		timeZone: TIMEZONE,
		timeZoneName: 'longOffset'
	});

	// Extract offset from string like "1/12/2025, 9:45:00 AM GMT+01:00"
	const match = berlinStr.match(/GMT([+-]\d{2}):?(\d{2})/);
	if (match) {
		return `${match[1]}:${match[2]}`;
	}

	// Fallback: calculate offset manually
	const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
	const berlinDate = new Date(date.toLocaleString('en-US', { timeZone: TIMEZONE }));
	const diffMinutes = (berlinDate.getTime() - utcDate.getTime()) / 60000;
	const hours = Math.floor(Math.abs(diffMinutes) / 60);
	const mins = Math.abs(diffMinutes) % 60;
	const sign = diffMinutes >= 0 ? '+' : '-';
	return `${sign}${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Get the hour of day in Berlin timezone (0-23).
 * Use this instead of `date.getHours()` which uses server timezone.
 */
export function getBerlinHour(date: Date): number {
	const hour = date.toLocaleString('en-US', {
		timeZone: TIMEZONE,
		hour: 'numeric',
		hour12: false
	});
	return parseInt(hour, 10);
}

/**
 * Format a date as human-readable string in Berlin timezone.
 * Use this instead of `date.toLocaleString()` without timezone.
 */
export function toBerlinLocale(
	date: Date,
	options: Intl.DateTimeFormatOptions = {}
): string {
	return date.toLocaleString('en-US', {
		timeZone: TIMEZONE,
		...options
	});
}

/**
 * Format a date as date-only string in Berlin timezone.
 * Use this instead of `date.toLocaleDateString()` without timezone.
 */
export function toBerlinDateLocale(
	date: Date,
	options: Intl.DateTimeFormatOptions = {}
): string {
	return date.toLocaleDateString('en-US', {
		timeZone: TIMEZONE,
		...options
	});
}

/**
 * Get today's date in Berlin as YYYY-MM-DD string.
 */
export function todayBerlin(): string {
	return nowBerlinISO().split('T')[0];
}

/**
 * Get the day name in Berlin timezone.
 */
export function getBerlinDayName(date: Date): string {
	return date.toLocaleDateString('en-US', {
		timeZone: TIMEZONE,
		weekday: 'long'
	});
}
