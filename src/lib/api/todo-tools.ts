/**
 * Todo Tools for Alicja
 *
 * Tool definitions and executors for todo/tag operations.
 * These tools allow Alicja to create, complete, push, and delete todos.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Tool Definitions
 */

export const CREATE_TODO_TOOL: Anthropic.Tool = {
	name: 'create_todo',
	description:
		'Create a new todo item. Use this when the user wants to add something to their todo list. For complex tasks, create a parent todo first, then create child todos with parent_id to break it into steps.',
	input_schema: {
		type: 'object',
		properties: {
			description: {
				type: 'string',
				description: 'The todo item description'
			},
			tags: {
				type: 'array',
				items: { type: 'string' },
				description: 'Optional tags for categorization. Must use existing canonical tags.'
			},
			deadline_period: {
				type: 'string',
				description:
					'Optional fuzzy deadline for the todo. Use when user mentions a timeframe like "this month", "next week", "by end of year", "Q1 2026", "before summer". NOT for specific dates/times (those go on the calendar).'
			},
			parent_id: {
				type: 'string',
				description:
					'Optional UUID of parent todo. Use to create sub-tasks under a main todo. The parent must be created first.'
			}
		},
		required: ['description']
	}
};

export const COMPLETE_TODO_TOOL: Anthropic.Tool = {
	name: 'complete_todo',
	description:
		'Mark a todo as completed. Use this when the user says they finished or completed a task.',
	input_schema: {
		type: 'object',
		properties: {
			todo_id: {
				type: 'string',
				description: 'The UUID of the todo to complete'
			}
		},
		required: ['todo_id']
	}
};


export const UPDATE_TODO_TOOL: Anthropic.Tool = {
	name: 'update_todo',
	description:
		'Update a todo item. Use this when the user wants to rename, re-tag, or modify a todo.',
	input_schema: {
		type: 'object',
		properties: {
			todo_id: {
				type: 'string',
				description: 'The UUID of the todo to update'
			},
			description: {
				type: 'string',
				description: 'New description for the todo (optional)'
			},
			tags: {
				type: 'array',
				items: { type: 'string' },
				description: 'New tags for the todo - replaces existing tags (optional)'
			}
		},
		required: ['todo_id']
	}
};

export const DELETE_TODO_TOOL: Anthropic.Tool = {
	name: 'delete_todo',
	description: 'Delete a todo permanently. Use this when the user wants to remove a task entirely.',
	input_schema: {
		type: 'object',
		properties: {
			todo_id: {
				type: 'string',
				description: 'The UUID of the todo to delete'
			}
		},
		required: ['todo_id']
	}
};

export const CREATE_TAG_TOOL: Anthropic.Tool = {
	name: 'create_tag',
	description:
		'Create a new canonical tag. Only use this when you need a tag that does not exist yet. Check existing tags first.',
	input_schema: {
		type: 'object',
		properties: {
			name: {
				type: 'string',
				description: 'The tag name (lowercase, no spaces)'
			}
		},
		required: ['name']
	}
};

export const LOG_DIARY_TOOL: Anthropic.Tool = {
	name: 'log_diary',
	description:
		'Log an entry to the founder diary. Use this when the user explicitly says "let\'s log this", "I want to log this", or "we should log this". The diary captures emotionally significant wins and moments, not task completion. Distill the user\'s rambling into a concise, meaningful description.',
	input_schema: {
		type: 'object',
		properties: {
			description: {
				type: 'string',
				description:
					'The distilled diary entry. Extract the essence from what the user said - concise but emotionally resonant.'
			},
			tags: {
				type: 'array',
				items: { type: 'string' },
				description: 'Optional tags for categorization. Must use existing canonical tags.'
			},
			logged_at: {
				type: 'string',
				description:
					'Optional date for the entry (ISO 8601 format). Use when user specifies a past or future date like "log this from last Tuesday" or "this happened in March". Defaults to now if not specified.'
			},
			event_period: {
				type: 'string',
				description:
					'Optional fuzzy date for when the event occurred. Use when the user doesn\'t know the exact date, e.g. "Summer 2023", "Early 2022", "Q3 2021", "Sometime in 2020". This is displayed instead of the precise date when present.'
			},
			sort_date: {
				type: 'string',
				description:
					'REQUIRED when event_period is provided. A sortable date (YYYY-MM-DD) derived from the fuzzy event_period. Use middle of period: "2019" → "2019-07-01", "Summer 2023" → "2023-07-15", "Early 2022" → "2022-02-15", "Q3 2021" → "2021-08-15", "Late 2020" → "2020-11-15".'
			}
		},
		required: ['description']
	}
};

