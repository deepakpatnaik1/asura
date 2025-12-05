/**
 * Calendar Tools for Alicja
 *
 * Tool definitions and executors for Google Calendar operations.
 * These tools allow Alicja to create, update, and delete calendar events.
 */

import type Anthropic from '@anthropic-ai/sdk';
import {
	createCalendarEvent,
	updateCalendarEvent,
	deleteCalendarEvent,
	fetchCalendarEvents,
	getWorkCalendarId,
	type CreateEventInput,
	type UpdateEventInput
} from './google-calendar';

/**
 * Tool Definitions
 */

export const CREATE_EVENT_TOOL: Anthropic.Tool = {
	name: 'create_calendar_event',
	description:
		'Create a new event on the user\'s Google Calendar. Use this when the user wants to schedule a meeting, appointment, or block time. Always confirm the date/time with the user before creating.',
	input_schema: {
		type: 'object',
		properties: {
			summary: {
				type: 'string',
				description: 'Event title/name'
			},
			start_time: {
				type: 'string',
				description: 'Start time in ISO 8601 format (e.g., "2025-12-05T14:00:00"). Include timezone offset if known.'
			},
			end_time: {
				type: 'string',
				description: 'End time in ISO 8601 format. If not specified by user, default to 1 hour after start.'
			},
			description: {
				type: 'string',
				description: 'Optional event description or notes'
			},
			location: {
				type: 'string',
				description: 'Optional location (physical address or virtual meeting info)'
			},
			attendees: {
				type: 'array',
				items: { type: 'string' },
				description: 'Optional list of attendee email addresses'
			},
			add_google_meet: {
				type: 'boolean',
				description: 'Set to true to automatically add a Google Meet video conference link'
			},
			all_day: {
				type: 'boolean',
				description: 'Set to true for all-day events (use date format YYYY-MM-DD instead of datetime)'
			},
			timezone: {
				type: 'string',
				description: 'IANA timezone (e.g., "Europe/Berlin", "America/Los_Angeles"). Defaults to Europe/Berlin if not specified.'
			},
			recurrence: {
				type: 'string',
				description: 'Recurrence rule in RRULE format (e.g., "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR" for Mon/Wed/Fri weekly)'
			},
			reminders_minutes: {
				type: 'array',
				items: { type: 'number' },
				description: 'List of reminder times in minutes before event (e.g., [10, 60] for 10min and 1hr before)'
			},
			color_id: {
				type: 'string',
				description: 'Event color ID (1-11). 1=lavender, 2=sage, 3=grape, 4=flamingo, 5=banana, 6=tangerine, 7=peacock, 8=graphite, 9=blueberry, 10=basil, 11=tomato'
			}
		},
		required: ['summary', 'start_time', 'end_time']
	}
};

export const UPDATE_EVENT_TOOL: Anthropic.Tool = {
	name: 'update_calendar_event',
	description:
		'Update an existing calendar event. Use this to reschedule, rename, or modify event details. You need the event ID from a previous query or creation.',
	input_schema: {
		type: 'object',
		properties: {
			event_id: {
				type: 'string',
				description: 'The Google Calendar event ID to update'
			},
			summary: {
				type: 'string',
				description: 'New event title (optional)'
			},
			start_time: {
				type: 'string',
				description: 'New start time in ISO 8601 format (optional)'
			},
			end_time: {
				type: 'string',
				description: 'New end time in ISO 8601 format (optional)'
			},
			description: {
				type: 'string',
				description: 'New description (optional)'
			},
			location: {
				type: 'string',
				description: 'New location (optional)'
			},
			attendees: {
				type: 'array',
				items: { type: 'string' },
				description: 'New list of attendee email addresses (replaces existing)'
			},
			reminders_minutes: {
				type: 'array',
				items: { type: 'number' },
				description: 'New reminder times in minutes before event'
			},
			color_id: {
				type: 'string',
				description: 'New event color ID (1-11)'
			}
		},
		required: ['event_id']
	}
};

export const DELETE_EVENT_TOOL: Anthropic.Tool = {
	name: 'delete_calendar_event',
	description:
		'Delete/cancel a calendar event. Use this when the user wants to remove an event. Always confirm with the user before deleting.',
	input_schema: {
		type: 'object',
		properties: {
			event_id: {
				type: 'string',
				description: 'The Google Calendar event ID to delete'
			}
		},
		required: ['event_id']
	}
};

