/**
 * Whiteboard Tools for Gunnar
 * Uses unified canvases table with type='whiteboard'
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

export const UPDATE_WHITEBOARD_TOOL: Anthropic.Tool = {
	name: 'update_whiteboard',
	description:
		'Update a whiteboard with new render elements and semantic structure. Use this to add, modify, or remove visual elements on the canvas.',
	input_schema: {
		type: 'object',
		properties: {
			whiteboard_id: {
				type: 'string',
				description: 'The UUID of the whiteboard to update'
			},
			render: {
				type: 'array',
				description:
					'Array of visual elements to render. Each element must have: id (string), type (note|label|line|arrow|group|image), and type-specific properties.',
				items: {
					type: 'object',
					properties: {
						id: { type: 'string' },
						type: { type: 'string', enum: ['note', 'label', 'line', 'arrow', 'group', 'image'] },
						x: { type: 'number' },
						y: { type: 'number' },
						text: { type: 'string' },
						fill: { type: 'string' },
						width: { type: 'number' },
						height: { type: 'number' },
						fontSize: { type: 'number' },
						stroke: { type: 'string' },
						strokeWidth: { type: 'number' },
						from: { type: 'array', items: { type: 'number' } },
						to: { type: 'array', items: { type: 'number' } },
						label: { type: 'string' },
						// Image-specific properties
						src: { type: 'string', description: 'URL to image' },
						prompt: { type: 'string', description: 'Generation prompt for iteration' },
						seed: { type: 'number', description: 'Seed for consistent generations' },
						model: { type: 'string', description: 'Model that generated the image' },
						role: { type: 'string', description: 'Image purpose: hero, gallery, expression' }
					},
					required: ['id', 'type']
				}
			},
			semantic: {
				type: 'object',
				description:
					'Free-form semantic structure describing what the whiteboard represents. Define concepts, relationships, hierarchy as needed.'
			}
		},
		required: ['whiteboard_id', 'render', 'semantic']
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
	LIST_WHITEBOARDS_TOOL,
	UPDATE_WHITEBOARD_TOOL
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
 * Render element types
 */
export type RenderElement = {
	id: string;
	type: 'note' | 'label' | 'line' | 'arrow' | 'group' | 'image';
	x?: number;
	y?: number;
	text?: string;
	fill?: string;
	width?: number;
	height?: number;
	fontSize?: number;
	stroke?: string;
	strokeWidth?: number;
	from?: [number, number];
	to?: [number, number];
	label?: string;
	// Image-specific properties
	src?: string; // URL to image
	prompt?: string; // Generation prompt (for iteration)
	seed?: number; // For consistent generations
	model?: string; // Which model generated it
	role?: string; // 'hero' | 'gallery' | 'expression' etc.
};

/**
 * Whiteboard state with dual-layer model
 */
export interface WhiteboardState {
	render: RenderElement[];
	semantic: Record<string, unknown>;
	viewport: { x: number; y: number; scale: number };
}

/**
 * Mutations payload returned with chat response
 */
export interface WhiteboardMutations {
	created_whiteboards: Whiteboard[];
	renamed_whiteboards: { id: string; title: string }[];
	deleted_whiteboards: string[]; // IDs
	opened_whiteboard: string | null; // ID of whiteboard to open in UI
	updated_whiteboards: { id: string; state: WhiteboardState }[];
}

/**
 * Create empty mutations object
 */