export const UPDATE_DIARY_TOOL: Anthropic.Tool = {
	name: 'update_diary',
	description: 'Update a founder diary entry. Use this to edit the description or tags of an existing entry.',
	input_schema: {
		type: 'object',
		properties: {
			diary_id: {
				type: 'string',
				description: 'The UUID of the diary entry to update'
			},
			description: {
				type: 'string',
				description: 'New description for the entry (optional)'
			},
			tags: {
				type: 'array',
				items: { type: 'string' },
				description: 'New tags for the entry - replaces existing tags (optional)'
			}
		},
		required: ['diary_id']
	}
};

export const DELETE_DIARY_TOOL: Anthropic.Tool = {
	name: 'delete_diary',
	description: 'Delete a founder diary entry permanently.',
	input_schema: {
		type: 'object',
		properties: {
			diary_id: {
				type: 'string',
				description: 'The UUID of the diary entry to delete'
			}
		},
		required: ['diary_id']
	}
};

/**
 * All todo tools (includes diary)
 */
export const TODO_TOOLS: Anthropic.Tool[] = [
	CREATE_TODO_TOOL,
	COMPLETE_TODO_TOOL,
	UPDATE_TODO_TOOL,
	DELETE_TODO_TOOL,
	CREATE_TAG_TOOL,
	LOG_DIARY_TOOL,
	UPDATE_DIARY_TOOL,
	DELETE_DIARY_TOOL
];

/**
 * Context for tool execution
 */
export interface TodoToolContext {
	supabase: SupabaseClient;
	userId: string;
	sourceMessageId?: string; // Optional: link todo to the message that created it
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
	success: boolean;
	message: string;
	data?: unknown;
}

/**
 * Todo type for mutations payload
 */
export interface Todo {
	id: string;
	description: string;
	tags: string[];
	status: 'open' | 'completed';
	created_at: string;
	completed_at: string | null;
	deadline_period: string | null;
	parent_id: string | null;
}

/**
 * Diary entry type for mutations payload
 */
export interface DiaryEntry {
	id: string;
	description: string;
	tags: string[];
	logged_at: string;
	event_period?: string | null;
	sort_date?: string | null;
}

/**
 * Mutations payload returned with chat response
 * Covers todos, diary, and calendar operations
 */
export interface TodoMutations {
	// Todo mutations
	created_todos: Todo[];
	completed_todos: string[]; // IDs
	updated_todos: { id: string; description?: string; tags?: string[] }[];
	deleted_todos: string[]; // IDs
	created_tags: string[]; // Names
	// Diary mutations
	diary_entries: DiaryEntry[];
	updated_diary: { id: string; description?: string; tags?: string[] }[];
	deleted_diary: string[]; // IDs
	// Calendar mutations
	created_events: string[]; // Event IDs
	updated_events: string[]; // Event IDs
	deleted_events: string[]; // Event IDs
}

/**
 * Create empty mutations object
 */
export function createEmptyMutations(): TodoMutations {
	return {
		created_todos: [],
		completed_todos: [],
		updated_todos: [],
		deleted_todos: [],
		created_tags: [],
		diary_entries: [],
		updated_diary: [],
		deleted_diary: [],
		created_events: [],
		updated_events: [],
		deleted_events: []
	};
}

/**
 * Execute a todo tool
 */
export async function executeTodoTool(
	toolName: string,
	input: Record<string, unknown>,
	context: TodoToolContext,
	mutations: TodoMutations
): Promise<ToolExecutionResult> {
	switch (toolName) {
		case 'create_todo':
			return executeCreateTodo(input, context, mutations);

		case 'complete_todo':
			return executeCompleteTodo(input, context, mutations);

		case 'update_todo':
			return executeUpdateTodo(input, context, mutations);

		case 'delete_todo':
			return executeDeleteTodo(input, context, mutations);

		case 'create_tag':
			return executeCreateTag(input, context, mutations);

		case 'log_diary':
			return executeLogDiary(input, context, mutations);

		case 'update_diary':
			return executeUpdateDiary(input, context, mutations);

		case 'delete_diary':
			return executeDeleteDiary(input, context, mutations);

		default:
			return {
				success: false,
				message: `Unknown tool: ${toolName}`
			};
	}
}

/**
 * Create Todo Executor
 */
