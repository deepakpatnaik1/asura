/**
 * Canvas Tools for Eva (Character Designer)
 *
 * Tool definitions and executors for canvas operations.
 * These tools allow Eva to create character design canvases
 * separate from Gunnar's whiteboards.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Tool Definitions
 */

export const CREATE_CANVAS_TOOL: Anthropic.Tool = {
	name: 'create_canvas',
	description:
		'Create a new canvas for character design. Use this when starting a new character - each canvas represents one character with their images, backstory, and system prompt.',
	input_schema: {
		type: 'object',
		properties: {
			title: {
				type: 'string',
				description: 'The character name or canvas title. Choose the character name you want to design.'
			}
		},
		required: ['title']
	}
};

export const RENAME_CANVAS_TOOL: Anthropic.Tool = {
	name: 'rename_canvas',
	description: 'Rename an existing canvas. Use this when the character name changes or to update the canvas title.',
	input_schema: {
		type: 'object',
		properties: {
			canvas_id: {
				type: 'string',
				description: 'The UUID of the canvas to rename'
			},
			title: {
				type: 'string',
				description: 'The new title/character name for the canvas'
			}
		},
		required: ['canvas_id', 'title']
	}
};

export const DELETE_CANVAS_TOOL: Anthropic.Tool = {
	name: 'delete_canvas',
	description: 'Delete a canvas permanently. Use this to remove a character design that is no longer needed.',
	input_schema: {
		type: 'object',
		properties: {
			canvas_id: {
				type: 'string',
				description: 'The UUID of the canvas to delete'
			}
		},
		required: ['canvas_id']
	}
};

export const OPEN_CANVAS_TOOL: Anthropic.Tool = {
	name: 'open_canvas',
	description:
		'Open/switch to a specific canvas. Use this when the user wants to view or work on a particular character design.',
	input_schema: {
		type: 'object',
		properties: {
			canvas_id: {
				type: 'string',
				description: 'The UUID of the canvas to open'
			}
		},
		required: ['canvas_id']
	}
};

export const LIST_CANVASES_TOOL: Anthropic.Tool = {
	name: 'list_canvases',
	description:
		'List all available character canvases. Use this to show the user their character designs or to help them choose which one to work on.',
	input_schema: {
		type: 'object',
		properties: {},
		required: []
	}
};

export const UPDATE_CANVAS_TOOL: Anthropic.Tool = {
	name: 'update_canvas',
	description:
		'Update a canvas with new elements (images, notes, backstory). Use this after generating images or when adding character details to the canvas.',
	input_schema: {
		type: 'object',
		properties: {
			canvas_id: {
				type: 'string',
				description: 'The UUID of the canvas to update'
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
						role: { type: 'string', description: 'Image purpose: hero, card, gallery, expression' }
					},
					required: ['id', 'type']
				}
			},
			semantic: {
				type: 'object',
				description:
					'Structured character data: name, age, tagline, tags, backstory, system_prompt, and image role mappings.'
			}
		},
		required: ['canvas_id', 'render', 'semantic']
	}
};

/**
 * All canvas tools
 */
export const CANVAS_TOOLS: Anthropic.Tool[] = [
	CREATE_CANVAS_TOOL,
	RENAME_CANVAS_TOOL,
	DELETE_CANVAS_TOOL,
	OPEN_CANVAS_TOOL,
	LIST_CANVASES_TOOL,
	UPDATE_CANVAS_TOOL
];

/**
 * Context for tool execution
 */