export const LIST_EVENTS_TOOL: Anthropic.Tool = {
	name: 'list_calendar_events',
	description:
		'List upcoming calendar events. Use this to find event IDs for updating or deleting events. Call this first when user wants to modify or delete an event.',
	input_schema: {
		type: 'object',
		properties: {
			days_ahead: {
				type: 'number',
				description: 'Number of days to look ahead (default: 7, max: 30)'
			}
		},
		required: []
	}
};

export const CHECK_AVAILABILITY_TOOL: Anthropic.Tool = {
	name: 'check_calendar_availability',
	description:
		'Check if a time slot is free or busy. Use this before scheduling to warn about conflicts.',
	input_schema: {
		type: 'object',
		properties: {
			start_time: {
				type: 'string',
				description: 'Start of time range to check in ISO 8601 format'
			},
			end_time: {
				type: 'string',
				description: 'End of time range to check in ISO 8601 format'
			}
		},
		required: ['start_time', 'end_time']
	}
};

export const CALENDAR_TOOLS: Anthropic.Tool[] = [
	CREATE_EVENT_TOOL,
	UPDATE_EVENT_TOOL,
	DELETE_EVENT_TOOL,
	LIST_EVENTS_TOOL,
	CHECK_AVAILABILITY_TOOL
];

/**
 * Tool Executor Context
 */
export interface CalendarToolContext {
	accessToken: string;
	calendarId?: string; // Cached calendar ID
}

/**
 * Tool Execution Results
 */
export interface ToolExecutionResult {
	success: boolean;
	message: string;
	data?: unknown;
}

/**
 * Execute a calendar tool
 */
export async function executeCalendarTool(
	toolName: string,
	input: Record<string, unknown>,
	context: CalendarToolContext
): Promise<ToolExecutionResult> {
	const { accessToken } = context;

	// Get calendar ID (cache it in context for subsequent calls)
	const calendarId = context.calendarId || (await getWorkCalendarId(accessToken));
	context.calendarId = calendarId;

	switch (toolName) {
		case 'create_calendar_event':
			return executeCreateEvent(accessToken, calendarId, input);

		case 'update_calendar_event':
			return executeUpdateEvent(accessToken, calendarId, input);

		case 'delete_calendar_event':
			return executeDeleteEvent(accessToken, calendarId, input);

		case 'list_calendar_events':
			return executeListEvents(accessToken, input);

		case 'check_calendar_availability':
			return executeCheckAvailability(accessToken, calendarId, input);

		default:
			return {
				success: false,
				message: `Unknown tool: ${toolName}`
			};
	}
}

/**
 * Create Event Executor
 */
