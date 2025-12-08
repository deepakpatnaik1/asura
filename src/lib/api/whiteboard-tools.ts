/**
 * Whiteboard Tools for Gunnar
 *
 * Tool definitions and executors for whiteboard operations.
 * These tools allow Gunnar to create, rename, delete, and open whiteboards.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Tool Definitions
 */

export const CREATE_WHITEBOARD_TOOL: Anthropic.Tool = {
	name: 'create_whiteboard',
	description:
		'Create a new whiteboard for visual brainstorming. Use this when the user wants to start a new whiteboard or canvas for notes, ideas, or diagrams.',
	input_schema: {
		type: 'object',
		properties: {
			title: {
				type: 'string',
				description: 'The title for the whiteboard. Choose something descriptive that captures the topic or purpose.'
			}
		},
		required: ['title']
	}
};

export const RENAME_WHITEBOARD_TOOL: Anthropic.Tool = {
	name: 'rename_whiteboard',
	description: 'Rename an existing whiteboard. Use this when the user wants to change the title of a whiteboard.',
	input_schema: {
		type: 'object',
		properties: {
			whiteboard_id: {
				type: 'string',
				description: 'The UUID of the whiteboard to rename'
			},
			title: {
				type: 'string',
				description: 'The new title for the whiteboard'
			}
		},
		required: ['whiteboard_id', 'title']
	}
};

export const DELETE_WHITEBOARD_TOOL: Anthropic.Tool = {
	name: 'delete_whiteboard',
	description: 'Delete a whiteboard permanently. Use this when the user wants to remove a whiteboard they no longer need.',
	input_schema: {
		type: 'object',
		properties: {
			whiteboard_id: {
				type: 'string',
				description: 'The UUID of the whiteboard to delete'
			}
		},
		required: ['whiteboard_id']
	}
};

export const OPEN_WHITEBOARD_TOOL: Anthropic.Tool = {
	name: 'open_whiteboard',
	description:
		'Open/switch to a specific whiteboard. Use this when the user wants to view or work on a particular whiteboard. The UI will display it.',
	input_schema: {
		type: 'object',
		properties: {
			whiteboard_id: {
				type: 'string',
				description: 'The UUID of the whiteboard to open'
			}
		},
		required: ['whiteboard_id']
	}
};

export const LIST_WHITEBOARDS_TOOL: Anthropic.Tool = {
	name: 'list_whiteboards',
	description:
		'List all available whiteboards for the user. Use this to show the user their whiteboards or to help them choose which one to open.',
	input_schema: {
		type: 'object',
		properties: {},
		required: []
	}
};

/**
 * All whiteboard tools
 */
export const WHITEBOARD_TOOLS: Anthropic.Tool[] = [
	CREATE_WHITEBOARD_TOOL,
	RENAME_WHITEBOARD_TOOL,
	DELETE_WHITEBOARD_TOOL,
	OPEN_WHITEBOARD_TOOL,
	LIST_WHITEBOARDS_TOOL
];

/**
 * Context for tool execution
 */
