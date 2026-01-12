/**
 * Temporal Tools
 *
 * Tool for reliable time calculations. LLMs are notoriously bad at temporal
 * reasoning - this tool offloads that weakness to deterministic computation.
 *
 * All calculations use Europe/Berlin timezone.
 */

import type Anthropic from '@anthropic-ai/sdk';
import {
	nowBerlinISO,
	toBerlinISO,
	toBerlinLocale,
	toBerlinDateLocale,
	getBerlinDayName,
	todayBerlin
} from '$lib/utils/timezone';

/**
 * Tool Definition
 */
export const TEMPORAL_CALC_TOOL: Anthropic.Tool = {
	name: 'temporal_calc',
	description:
		'Perform time calculations. ALWAYS use this instead of computing time differences, future dates, or relative dates in your head — you WILL get it wrong. This tool is deterministic and uses Berlin timezone.',
	input_schema: {
		type: 'object',
		properties: {
			operation: {
				type: 'string',
				enum: ['difference', 'add', 'subtract', 'resolve', 'format'],
				description:
					'Operation to perform: "difference" (time between two points), "add"/"subtract" (offset from a time), "resolve" (convert relative expression to date), "format" (get readable format of a timestamp)'
			},
			from_time: {
				type: 'string',
				description:
					'Start time - use "now" for current time, or ISO timestamp like "2026-01-12T11:00:00". Required for difference/add/subtract.'
			},
			to_time: {
				type: 'string',
				description: 'End time for difference calculation - ISO timestamp like "2026-01-12T14:30:00"'
			},
			amount: {
				type: 'number',
				description: 'Amount to add or subtract (positive integer)'
			},
			unit: {
				type: 'string',
				enum: ['minutes', 'hours', 'days', 'weeks'],
				description: 'Unit for add/subtract operations'
			},
			expression: {
				type: 'string',
				description:
					'Relative expression to resolve: "tomorrow", "next Tuesday", "this weekend", "in 3 days", "next week", etc.'
			}
		},
		required: ['operation']
	}
};

export const TEMPORAL_TOOLS: Anthropic.Tool[] = [TEMPORAL_CALC_TOOL];

/**
 * Check if a tool name is a temporal tool
 */
export function isTemporalTool(toolName: string): boolean {
	return toolName === 'temporal_calc';
}

/**
 * Tool Execution Result
 */
export interface TemporalToolResult {
	success: boolean;
	message: string;
	data?: {
		result: string;
		iso?: string;
		day_of_week?: string;
		breakdown?: {
			days?: number;
			hours?: number;
			minutes?: number;
		};
	};
}

/**
 * Execute a temporal tool
 */