async function executeCreateEvent(
	accessToken: string,
	calendarId: string,
	input: Record<string, unknown>
): Promise<ToolExecutionResult> {
	try {
		const isAllDay = input.all_day === true;
		// Default timezone - TODO: get from user settings
		const timeZone = (input.timezone as string) || 'Europe/Berlin';

		const eventInput: CreateEventInput = {
			summary: input.summary as string,
			start: isAllDay
				? { date: (input.start_time as string).split('T')[0] }
				: { dateTime: input.start_time as string, timeZone },
			end: isAllDay
				? { date: (input.end_time as string).split('T')[0] }
				: { dateTime: input.end_time as string, timeZone },
			description: input.description as string | undefined,
			location: input.location as string | undefined,
			attendees: input.attendees
				? (input.attendees as string[]).map((email) => ({ email }))
				: undefined,
			addGoogleMeet: input.add_google_meet as boolean | undefined,
			recurrence: input.recurrence ? [input.recurrence as string] : undefined,
			reminders: input.reminders_minutes
				? {
						useDefault: false,
						overrides: (input.reminders_minutes as number[]).map((mins) => ({
							method: 'popup',
							minutes: mins
						}))
					}
				: undefined,
			colorId: input.color_id as string | undefined
		};

		const event = await createCalendarEvent(accessToken, calendarId, eventInput);

		return {
			success: true,
			message: `Created event "${event.summary}" for ${formatEventTime(event)}`,
			data: {
				event_id: event.id,
				summary: event.summary,
				start: event.start,
				end: event.end,
				meet_link: event.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri
			}
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to create event: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Update Event Executor
 */
async function executeUpdateEvent(
	accessToken: string,
	calendarId: string,
	input: Record<string, unknown>
): Promise<ToolExecutionResult> {
	try {
		const eventId = input.event_id as string;

		const updates: UpdateEventInput = {};
		if (input.summary) updates.summary = input.summary as string;
		if (input.description) updates.description = input.description as string;
		if (input.location) updates.location = input.location as string;
		if (input.start_time) updates.start = { dateTime: input.start_time as string };
		if (input.end_time) updates.end = { dateTime: input.end_time as string };
		if (input.attendees) {
			updates.attendees = (input.attendees as string[]).map((email) => ({ email }));
		}
		if (input.reminders_minutes) {
			updates.reminders = {
				useDefault: false,
				overrides: (input.reminders_minutes as number[]).map((mins) => ({
					method: 'popup',
					minutes: mins
				}))
			};
		}
		if (input.color_id) updates.colorId = input.color_id as string;

		const event = await updateCalendarEvent(accessToken, calendarId, eventId, updates);

		return {
			success: true,
			message: `Updated event "${event.summary}"`,
			data: {
				event_id: event.id,
				summary: event.summary,
				start: event.start,
				end: event.end
			}
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to update event: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Delete Event Executor
 */
async function executeDeleteEvent(
	accessToken: string,
	calendarId: string,
	input: Record<string, unknown>
): Promise<ToolExecutionResult> {
	try {
		const eventId = input.event_id as string;

		await deleteCalendarEvent(accessToken, calendarId, eventId);

		return {
			success: true,
			message: 'Event deleted successfully'
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to delete event: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * List Events Executor
 */
async function executeListEvents(
	accessToken: string,
	input: Record<string, unknown>
): Promise<ToolExecutionResult> {
	try {
		const daysAhead = Math.min(Math.max((input.days_ahead as number) || 7, 1), 30);

		const events = await fetchCalendarEvents(accessToken, daysAhead);

		if (events.length === 0) {
			return {
				success: true,
				message: `No events found in the next ${daysAhead} days.`,
				data: { events: [] }
			};
		}

		// Format events for Alicja
		const formattedEvents = events.map((event) => ({
			event_id: event.id,
			title: event.summary,
			start: event.start.dateTime || event.start.date,
			end: event.end.dateTime || event.end.date,
			display_time: formatEventTime(event)
		}));

		return {
			success: true,
			message: `Found ${events.length} event(s) in the next ${daysAhead} days.`,
			data: { events: formattedEvents }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to list events: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Check Availability Executor
 */
async function executeCheckAvailability(
	accessToken: string,
	calendarId: string,
	input: Record<string, unknown>
): Promise<ToolExecutionResult> {
	try {
		const startTime = input.start_time as string;
		const endTime = input.end_time as string;

		// Use freebusy API to check availability
		const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				timeMin: startTime,
				timeMax: endTime,
				items: [{ id: calendarId }]
			})
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`FreeBusy API failed: ${error}`);
		}

		const data = await response.json();
		const busyPeriods = data.calendars?.[calendarId]?.busy || [];

		if (busyPeriods.length === 0) {
			return {
				success: true,
				message: 'The time slot is free.',
				data: { is_free: true, conflicts: [] }
			};
		}

		// Format conflicts for Alicja
		const conflicts = busyPeriods.map((period: { start: string; end: string }) => ({
			start: period.start,
			end: period.end
		}));

		return {
			success: true,
			message: `Conflict detected: ${busyPeriods.length} event(s) overlap with this time.`,
			data: { is_free: false, conflicts }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to check availability: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Format event time for display
 */
function formatEventTime(event: { start: { dateTime?: string; date?: string } }): string {
	if (event.start.dateTime) {
		const date = new Date(event.start.dateTime);
		return date.toLocaleString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	} else if (event.start.date) {
		const date = new Date(event.start.date + 'T00:00:00');
		return date.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}
	return 'Unknown time';
}