export interface WhiteboardToolContext {
	supabase: SupabaseClient;
	userId: string;
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
 * Whiteboard type for mutations payload
 */
export interface Whiteboard {
	id: string;
	title: string;
	created_at: string;
	updated_at: string;
}

/**
 * Mutations payload returned with chat response
 */
export interface WhiteboardMutations {
	created_whiteboards: Whiteboard[];
	renamed_whiteboards: { id: string; title: string }[];
	deleted_whiteboards: string[]; // IDs
	opened_whiteboard: string | null; // ID of whiteboard to open in UI
}

/**
 * Create empty mutations object
 */
export function createEmptyWhiteboardMutations(): WhiteboardMutations {
	return {
		created_whiteboards: [],
		renamed_whiteboards: [],
		deleted_whiteboards: [],
		opened_whiteboard: null
	};
}

/**
 * Execute a whiteboard tool
 */
export async function executeWhiteboardTool(
	toolName: string,
	input: Record<string, unknown>,
	context: WhiteboardToolContext,
	mutations: WhiteboardMutations
): Promise<ToolExecutionResult> {
	switch (toolName) {
		case 'create_whiteboard':
			return executeCreateWhiteboard(input, context, mutations);

		case 'rename_whiteboard':
			return executeRenameWhiteboard(input, context, mutations);

		case 'delete_whiteboard':
			return executeDeleteWhiteboard(input, context, mutations);

		case 'open_whiteboard':
			return executeOpenWhiteboard(input, context, mutations);

		case 'list_whiteboards':
			return executeListWhiteboards(context);

		default:
			return {
				success: false,
				message: `Unknown whiteboard tool: ${toolName}`
			};
	}
}

/**
 * Create Whiteboard Executor
 */
async function executeCreateWhiteboard(
	input: Record<string, unknown>,
	context: WhiteboardToolContext,
	mutations: WhiteboardMutations
): Promise<ToolExecutionResult> {
	try {
		const { supabase, userId } = context;
		const title = (input.title as string).trim();

		if (!title) {
			return {
				success: false,
				message: 'Title cannot be empty'
			};
		}

		if (title.length > 255) {
			return {
				success: false,
				message: 'Title must be 255 characters or less'
			};
		}

		const { data, error } = await supabase
			.from('whiteboards')
			.insert({
				user_id: userId,
				title
			})
			.select('id, title, created_at, updated_at')
			.single();

		if (error) throw error;

		const whiteboard: Whiteboard = {
			id: data.id,
			title: data.title,
			created_at: data.created_at,
			updated_at: data.updated_at
		};

		mutations.created_whiteboards.push(whiteboard);
		// Auto-open newly created whiteboard
		mutations.opened_whiteboard = whiteboard.id;

		return {
			success: true,
			message: `Created whiteboard "${title}"`,
			data: whiteboard
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to create whiteboard: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Rename Whiteboard Executor
 */
async function executeRenameWhiteboard(
	input: Record<string, unknown>,
	context: WhiteboardToolContext,
	mutations: WhiteboardMutations
): Promise<ToolExecutionResult> {
	try {
		const { supabase, userId } = context;
		const whiteboardId = input.whiteboard_id as string;
		const newTitle = (input.title as string).trim();

		if (!newTitle) {
			return {
				success: false,
				message: 'Title cannot be empty'
			};
		}

		if (newTitle.length > 255) {
			return {
				success: false,
				message: 'Title must be 255 characters or less'
			};
		}

		// Get old title for message
		const { data: existing, error: fetchError } = await supabase
			.from('whiteboards')
			.select('title')
			.eq('id', whiteboardId)
			.eq('user_id', userId)
			.single();

		if (fetchError || !existing) {
			return {
				success: false,
				message: 'Whiteboard not found'
			};
		}

		const { error } = await supabase
			.from('whiteboards')
			.update({
				title: newTitle,
				updated_at: new Date().toISOString()
			})
			.eq('id', whiteboardId)
			.eq('user_id', userId);

		if (error) throw error;

		mutations.renamed_whiteboards.push({ id: whiteboardId, title: newTitle });

		return {
			success: true,
			message: `Renamed whiteboard from "${existing.title}" to "${newTitle}"`,
			data: { id: whiteboardId, title: newTitle }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to rename whiteboard: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Delete Whiteboard Executor
 */
async function executeDeleteWhiteboard(
	input: Record<string, unknown>,
	context: WhiteboardToolContext,
	mutations: WhiteboardMutations
): Promise<ToolExecutionResult> {
	try {
		const { supabase, userId } = context;
		const whiteboardId = input.whiteboard_id as string;

		// Get title before deleting
		const { data: whiteboard, error: fetchError } = await supabase
			.from('whiteboards')
			.select('title')
			.eq('id', whiteboardId)
			.eq('user_id', userId)
			.single();

		if (fetchError || !whiteboard) {
			return {
				success: false,
				message: 'Whiteboard not found'
			};
		}

		const { error } = await supabase
			.from('whiteboards')
			.delete()
			.eq('id', whiteboardId)
			.eq('user_id', userId);

		if (error) throw error;

		mutations.deleted_whiteboards.push(whiteboardId);

		return {
			success: true,
			message: `Deleted whiteboard "${whiteboard.title}"`,
			data: { id: whiteboardId }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to delete whiteboard: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Open Whiteboard Executor
 */
async function executeOpenWhiteboard(
	input: Record<string, unknown>,
	context: WhiteboardToolContext,
	mutations: WhiteboardMutations
): Promise<ToolExecutionResult> {
	try {
		const { supabase, userId } = context;
		const whiteboardId = input.whiteboard_id as string;

		// Verify whiteboard exists and belongs to user
		const { data: whiteboard, error } = await supabase
			.from('whiteboards')
			.select('id, title')
			.eq('id', whiteboardId)
			.eq('user_id', userId)
			.single();

		if (error || !whiteboard) {
			return {
				success: false,
				message: 'Whiteboard not found'
			};
		}

		// Set this as the whiteboard to open in UI
		mutations.opened_whiteboard = whiteboardId;

		return {
			success: true,
			message: `Opening whiteboard "${whiteboard.title}"`,
			data: { id: whiteboardId, title: whiteboard.title }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to open whiteboard: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * List Whiteboards Executor
 */
async function executeListWhiteboards(context: WhiteboardToolContext): Promise<ToolExecutionResult> {
	try {
		const { supabase, userId } = context;

		const { data: whiteboards, error } = await supabase
			.from('whiteboards')
			.select('id, title, created_at, updated_at')
			.eq('user_id', userId)
			.order('updated_at', { ascending: false });

		if (error) throw error;

		if (!whiteboards || whiteboards.length === 0) {
			return {
				success: true,
				message: 'No whiteboards found. You can ask me to create one.',
				data: { whiteboards: [] }
			};
		}

		const list = whiteboards
			.map((wb, i) => `${i + 1}. "${wb.title}" (id: ${wb.id})`)
			.join('\n');

		return {
			success: true,
			message: `Found ${whiteboards.length} whiteboard(s):\n${list}`,
			data: { whiteboards }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to list whiteboards: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Check if a tool name is a whiteboard tool
 */
export function isWhiteboardTool(toolName: string): boolean {
	return [
		'create_whiteboard',
		'rename_whiteboard',
		'delete_whiteboard',
		'open_whiteboard',
		'list_whiteboards'
	].includes(toolName);
}