async function executeCreateTodo(
	input: Record<string, unknown>,
	context: TodoToolContext,
	mutations: TodoMutations
): Promise<ToolExecutionResult> {
	try {
		const { supabase, userId, sourceMessageId } = context;
		const description = input.description as string;
		const tags = (input.tags as string[]) || [];
		const deadlinePeriod = input.deadline_period as string | undefined;
		const parentId = input.parent_id as string | undefined;

		const { data, error } = await supabase
			.from('todos')
			.insert({
				user_id: userId,
				description,
				tags,
				deadline_period: deadlinePeriod || null,
				parent_id: parentId || null,
				source_message_id: sourceMessageId || null
			})
			.select()
			.single();

		if (error) throw error;

		const todo: Todo = {
			id: data.id,
			description: data.description,
			tags: data.tags,
			status: data.status,
			created_at: data.created_at,
			completed_at: data.completed_at,
			deadline_period: data.deadline_period,
			parent_id: data.parent_id
		};

		mutations.created_todos.push(todo);

		const deadlineInfo = deadlinePeriod ? ` (deadline: ${deadlinePeriod})` : '';
		const tagInfo = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
		const parentInfo = parentId ? ' (sub-task)' : '';

		return {
			success: true,
			message: `Created todo: "${description}"${deadlineInfo}${tagInfo}${parentInfo}`,
			data: todo
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to create todo: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Complete Todo Executor
 */
async function executeCompleteTodo(
	input: Record<string, unknown>,
	context: TodoToolContext,
	mutations: TodoMutations
): Promise<ToolExecutionResult> {
	try {
		const { supabase } = context;
		const todoId = input.todo_id as string;

		const { data, error } = await supabase
			.from('todos')
			.update({
				status: 'completed',
				completed_at: new Date().toISOString()
			})
			.eq('id', todoId)
			.select()
			.single();

		if (error) throw error;

		mutations.completed_todos.push(todoId);

		return {
			success: true,
			message: `Completed todo: "${data.description}"`,
			data: {
				id: data.id,
				description: data.description,
				completed_at: data.completed_at
			}
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to complete todo: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Update Todo Executor
 */
async function executeUpdateTodo(
	input: Record<string, unknown>,
	context: TodoToolContext,
	mutations: TodoMutations
): Promise<ToolExecutionResult> {
	try {
		const { supabase } = context;
		const todoId = input.todo_id as string;
		const newDescription = input.description as string | undefined;
		const newTags = input.tags as string[] | undefined;

		// Build update object with only provided fields
		const updateData: Record<string, unknown> = {};
		if (newDescription !== undefined) updateData.description = newDescription;
		if (newTags !== undefined) updateData.tags = newTags;

		if (Object.keys(updateData).length === 0) {
			return {
				success: false,
				message: 'No fields to update. Provide description or tags.'
			};
		}

		const { data, error } = await supabase
			.from('todos')
			.update(updateData)
			.eq('id', todoId)
			.select()
			.single();

		if (error) throw error;

		mutations.updated_todos.push({
			id: todoId,
			description: newDescription,
			tags: newTags
		});

		const changes: string[] = [];
		if (newDescription) changes.push(`renamed to "${newDescription}"`);
		if (newTags) changes.push(`tags set to [${newTags.join(', ')}]`);

		return {
			success: true,
			message: `Updated todo: ${changes.join(', ')}`,
			data: {
				id: data.id,
				description: data.description,
				tags: data.tags
			}
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to update todo: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Delete Todo Executor
 */
async function executeDeleteTodo(
	input: Record<string, unknown>,
	context: TodoToolContext,
	mutations: TodoMutations
): Promise<ToolExecutionResult> {
	try {
		const { supabase } = context;
		const todoId = input.todo_id as string;

		// Get description before deleting
		const { data: todo, error: fetchError } = await supabase
			.from('todos')
			.select('description')
			.eq('id', todoId)
			.single();

		if (fetchError) throw fetchError;

		const { error } = await supabase.from('todos').delete().eq('id', todoId);

		if (error) throw error;

		mutations.deleted_todos.push(todoId);

		return {
			success: true,
			message: `Deleted todo: "${todo.description}"`,
			data: { id: todoId }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to delete todo: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Create Tag Executor
 */
async function executeCreateTag(
	input: Record<string, unknown>,
	context: TodoToolContext,
	mutations: TodoMutations
): Promise<ToolExecutionResult> {
	try {
		const { supabase, userId } = context;
		const name = (input.name as string).toLowerCase().trim();

		const { data, error } = await supabase
			.from('tags')
			.insert({
				user_id: userId,
				name
			})
			.select()
			.single();

		if (error) {
			// Check if it's a unique constraint violation
			if (error.code === '23505') {
				return {
					success: false,
					message: `Tag "${name}" already exists`
				};
			}
			throw error;
		}

		mutations.created_tags.push(name);

		return {
			success: true,
			message: `Created tag: "${name}"`,
			data: { id: data.id, name: data.name }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to create tag: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Log Diary Executor
 */
async function executeLogDiary(
	input: Record<string, unknown>,
	context: TodoToolContext,
	mutations: TodoMutations
): Promise<ToolExecutionResult> {
	try {
		const { supabase, userId, sourceMessageId } = context;
		const description = input.description as string;
		const tags = (input.tags as string[]) || [];
		const loggedAt = input.logged_at as string | undefined;
		const eventPeriod = input.event_period as string | undefined;
		const sortDate = input.sort_date as string | undefined;

		// Compute sort_date: use provided value, or derive from loggedAt, or default to today
		const computedSortDate = sortDate || (loggedAt ? loggedAt.split('T')[0] : new Date().toISOString().split('T')[0]);

		const { data, error } = await supabase
			.from('founder_diary')
			.insert({
				user_id: userId,
				description,
				tags,
				logged_at: loggedAt || new Date().toISOString(),
				event_period: eventPeriod || null,
				sort_date: computedSortDate,
				source_message_id: sourceMessageId || null
			})
			.select()
			.single();

		if (error) throw error;

		const entry: DiaryEntry = {
			id: data.id,
			description: data.description,
			tags: data.tags,
			logged_at: data.logged_at,
			event_period: data.event_period,
			sort_date: data.sort_date
		};

		mutations.diary_entries.push(entry);

		const tagInfo = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
		// Show event_period if provided, otherwise show precise date if provided
		const dateInfo = eventPeriod
			? ` (${eventPeriod})`
			: loggedAt
				? ` (dated ${new Date(loggedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })})`
				: '';

		return {
			success: true,
			message: `Logged to diary${dateInfo}: "${description}"${tagInfo}`,
			data: entry
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to log diary entry: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Update Diary Executor
 */
async function executeUpdateDiary(
	input: Record<string, unknown>,
	context: TodoToolContext,
	mutations: TodoMutations
): Promise<ToolExecutionResult> {
	try {
		const { supabase } = context;
		const diaryId = input.diary_id as string;
		const newDescription = input.description as string | undefined;
		const newTags = input.tags as string[] | undefined;

		// Build update object with only provided fields
		const updateData: Record<string, unknown> = {};
		if (newDescription !== undefined) updateData.description = newDescription;
		if (newTags !== undefined) updateData.tags = newTags;

		if (Object.keys(updateData).length === 0) {
			return {
				success: false,
				message: 'No fields to update. Provide description or tags.'
			};
		}

		const { data, error } = await supabase
			.from('founder_diary')
			.update(updateData)
			.eq('id', diaryId)
			.select()
			.single();

		if (error) throw error;

		mutations.updated_diary.push({
			id: diaryId,
			description: newDescription,
			tags: newTags
		});

		const changes: string[] = [];
		if (newDescription) changes.push(`updated to "${newDescription}"`);
		if (newTags) changes.push(`tags set to [${newTags.join(', ')}]`);

		return {
			success: true,
			message: `Updated diary entry: ${changes.join(', ')}`,
			data: {
				id: data.id,
				description: data.description,
				tags: data.tags
			}
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to update diary entry: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Delete Diary Executor
 */
async function executeDeleteDiary(
	input: Record<string, unknown>,
	context: TodoToolContext,
	mutations: TodoMutations
): Promise<ToolExecutionResult> {
	try {
		const { supabase } = context;
		const diaryId = input.diary_id as string;

		// Get description before deleting
		const { data: entry, error: fetchError } = await supabase
			.from('founder_diary')
			.select('description')
			.eq('id', diaryId)
			.single();

		if (fetchError) throw fetchError;

		const { error } = await supabase.from('founder_diary').delete().eq('id', diaryId);

		if (error) throw error;

		mutations.deleted_diary.push(diaryId);

		return {
			success: true,
			message: `Deleted diary entry: "${entry.description}"`,
			data: { id: diaryId }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to delete diary entry: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Check if a tool name is a todo tool (includes diary)
 */
export function isTodoTool(toolName: string): boolean {
	return [
		'create_todo',
		'complete_todo',
		'update_todo',
		'delete_todo',
		'create_tag',
		'log_diary',
		'update_diary',
		'delete_diary'
	].includes(toolName);
}