export function executeTemporalTool(
	toolName: string,
	input: Record<string, unknown>
): TemporalToolResult {
	if (toolName !== 'temporal_calc') {
		return { success: false, message: `Unknown temporal tool: ${toolName}` };
	}

	const operation = input.operation as string;

	try {
		switch (operation) {
			case 'difference':
				return computeDifference(input);
			case 'add':
				return computeAdd(input);
			case 'subtract':
				return computeSubtract(input);
			case 'resolve':
				return resolveExpression(input);
			case 'format':
				return formatTime(input);
			default:
				return { success: false, message: `Unknown operation: ${operation}` };
		}
	} catch (error) {
		return {
			success: false,
			message: `Calculation error: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Compute difference between two times
 */
function computeDifference(input: Record<string, unknown>): TemporalToolResult {
	const fromTime = input.from_time as string;
	const toTime = input.to_time as string;

	if (!fromTime || !toTime) {
		return { success: false, message: 'Both from_time and to_time are required for difference' };
	}

	const from = fromTime === 'now' ? new Date() : new Date(fromTime);
	const to = new Date(toTime);

	if (isNaN(from.getTime()) || isNaN(to.getTime())) {
		return { success: false, message: 'Invalid date format. Use ISO format or "now".' };
	}

	const diffMs = to.getTime() - from.getTime();
	const isPast = diffMs < 0;
	const absDiffMs = Math.abs(diffMs);

	const days = Math.floor(absDiffMs / (1000 * 60 * 60 * 24));
	const hours = Math.floor((absDiffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
	const minutes = Math.floor((absDiffMs % (1000 * 60 * 60)) / (1000 * 60));

	// Build human-readable string
	const parts: string[] = [];
	if (days > 0) parts.push(`${days} day${days === 1 ? '' : 's'}`);
	if (hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
	if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);

	const timeStr = parts.length > 0 ? parts.join(', ') : 'less than a minute';
	const direction = isPast ? 'ago' : 'from now';

	const fromFormatted = fromTime === 'now' ? 'now' : toBerlinLocale(from, {
		hour: 'numeric',
		minute: '2-digit',
		weekday: 'short',
		month: 'short',
		day: 'numeric'
	});
	const toFormatted = toBerlinLocale(to, {
		hour: 'numeric',
		minute: '2-digit',
		weekday: 'short',
		month: 'short',
		day: 'numeric'
	});

	return {
		success: true,
		message: `${timeStr} ${direction}`,
		data: {
			result: `From ${fromFormatted} to ${toFormatted}: ${timeStr} ${direction}`,
			breakdown: { days, hours, minutes }
		}
	};
}

/**
 * Add time to a base time
 */
function computeAdd(input: Record<string, unknown>): TemporalToolResult {
	const fromTime = input.from_time as string;
	const amount = input.amount as number;
	const unit = input.unit as string;

	if (!fromTime) {
		return { success: false, message: 'from_time is required for add operation' };
	}
	if (amount === undefined || amount === null) {
		return { success: false, message: 'amount is required for add operation' };
	}
	if (!unit) {
		return { success: false, message: 'unit is required for add operation' };
	}

	const from = fromTime === 'now' ? new Date() : new Date(fromTime);
	if (isNaN(from.getTime())) {
		return { success: false, message: 'Invalid from_time format. Use ISO format or "now".' };
	}

	const result = new Date(from);
	switch (unit) {
		case 'minutes':
			result.setMinutes(result.getMinutes() + amount);
			break;
		case 'hours':
			result.setHours(result.getHours() + amount);
			break;
		case 'days':
			result.setDate(result.getDate() + amount);
			break;
		case 'weeks':
			result.setDate(result.getDate() + amount * 7);
			break;
		default:
			return { success: false, message: `Unknown unit: ${unit}` };
	}

	const resultFormatted = toBerlinLocale(result, {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});

	return {
		success: true,
		message: resultFormatted,
		data: {
			result: resultFormatted,
			iso: toBerlinISO(result),
			day_of_week: getBerlinDayName(result)
		}
	};
}

/**
 * Subtract time from a base time
 */
function computeSubtract(input: Record<string, unknown>): TemporalToolResult {
	const amount = input.amount as number;
	if (amount !== undefined && amount !== null) {
		input.amount = -amount;
	}
	const result = computeAdd(input);
	// Fix the amount back for the result
	if (amount !== undefined && amount !== null) {
		input.amount = amount;
	}
	return result;
}

/**
 * Resolve a relative expression to an actual date
 */
function resolveExpression(input: Record<string, unknown>): TemporalToolResult {
	const expression = (input.expression as string)?.toLowerCase().trim();

	if (!expression) {
		return { success: false, message: 'expression is required for resolve operation' };
	}

	const now = new Date();
	let result: Date | null = null;

	// Handle "tomorrow"
	if (expression === 'tomorrow') {
		result = new Date(now);
		result.setDate(result.getDate() + 1);
		result.setHours(9, 0, 0, 0); // Default to 9 AM
	}
	// Handle "yesterday"
	else if (expression === 'yesterday') {
		result = new Date(now);
		result.setDate(result.getDate() - 1);
		result.setHours(9, 0, 0, 0);
	}
	// Handle "today"
	else if (expression === 'today') {
		result = new Date(now);
		result.setHours(9, 0, 0, 0);
	}
	// Handle "this weekend" (Saturday)
	else if (expression === 'this weekend' || expression === 'weekend') {
		result = new Date(now);
		const day = result.getDay();
		const daysUntilSaturday = (6 - day + 7) % 7 || 7;
		result.setDate(result.getDate() + daysUntilSaturday);
		result.setHours(10, 0, 0, 0);
	}
	// Handle "next week" (next Monday)
	else if (expression === 'next week') {
		result = new Date(now);
		const day = result.getDay();
		const daysUntilMonday = (8 - day) % 7 || 7;
		result.setDate(result.getDate() + daysUntilMonday);
		result.setHours(9, 0, 0, 0);
	}
	// Handle "in X days"
	else if (expression.match(/^in (\d+) days?$/)) {
		const match = expression.match(/^in (\d+) days?$/);
		const days = parseInt(match![1], 10);
		result = new Date(now);
		result.setDate(result.getDate() + days);
		result.setHours(9, 0, 0, 0);
	}
	// Handle "in X hours"
	else if (expression.match(/^in (\d+) hours?$/)) {
		const match = expression.match(/^in (\d+) hours?$/);
		const hours = parseInt(match![1], 10);
		result = new Date(now);
		result.setHours(result.getHours() + hours);
	}
	// Handle "in X minutes"
	else if (expression.match(/^in (\d+) minutes?$/)) {
		const match = expression.match(/^in (\d+) minutes?$/);
		const minutes = parseInt(match![1], 10);
		result = new Date(now);
		result.setMinutes(result.getMinutes() + minutes);
	}
	// Handle "next [day name]"
	else if (expression.match(/^next (monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/)) {
		const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
		const match = expression.match(/^next (\w+)$/);
		const targetDay = dayNames.indexOf(match![1]);
		result = new Date(now);
		const currentDay = result.getDay();
		const daysUntil = (targetDay - currentDay + 7) % 7 || 7;
		result.setDate(result.getDate() + daysUntil);
		result.setHours(9, 0, 0, 0);
	}
	// Handle "[day name]" (this week or next occurrence)
	else if (expression.match(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/)) {
		const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
		const targetDay = dayNames.indexOf(expression);
		result = new Date(now);
		const currentDay = result.getDay();
		let daysUntil = (targetDay - currentDay + 7) % 7;
		if (daysUntil === 0) daysUntil = 7; // If today, go to next week
		result.setDate(result.getDate() + daysUntil);
		result.setHours(9, 0, 0, 0);
	}
	// Handle "end of month"
	else if (expression === 'end of month' || expression === 'end of the month') {
		result = new Date(now.getFullYear(), now.getMonth() + 1, 0);
		result.setHours(17, 0, 0, 0);
	}
	// Handle "end of week" (Friday)
	else if (expression === 'end of week' || expression === 'end of the week') {
		result = new Date(now);
		const day = result.getDay();
		const daysUntilFriday = (5 - day + 7) % 7 || 7;
		result.setDate(result.getDate() + daysUntilFriday);
		result.setHours(17, 0, 0, 0);
	}
	// Try to parse as ISO date
	else {
		const parsed = new Date(expression);
		if (!isNaN(parsed.getTime())) {
			result = parsed;
		}
	}

	if (!result) {
		return {
			success: false,
			message: `Could not resolve "${expression}". Try: "tomorrow", "next Tuesday", "in 3 days", "this weekend", "next week", "end of month", or an ISO date.`
		};
	}

	const resultFormatted = toBerlinLocale(result, {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});

	return {
		success: true,
		message: resultFormatted,
		data: {
			result: resultFormatted,
			iso: toBerlinISO(result),
			day_of_week: getBerlinDayName(result)
		}
	};
}

/**
 * Format a timestamp in a readable way
 */
function formatTime(input: Record<string, unknown>): TemporalToolResult {
	const fromTime = input.from_time as string;

	if (!fromTime) {
		return { success: false, message: 'from_time is required for format operation' };
	}

	const date = fromTime === 'now' ? new Date() : new Date(fromTime);
	if (isNaN(date.getTime())) {
		return { success: false, message: 'Invalid date format.' };
	}

	const resultFormatted = toBerlinLocale(date, {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});

	return {
		success: true,
		message: resultFormatted,
		data: {
			result: resultFormatted,
			iso: toBerlinISO(date),
			day_of_week: getBerlinDayName(date)
		}
	};
}
