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
			},
			mark_complete: {
				type: 'boolean',
				description:
					'Set to true to create the todo as already completed. Use when the user tells you about something they already finished and want to log it as done.'
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

export const REOPEN_TODO_TOOL: Anthropic.Tool = {
	name: 'reopen_todo',
	description:
		'Reopen a completed todo. Use this when the user says they haven\'t actually finished a task, changed their mind, or wants to mark it as not done.',
	input_schema: {
		type: 'object',
		properties: {
			todo_id: {
				type: 'string',
				description: 'The UUID of the todo to reopen'
			}
		},
		required: ['todo_id']
	}
};

export const UPDATE_TODO_TOOL: Anthropic.Tool = {
	name: 'update_todo',
	description:
		'Update a todo item. Use this when the user wants to rename, re-tag, change deadline, or modify a todo.',
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
			},
			deadline_period: {
				type: 'string',
				description:
					'Optional fuzzy deadline for the todo. Use when user mentions a timeframe like "this month", "next week", "by end of year", "Q1 2026". Set to empty string to clear existing deadline.'
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

export const DELETE_TAG_TOOL: Anthropic.Tool = {
	name: 'delete_tag',
	description:
		'Delete a tag permanently. This removes the tag from the canonical list and from all todos that use it.',
	input_schema: {
		type: 'object',
		properties: {
			name: {
				type: 'string',
				description: 'The tag name to delete'
			}
		},
		required: ['name']
	}
};

export const RENAME_TAG_TOOL: Anthropic.Tool = {
	name: 'rename_tag',
	description:
		'Rename a tag. Updates the canonical tag and all todos that use it.',
	input_schema: {
		type: 'object',
		properties: {
			old_name: {
				type: 'string',
				description: 'The current tag name'
			},
			new_name: {
				type: 'string',
				description: 'The new tag name (lowercase, no spaces)'
			}
		},
		required: ['old_name', 'new_name']
	}
};

export const MERGE_TAGS_TOOL: Anthropic.Tool = {
	name: 'merge_tags',
	description:
		'Merge one tag into another. All todos with the source tag will be updated to use the target tag, then the source tag is deleted.',
	input_schema: {
		type: 'object',
		properties: {
			source_tag: {
				type: 'string',
				description: 'The tag to merge from (will be deleted)'
			},
			target_tag: {
				type: 'string',
				description: 'The tag to merge into (will remain)'
			}
		},
		required: ['source_tag', 'target_tag']
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
	description:
		'Update a founder diary entry. Can edit description, tags, or date (logged_at/event_period).',
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
			},
			logged_at: {
				type: 'string',
				description:
					'New date for the entry (ISO 8601). Use when user wants to change when the entry was logged.'
			},
			event_period: {
				type: 'string',
				description:
					'New fuzzy date like "Summer 2023", "Early 2022". Replaces logged_at display. Set to empty string to clear (when switching from fuzzy to specific date).'
			},
			sort_date: {
				type: 'string',
				description: 'REQUIRED when event_period provided. YYYY-MM-DD for sorting.'
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
	REOPEN_TODO_TOOL,
	UPDATE_TODO_TOOL,
	DELETE_TODO_TOOL,
	CREATE_TAG_TOOL,
	DELETE_TAG_TOOL,
	RENAME_TAG_TOOL,
	MERGE_TAGS_TOOL,
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
	reopened_todos: string[]; // IDs
	updated_todos: { id: string; description?: string; tags?: string[] }[];
	deleted_todos: string[]; // IDs
	// Tag mutations
	created_tags: string[]; // Names
	deleted_tags: string[]; // Names
	renamed_tags: { old_name: string; new_name: string }[];
	merged_tags: { source_tag: string; target_tag: string }[];
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
		reopened_todos: [],
		updated_todos: [],
		deleted_todos: [],
		created_tags: [],
		deleted_tags: [],
		renamed_tags: [],
		merged_tags: [],
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

		case 'reopen_todo':
			return executeReopenTodo(input, context, mutations);

		case 'update_todo':
			return executeUpdateTodo(input, context, mutations);

		case 'delete_todo':
			return executeDeleteTodo(input, context, mutations);

		case 'create_tag':
			return executeCreateTag(input, context, mutations);

		case 'delete_tag':
			return executeDeleteTag(input, context, mutations);

		case 'rename_tag':
			return executeRenameTag(input, context, mutations);

		case 'merge_tags':
			return executeMergeTags(input, context, mutations);

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
		const markComplete = input.mark_complete as boolean | undefined;

		const now = new Date().toISOString();
		const expectedStatus = markComplete ? 'completed' : 'open';
		const { data, error } = await supabase
			.from('canvas_planner_todos')
			.insert({
				user_id: userId,
				description,
				tags,
				deadline_period: deadlinePeriod || null,
				parent_id: parentId || null,
				source_message_id: sourceMessageId || null,
				status: expectedStatus,
				completed_at: markComplete ? now : null
			})
			.select()
			.single();

		if (error) throw error;

		// Verify the created todo matches what was requested
		const discrepancies: string[] = [];
		if (data.description !== description) discrepancies.push('description');
		if (JSON.stringify(data.tags) !== JSON.stringify(tags)) discrepancies.push('tags');
		if (data.deadline_period !== (deadlinePeriod || null)) discrepancies.push('deadline_period');
		if (data.parent_id !== (parentId || null)) discrepancies.push('parent_id');
		if (data.status !== expectedStatus) discrepancies.push('status');

		if (discrepancies.length > 0) {
			return {
				success: false,
				message: `Create failed: ${discrepancies.join(', ')} did not save as expected.`,
				data: { id: data.id, ...data }
			};
		}

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
		if (markComplete) {
			mutations.completed_todos.push(todo.id);
		}

		const deadlineInfo = deadlinePeriod ? ` (deadline: ${deadlinePeriod})` : '';
		const tagInfo = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
		const parentInfo = parentId ? ' (sub-task)' : '';
		const completeInfo = markComplete ? ' ✓' : '';

		return {
			success: true,
			message: `Created todo: "${description}"${deadlineInfo}${tagInfo}${parentInfo}${completeInfo}`,
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
			.from('canvas_planner_todos')
			.update({
				status: 'completed',
				completed_at: new Date().toISOString()
			})
			.eq('id', todoId)
			.select()
			.single();

		if (error) throw error;

		// Verify the completion actually happened
		if (data.status !== 'completed' || !data.completed_at) {
			return {
				success: false,
				message: 'Completion failed: status or completed_at did not update as expected.',
				data: { id: data.id, status: data.status, completed_at: data.completed_at }
			};
		}

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
 * Reopen Todo Executor
 */
async function executeReopenTodo(
	input: Record<string, unknown>,
	context: TodoToolContext,
	mutations: TodoMutations
): Promise<ToolExecutionResult> {
	try {
		const { supabase } = context;
		const todoId = input.todo_id as string;

		const { data, error } = await supabase
			.from('canvas_planner_todos')
			.update({
				status: 'open',
				completed_at: null
			})
			.eq('id', todoId)
			.select()
			.single();

		if (error) throw error;

		// Verify the reopen actually happened
		if (data.status !== 'open' || data.completed_at !== null) {
			return {
				success: false,
				message: 'Reopen failed: status or completed_at did not update as expected.',
				data: { id: data.id, status: data.status, completed_at: data.completed_at }
			};
		}

		mutations.reopened_todos.push(todoId);

		return {
			success: true,
			message: `Reopened todo: "${data.description}"`,
			data: {
				id: data.id,
				description: data.description
			}
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to reopen todo: ${error instanceof Error ? error.message : 'Unknown error'}`
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
		const newDeadlinePeriod = input.deadline_period as string | undefined;

		// Build update object with only provided fields
		const updateData: Record<string, unknown> = {};
		if (newDescription !== undefined) updateData.description = newDescription;
		if (newTags !== undefined) updateData.tags = newTags;
		if (newDeadlinePeriod !== undefined) {
			// Empty string clears the deadline, otherwise set it
			updateData.deadline_period = newDeadlinePeriod || null;
		}

		if (Object.keys(updateData).length === 0) {
			return {
				success: false,
				message: 'No fields to update. Provide description, tags, or deadline_period.'
			};
		}

		const { data, error } = await supabase
			.from('canvas_planner_todos')
			.update(updateData)
			.eq('id', todoId)
			.select()
			.single();

		if (error) throw error;

		// Verify what actually changed vs what was requested
		const discrepancies: string[] = [];
		if (newDescription !== undefined && data.description !== newDescription) {
			discrepancies.push('description');
		}
		if (newTags !== undefined && JSON.stringify(data.tags) !== JSON.stringify(newTags)) {
			discrepancies.push('tags');
		}
		if (newDeadlinePeriod !== undefined) {
			const expectedDeadline = newDeadlinePeriod || null;
			if (data.deadline_period !== expectedDeadline) {
				discrepancies.push('deadline_period');
			}
		}

		if (discrepancies.length > 0) {
			return {
				success: false,
				message: `Update failed: ${discrepancies.join(', ')} did not change as expected.`,
				data: { id: data.id, ...data }
			};
		}

		mutations.updated_todos.push({
			id: todoId,
			description: newDescription,
			tags: newTags
		});

		const changes: string[] = [];
		if (newDescription) changes.push(`renamed to "${newDescription}"`);
		if (newTags) changes.push(`tags set to [${newTags.join(', ')}]`);
		if (newDeadlinePeriod !== undefined) {
			changes.push(newDeadlinePeriod ? `deadline set to "${newDeadlinePeriod}"` : 'deadline cleared');
		}

		return {
			success: true,
			message: `Updated todo: ${changes.join(', ')}`,
			data: {
				id: data.id,
				description: data.description,
				tags: data.tags,
				deadline_period: data.deadline_period
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
			.from('canvas_planner_todos')
			.select('description')
			.eq('id', todoId)
			.single();

		if (fetchError) throw fetchError;

		const { error } = await supabase.from('canvas_planner_todos').delete().eq('id', todoId);

		if (error) throw error;

		// Verify the deletion actually happened by checking the record is gone
		const { data: checkDeleted } = await supabase
			.from('canvas_planner_todos')
			.select('id')
			.eq('id', todoId)
			.single();

		if (checkDeleted) {
			return {
				success: false,
				message: 'Delete failed: todo still exists after deletion attempt.',
				data: { id: todoId }
			};
		}

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
			.from('canvas_planner_tags')
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

		// Verify the created tag matches what was requested
		if (data.name !== name) {
			return {
				success: false,
				message: `Create failed: tag name "${data.name}" does not match requested "${name}".`,
				data: { id: data.id, name: data.name }
			};
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
 * Delete Tag Executor
 */
async function executeDeleteTag(
	input: Record<string, unknown>,
	context: TodoToolContext,
	mutations: TodoMutations
): Promise<ToolExecutionResult> {
	try {
		const { supabase, userId } = context;
		const name = (input.name as string).toLowerCase().trim();

		// Find the tag first
		const { data: tag, error: fetchError } = await supabase
			.from('canvas_planner_tags')
			.select('id')
			.eq('user_id', userId)
			.eq('name', name)
			.single();

		if (fetchError || !tag) {
			return {
				success: false,
				message: `Tag "${name}" not found`
			};
		}

		// Remove tag from all todos that use it
		const { data: todosWithTag } = await supabase
			.from('canvas_planner_todos')
			.select('id, tags')
			.eq('user_id', userId)
			.contains('tags', [name]);

		if (todosWithTag && todosWithTag.length > 0) {
			for (const todo of todosWithTag) {
				const newTags = (todo.tags as string[]).filter((t: string) => t !== name);
				await supabase
					.from('canvas_planner_todos')
					.update({ tags: newTags })
					.eq('id', todo.id);
			}
		}

		// Delete the tag
		const { error } = await supabase
			.from('canvas_planner_tags')
			.delete()
			.eq('id', tag.id);

		if (error) throw error;

		// Verify deletion
		const { data: checkDeleted } = await supabase
			.from('canvas_planner_tags')
			.select('id')
			.eq('id', tag.id)
			.single();

		if (checkDeleted) {
			return {
				success: false,
				message: 'Delete failed: tag still exists after deletion attempt.',
				data: { name }
			};
		}

		mutations.deleted_tags.push(name);

		const todoCount = todosWithTag?.length || 0;
		return {
			success: true,
			message: `Deleted tag "${name}"${todoCount > 0 ? ` and removed from ${todoCount} todo(s)` : ''}`,
			data: { name, affected_todos: todoCount }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to delete tag: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Rename Tag Executor
 */
async function executeRenameTag(
	input: Record<string, unknown>,
	context: TodoToolContext,
	mutations: TodoMutations
): Promise<ToolExecutionResult> {
	try {
		const { supabase, userId } = context;
		const oldName = (input.old_name as string).toLowerCase().trim();
		const newName = (input.new_name as string).toLowerCase().trim();

		if (oldName === newName) {
			return {
				success: false,
				message: 'Old and new tag names are the same'
			};
		}

		// Find the tag
		const { data: tag, error: fetchError } = await supabase
			.from('canvas_planner_tags')
			.select('id')
			.eq('user_id', userId)
			.eq('name', oldName)
			.single();

		if (fetchError || !tag) {
			return {
				success: false,
				message: `Tag "${oldName}" not found`
			};
		}

		// Check if new name already exists
		const { data: existingTag } = await supabase
			.from('canvas_planner_tags')
			.select('id')
			.eq('user_id', userId)
			.eq('name', newName)
			.single();

		if (existingTag) {
			return {
				success: false,
				message: `Tag "${newName}" already exists. Use merge_tags to combine them.`
			};
		}

		// Rename the tag
		const { data: updatedTag, error } = await supabase
			.from('canvas_planner_tags')
			.update({ name: newName })
			.eq('id', tag.id)
			.select('name')
			.single();

		if (error) throw error;

		// Verify the update actually happened (RLS can silently block)
		if (!updatedTag || updatedTag.name !== newName) {
			return {
				success: false,
				message: `Rename failed: tag "${oldName}" could not be updated. Check database permissions.`
			};
		}

		// Update all todos that use this tag
		const { data: todosWithTag } = await supabase
			.from('canvas_planner_todos')
			.select('id, tags')
			.eq('user_id', userId)
			.contains('tags', [oldName]);

		if (todosWithTag && todosWithTag.length > 0) {
			for (const todo of todosWithTag) {
				const newTags = (todo.tags as string[]).map((t: string) => t === oldName ? newName : t);
				await supabase
					.from('canvas_planner_todos')
					.update({ tags: newTags })
					.eq('id', todo.id);
			}
		}

		// Verify rename
		const { data: renamed } = await supabase
			.from('canvas_planner_tags')
			.select('name')
			.eq('id', tag.id)
			.single();

		if (!renamed || renamed.name !== newName) {
			return {
				success: false,
				message: 'Rename failed: tag name did not update as expected.'
			};
		}

		mutations.renamed_tags.push({ old_name: oldName, new_name: newName });

		const todoCount = todosWithTag?.length || 0;
		return {
			success: true,
			message: `Renamed tag "${oldName}" to "${newName}"${todoCount > 0 ? ` (updated ${todoCount} todo(s))` : ''}`,
			data: { old_name: oldName, new_name: newName, affected_todos: todoCount }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to rename tag: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Merge Tags Executor
 */
async function executeMergeTags(
	input: Record<string, unknown>,
	context: TodoToolContext,
	mutations: TodoMutations
): Promise<ToolExecutionResult> {
	try {
		const { supabase, userId } = context;
		const sourceTag = (input.source_tag as string).toLowerCase().trim();
		const targetTag = (input.target_tag as string).toLowerCase().trim();

		if (sourceTag === targetTag) {
			return {
				success: false,
				message: 'Source and target tags are the same'
			};
		}

		// Verify both tags exist
		const { data: source } = await supabase
			.from('canvas_planner_tags')
			.select('id')
			.eq('user_id', userId)
			.eq('name', sourceTag)
			.single();

		const { data: target } = await supabase
			.from('canvas_planner_tags')
			.select('id')
			.eq('user_id', userId)
			.eq('name', targetTag)
			.single();

		if (!source) {
			return {
				success: false,
				message: `Source tag "${sourceTag}" not found`
			};
		}

		if (!target) {
			return {
				success: false,
				message: `Target tag "${targetTag}" not found`
			};
		}

		// Update all todos: replace source tag with target tag
		const { data: todosWithSource } = await supabase
			.from('canvas_planner_todos')
			.select('id, tags')
			.eq('user_id', userId)
			.contains('tags', [sourceTag]);

		let mergedCount = 0;
		if (todosWithSource && todosWithSource.length > 0) {
			for (const todo of todosWithSource) {
				const tags = todo.tags as string[];
				// Remove source, add target if not already present
				const newTags = tags.filter((t: string) => t !== sourceTag);
				if (!newTags.includes(targetTag)) {
					newTags.push(targetTag);
				}
				await supabase
					.from('canvas_planner_todos')
					.update({ tags: newTags })
					.eq('id', todo.id);
				mergedCount++;
			}
		}

		// Delete the source tag
		const { error } = await supabase
			.from('canvas_planner_tags')
			.delete()
			.eq('id', source.id);

		if (error) throw error;

		// Verify deletion
		const { data: checkDeleted } = await supabase
			.from('canvas_planner_tags')
			.select('id')
			.eq('id', source.id)
			.single();

		if (checkDeleted) {
			return {
				success: false,
				message: 'Merge failed: source tag still exists after deletion.',
				data: { source_tag: sourceTag, target_tag: targetTag }
			};
		}

		mutations.merged_tags.push({ source_tag: sourceTag, target_tag: targetTag });

		return {
			success: true,
			message: `Merged "${sourceTag}" into "${targetTag}" (${mergedCount} todo(s) updated)`,
			data: { source_tag: sourceTag, target_tag: targetTag, affected_todos: mergedCount }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to merge tags: ${error instanceof Error ? error.message : 'Unknown error'}`
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

		const expectedLoggedAt = loggedAt || new Date().toISOString();
		const { data, error } = await supabase
			.from('canvas_planner_diary')
			.insert({
				user_id: userId,
				description,
				tags,
				logged_at: expectedLoggedAt,
				event_period: eventPeriod || null,
				sort_date: computedSortDate,
				source_message_id: sourceMessageId || null
			})
			.select()
			.single();

		if (error) throw error;

		// Verify the created entry matches what was requested
		const discrepancies: string[] = [];
		if (data.description !== description) discrepancies.push('description');
		if (JSON.stringify(data.tags) !== JSON.stringify(tags)) discrepancies.push('tags');
		if (data.event_period !== (eventPeriod || null)) discrepancies.push('event_period');
		if (data.sort_date !== computedSortDate) discrepancies.push('sort_date');

		if (discrepancies.length > 0) {
			return {
				success: false,
				message: `Log failed: ${discrepancies.join(', ')} did not save as expected.`,
				data: { id: data.id, ...data }
			};
		}

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
		const newLoggedAt = input.logged_at as string | undefined;
		const newEventPeriod = input.event_period as string | undefined;
		const newSortDate = input.sort_date as string | undefined;

		// Build update object with only provided fields
		const updateData: Record<string, unknown> = {};
		if (newDescription !== undefined) updateData.description = newDescription;
		if (newTags !== undefined) updateData.tags = newTags;
		if (newLoggedAt !== undefined) updateData.logged_at = newLoggedAt;
		if (newEventPeriod !== undefined) {
			// Empty string clears the event_period (switch from fuzzy to specific date)
			updateData.event_period = newEventPeriod || null;
		}
		if (newSortDate !== undefined) updateData.sort_date = newSortDate;

		if (Object.keys(updateData).length === 0) {
			return {
				success: false,
				message: 'No fields to update. Provide description, tags, logged_at, or event_period.'
			};
		}

		const { data, error } = await supabase
			.from('canvas_planner_diary')
			.update(updateData)
			.eq('id', diaryId)
			.select()
			.single();

		if (error) throw error;

		// Verify what actually changed vs what was requested
		const discrepancies: string[] = [];
		if (newDescription !== undefined && data.description !== newDescription) {
			discrepancies.push('description');
		}
		if (newTags !== undefined && JSON.stringify(data.tags) !== JSON.stringify(newTags)) {
			discrepancies.push('tags');
		}
		if (newLoggedAt !== undefined && data.logged_at !== newLoggedAt) {
			discrepancies.push('logged_at');
		}
		if (newEventPeriod !== undefined) {
			const expectedEventPeriod = newEventPeriod || null;
			if (data.event_period !== expectedEventPeriod) {
				discrepancies.push('event_period');
			}
		}
		if (newSortDate !== undefined && data.sort_date !== newSortDate) {
			discrepancies.push('sort_date');
		}

		if (discrepancies.length > 0) {
			return {
				success: false,
				message: `Update failed: ${discrepancies.join(', ')} did not change as expected.`,
				data: { id: data.id, ...data }
			};
		}

		mutations.updated_diary.push({
			id: diaryId,
			description: newDescription,
			tags: newTags
		});

		const changes: string[] = [];
		if (newDescription) changes.push(`updated to "${newDescription}"`);
		if (newTags) changes.push(`tags set to [${newTags.join(', ')}]`);
		if (newLoggedAt) changes.push(`date changed to ${newLoggedAt}`);
		if (newEventPeriod) changes.push(`period changed to "${newEventPeriod}"`);

		return {
			success: true,
			message: `Updated diary entry: ${changes.join(', ')}`,
			data: {
				id: data.id,
				description: data.description,
				tags: data.tags,
				logged_at: data.logged_at,
				event_period: data.event_period
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
			.from('canvas_planner_diary')
			.select('description')
			.eq('id', diaryId)
			.single();

		if (fetchError) throw fetchError;

		const { error } = await supabase.from('canvas_planner_diary').delete().eq('id', diaryId);

		if (error) throw error;

		// Verify the deletion actually happened by checking the record is gone
		const { data: checkDeleted } = await supabase
			.from('canvas_planner_diary')
			.select('id')
			.eq('id', diaryId)
			.single();

		if (checkDeleted) {
			return {
				success: false,
				message: 'Delete failed: diary entry still exists after deletion attempt.',
				data: { id: diaryId }
			};
		}

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
		'reopen_todo',
		'update_todo',
		'delete_todo',
		'create_tag',
		'delete_tag',
		'rename_tag',
		'merge_tags',
		'log_diary',
		'update_diary',
		'delete_diary'
	].includes(toolName);
}