export interface CanvasToolContext {
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
 * Canvas type for mutations payload
 */
export interface Canvas {
	id: string;
	title: string;
	created_at: string;
	updated_at: string;
}

/**
 * Render element types (same as whiteboard)
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
	src?: string;
	prompt?: string;
	seed?: number;
	model?: string;
	role?: string; // 'hero' | 'card' | 'gallery' | 'expression'
};

/**
 * Canvas state with dual-layer model
 */
export interface CanvasState {
	render: RenderElement[];
	semantic: Record<string, unknown>;
	viewport: { x: number; y: number; scale: number };
}

/**
 * Mutations payload returned with chat response
 */
export interface CanvasMutations {
	created_canvases: Canvas[];
	renamed_canvases: { id: string; title: string }[];
	deleted_canvases: string[]; // IDs
	opened_canvas: string | null; // ID of canvas to open in UI
	updated_canvases: { id: string; state: CanvasState }[];
}

/**
 * Create empty mutations object
 */
export function createEmptyCanvasMutations(): CanvasMutations {
	return {
		created_canvases: [],
		renamed_canvases: [],
		deleted_canvases: [],
		opened_canvas: null,
		updated_canvases: []
	};
}

/**
 * Execute a canvas tool
 */
export async function executeCanvasTool(
	toolName: string,
	input: Record<string, unknown>,
	context: CanvasToolContext,
	mutations: CanvasMutations
): Promise<ToolExecutionResult> {
	switch (toolName) {
		case 'create_canvas':
			return executeCreateCanvas(input, context, mutations);

		case 'rename_canvas':
			return executeRenameCanvas(input, context, mutations);

		case 'delete_canvas':
			return executeDeleteCanvas(input, context, mutations);

		case 'open_canvas':
			return executeOpenCanvas(input, context, mutations);

		case 'list_canvases':
			return executeListCanvases(context);

		case 'update_canvas':
			return executeUpdateCanvas(input, context, mutations);

		default:
			return {
				success: false,
				message: `Unknown canvas tool: ${toolName}`
			};
	}
}

/**
 * Create Canvas Executor
 */
async function executeCreateCanvas(
	input: Record<string, unknown>,
	context: CanvasToolContext,
	mutations: CanvasMutations
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
			.from('canvases')
			.insert({
				user_id: userId,
				title
			})
			.select('id, title, created_at, updated_at')
			.single();

		if (error) throw error;

		const canvas: Canvas = {
			id: data.id,
			title: data.title,
			created_at: data.created_at,
			updated_at: data.updated_at
		};

		mutations.created_canvases.push(canvas);
		// Auto-open newly created canvas
		mutations.opened_canvas = canvas.id;

		return {
			success: true,
			message: `Created canvas "${title}" for character design`,
			data: canvas
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to create canvas: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Rename Canvas Executor
 */
async function executeRenameCanvas(
	input: Record<string, unknown>,
	context: CanvasToolContext,
	mutations: CanvasMutations
): Promise<ToolExecutionResult> {
	try {
		const { supabase, userId } = context;
		const canvasId = input.canvas_id as string;
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
			.from('canvases')
			.select('title')
			.eq('id', canvasId)
			.eq('user_id', userId)
			.single();

		if (fetchError || !existing) {
			return {
				success: false,
				message: 'Canvas not found'
			};
		}

		const { error } = await supabase
			.from('canvases')
			.update({
				title: newTitle,
				updated_at: new Date().toISOString()
			})
			.eq('id', canvasId)
			.eq('user_id', userId);

		if (error) throw error;

		mutations.renamed_canvases.push({ id: canvasId, title: newTitle });

		return {
			success: true,
			message: `Renamed character from "${existing.title}" to "${newTitle}"`,
			data: { id: canvasId, title: newTitle }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to rename canvas: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Delete Canvas Executor
 */
async function executeDeleteCanvas(
	input: Record<string, unknown>,
	context: CanvasToolContext,
	mutations: CanvasMutations
): Promise<ToolExecutionResult> {
	try {
		const { supabase, userId } = context;
		const canvasId = input.canvas_id as string;

		// Get title before deleting
		const { data: canvas, error: fetchError } = await supabase
			.from('canvases')
			.select('title')
			.eq('id', canvasId)
			.eq('user_id', userId)
			.single();

		if (fetchError || !canvas) {
			return {
				success: false,
				message: 'Canvas not found'
			};
		}

		const { error } = await supabase
			.from('canvases')
			.delete()
			.eq('id', canvasId)
			.eq('user_id', userId);

		if (error) throw error;

		mutations.deleted_canvases.push(canvasId);

		return {
			success: true,
			message: `Deleted canvas "${canvas.title}"`,
			data: { id: canvasId }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to delete canvas: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Open Canvas Executor
 */
async function executeOpenCanvas(
	input: Record<string, unknown>,
	context: CanvasToolContext,
	mutations: CanvasMutations
): Promise<ToolExecutionResult> {
	try {
		const { supabase, userId } = context;
		const canvasId = input.canvas_id as string;

		// Verify canvas exists and belongs to user
		const { data: canvas, error } = await supabase
			.from('canvases')
			.select('id, title')
			.eq('id', canvasId)
			.eq('user_id', userId)
			.single();

		if (error || !canvas) {
			return {
				success: false,
				message: 'Canvas not found'
			};
		}

		// Set this as the canvas to open in UI
		mutations.opened_canvas = canvasId;

		return {
			success: true,
			message: `Opening canvas "${canvas.title}"`,
			data: { id: canvasId, title: canvas.title }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to open canvas: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * List Canvases Executor
 */
async function executeListCanvases(context: CanvasToolContext): Promise<ToolExecutionResult> {
	try {
		const { supabase, userId } = context;

		const { data: canvases, error } = await supabase
			.from('canvases')
			.select('id, title, created_at, updated_at')
			.eq('user_id', userId)
			.order('updated_at', { ascending: false });

		if (error) throw error;

		if (!canvases || canvases.length === 0) {
			return {
				success: true,
				message: 'No character canvases found. You can ask me to create one for a new character.',
				data: { canvases: [] }
			};
		}

		const list = canvases
			.map((c, i) => `${i + 1}. "${c.title}" (id: ${c.id})`)
			.join('\n');

		return {
			success: true,
			message: `Found ${canvases.length} character canvas(es):\n${list}`,
			data: { canvases }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to list canvases: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Update Canvas Executor
 */
async function executeUpdateCanvas(
	input: Record<string, unknown>,
	context: CanvasToolContext,
	mutations: CanvasMutations
): Promise<ToolExecutionResult> {
	try {
		const { supabase, userId } = context;
		const canvasId = input.canvas_id as string;
		const render = input.render as RenderElement[];
		const semantic = input.semantic as Record<string, unknown>;

		// Verify canvas exists and belongs to user
		const { data: existing, error: fetchError } = await supabase
			.from('canvases')
			.select('title, state')
			.eq('id', canvasId)
			.eq('user_id', userId)
			.single();

		if (fetchError || !existing) {
			return {
				success: false,
				message: 'Canvas not found'
			};
		}

		// Preserve viewport from existing state
		const existingState = existing.state as CanvasState | null;
		const viewport = existingState?.viewport || { x: 0, y: 0, scale: 1 };

		const newState: CanvasState = {
			render,
			semantic,
			viewport
		};

		const { error } = await supabase
			.from('canvases')
			.update({
				state: newState,
				updated_at: new Date().toISOString()
			})
			.eq('id', canvasId)
			.eq('user_id', userId);

		if (error) throw error;

		// Add to mutations for UI update
		mutations.updated_canvases.push({ id: canvasId, state: newState });
		// Also open this canvas so user sees the changes
		mutations.opened_canvas = canvasId;

		return {
			success: true,
			message: `Updated canvas "${existing.title}" with ${render.length} elements`,
			data: { id: canvasId, elementCount: render.length }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to update canvas: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Check if a tool name is a canvas tool
 */
export function isCanvasTool(toolName: string): boolean {
	return [
		'create_canvas',
		'rename_canvas',
		'delete_canvas',
		'open_canvas',
		'list_canvases',
		'update_canvas'
	].includes(toolName);
}