export function createEmptyWhiteboardMutations(): WhiteboardMutations {
	return {
		created_whiteboards: [],
		renamed_whiteboards: [],
		deleted_whiteboards: [],
		opened_whiteboard: null,
		updated_whiteboards: []
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

		case 'update_whiteboard':
			return executeUpdateWhiteboard(input, context, mutations);

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
			.from('canvas_whiteboard')
			.insert({
				user_id: userId,
				title
			})
			.select('id, title, created_at, updated_at')
			.single();

		if (error) throw error;

		// Verify the created whiteboard matches what was requested
		if (data.title !== title) {
			return {
				success: false,
				message: `Create failed: whiteboard title "${data.title}" does not match requested "${title}".`,
				data: { id: data.id, title: data.title }
			};
		}

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
			.from('canvas_whiteboard')
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

		const oldTitle = existing.title;

		const { data: updated, error } = await supabase
			.from('canvas_whiteboard')
			.update({
				title: newTitle,
				updated_at: new Date().toISOString()
			})
			.eq('id', whiteboardId)
			.eq('user_id', userId)
			.select('title')
			.single();

		if (error) throw error;

		// Verify the update actually happened
		if (!updated || updated.title !== newTitle) {
			return {
				success: false,
				message: `Rename failed: title did not update. Check database permissions.`
			};
		}

		mutations.renamed_whiteboards.push({ id: whiteboardId, title: newTitle });

		return {
			success: true,
			message: `Renamed whiteboard from "${oldTitle}" to "${newTitle}"`,
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
			.from('canvas_whiteboard')
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
			.from('canvas_whiteboard')
			.delete()
			.eq('id', whiteboardId)
			.eq('user_id', userId)

		if (error) throw error;

		// Verify deletion - record should no longer exist
		const { data: stillExists } = await supabase
			.from('canvas_whiteboard')
			.select('id')
			.eq('id', whiteboardId)
			.eq('user_id', userId)
			.single();

		if (stillExists) {
			return {
				success: false,
				message: `Delete failed: whiteboard still exists. Check database permissions.`
			};
		}

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
			.from('canvas_whiteboard')
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
			.from('canvas_whiteboard')
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
 * Update Whiteboard Executor
 */
async function executeUpdateWhiteboard(
	input: Record<string, unknown>,
	context: WhiteboardToolContext,
	mutations: WhiteboardMutations
): Promise<ToolExecutionResult> {
	try {
		const { supabase, userId } = context;
		const whiteboardId = input.whiteboard_id as string;
		const render = input.render as RenderElement[];
		const semantic = input.semantic as Record<string, unknown>;

		// Verify whiteboard exists and belongs to user
		const { data: existing, error: fetchError } = await supabase
			.from('canvas_whiteboard')
			.select('title, state')
			.eq('id', whiteboardId)
			.eq('user_id', userId)
			.single();

		if (fetchError || !existing) {
			return {
				success: false,
				message: 'Whiteboard not found'
			};
		}

		// Preserve viewport from existing state
		const existingState = existing.state as WhiteboardState | null;
		const viewport = existingState?.viewport || { x: 0, y: 0, scale: 1 };

		const newState: WhiteboardState = {
			render,
			semantic,
			viewport
		};

		const { data: updated, error } = await supabase
			.from('canvas_whiteboard')
			.update({
				state: newState,
				updated_at: new Date().toISOString()
			})
			.eq('id', whiteboardId)
			.eq('user_id', userId)
			.select('state')
			.single();

		if (error) throw error;

		// Verify the update actually happened
		if (!updated || !updated.state) {
			return {
				success: false,
				message: `Update failed: state did not save. Check database permissions.`
			};
		}

		// Verify render array length matches (basic sanity check)
		const savedRender = (updated.state as WhiteboardState).render;
		if (!savedRender || savedRender.length !== render.length) {
			return {
				success: false,
				message: `Update failed: expected ${render.length} elements, got ${savedRender?.length || 0}`
			};
		}

		// Add to mutations for UI update
		mutations.updated_whiteboards.push({ id: whiteboardId, state: newState });
		// Also open this whiteboard so user sees the changes
		mutations.opened_whiteboard = whiteboardId;

		return {
			success: true,
			message: `Updated whiteboard "${existing.title}" with ${render.length} elements`,
			data: { id: whiteboardId, elementCount: render.length }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to update whiteboard: ${error instanceof Error ? error.message : 'Unknown error'}`
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
		'list_whiteboards',
		'update_whiteboard'
	].includes(toolName);
}
