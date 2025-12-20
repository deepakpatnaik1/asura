/**
 * Canvas Tools for Eva
 * Uses canvas_designer table
 *
 * Tool definitions and executors for designer canvas operations.
 * These tools allow Eva to create, rename, delete, and open designer canvases.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Tool Definitions
 */

export const CREATE_CANVAS_TOOL: Anthropic.Tool = {
	name: 'create_canvas',
	description:
		'Create a new designer canvas for visual character design. Use this when the user wants to start a new canvas for character mood boards, notes, or design explorations.',
	input_schema: {
		type: 'object',
		properties: {
			title: {
				type: 'string',
				description: 'The title for the canvas. Choose something descriptive that captures the character or design concept.'
			}
		},
		required: ['title']
	}
};

export const RENAME_CANVAS_TOOL: Anthropic.Tool = {
	name: 'rename_canvas',
	description: 'Rename an existing designer canvas. Use this when the user wants to change the title of a canvas.',
	input_schema: {
		type: 'object',
		properties: {
			canvas_id: {
				type: 'string',
				description: 'The UUID of the canvas to rename'
			},
			title: {
				type: 'string',
				description: 'The new title for the canvas'
			}
		},
		required: ['canvas_id', 'title']
	}
};

export const DELETE_CANVAS_TOOL: Anthropic.Tool = {
	name: 'delete_canvas',
	description: 'Delete a designer canvas permanently. Use this when the user wants to remove a canvas they no longer need.',
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
		'Open/switch to a specific designer canvas. Use this when the user wants to view or work on a particular canvas. The UI will display it.',
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
		'List all available designer canvases for the user. Use this to show the user their canvases or to help them choose which one to open.',
	input_schema: {
		type: 'object',
		properties: {},
		required: []
	}
};

export const CLOSE_CANVAS_TOOL: Anthropic.Tool = {
	name: 'close_canvas',
	description:
		'Close/deselect a designer canvas. The canvas remains available but is removed from the active context. Use this when the user wants to stop working on a canvas without deleting it.',
	input_schema: {
		type: 'object',
		properties: {
			canvas_id: {
				type: 'string',
				description: 'The UUID of the canvas to close'
			}
		},
		required: ['canvas_id']
	}
};

export const DELETE_ELEMENT_TOOL: Anthropic.Tool = {
	name: 'delete_element',
	description:
		'Delete a single element from a canvas by its code. Use this when the user wants to remove a specific image or element.',
	input_schema: {
		type: 'object',
		properties: {
			canvas_id: {
				type: 'string',
				description: 'The UUID of the canvas containing the element'
			},
			element_code: {
				type: 'string',
				description: 'The 3-character code of the element to delete (e.g., "FX9", "MLF")'
			}
		},
		required: ['canvas_id', 'element_code']
	}
};

export const UPDATE_CANVAS_TOOL: Anthropic.Tool = {
	name: 'update_canvas',
	description:
		'Update a designer canvas with new render elements and semantic structure. Use this to add, modify, or remove visual elements on the canvas.',
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
						role: { type: 'string', description: 'Image purpose: hero, gallery, expression' }
					},
					required: ['id', 'type']
				}
			},
			semantic: {
				type: 'object',
				description:
					'Free-form semantic structure describing what the canvas represents. Define character traits, relationships, mood as needed.'
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
	CLOSE_CANVAS_TOOL,
	LIST_CANVASES_TOOL,
	UPDATE_CANVAS_TOOL,
	DELETE_ELEMENT_TOOL
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
export interface DesignerCanvas {
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
	type: 'note' | 'label' | 'line' | 'arrow' | 'group' | 'image' | 'text' | 'prompt';
	code: string; // 3-char alphanumeric reference code (e.g., "A7K") - required
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
	thumbnail_url?: string; // Thumbnail URL
	prompt?: string; // Generation prompt (for iteration)
	seed?: number; // For consistent generations
	model?: string; // Which model generated it
	role?: string; // 'hero' | 'gallery' | 'expression' etc.
	// Character element properties
	field?: 'name' | 'personality' | 'voice' | 'backstory' | 'appearance'; // For text elements
	promptIndex?: number; // For prompt elements: 0, 1, 2
	sourcePromptCode?: string; // For images: links back to prompt element
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
	created_canvases: DesignerCanvas[];
	renamed_canvases: { id: string; title: string }[];
	deleted_canvases: string[]; // IDs
	opened_canvas: string | null; // ID of canvas to open in UI
	closed_canvas: string | null; // ID of canvas to close/deselect
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
		closed_canvas: null,
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

		case 'close_canvas':
			return executeCloseCanvas(input, context, mutations);

		case 'list_canvases':
			return executeListCanvases(context);

		case 'update_canvas':
			return executeUpdateCanvas(input, context, mutations);

		case 'delete_element':
			return executeDeleteElement(input, context, mutations);

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
			.from('canvas_designer')
			.insert({
				user_id: userId,
				title
			})
			.select('id, title, created_at, updated_at')
			.single();

		if (error) throw error;

		// Verify the created canvas matches what was requested
		if (data.title !== title) {
			return {
				success: false,
				message: `Create failed: canvas title "${data.title}" does not match requested "${title}".`,
				data: { id: data.id, title: data.title }
			};
		}

		const canvas: DesignerCanvas = {
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
			message: `Created canvas "${title}"`,
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
			.from('canvas_designer')
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

		const oldTitle = existing.title;

		const { data: updated, error } = await supabase
			.from('canvas_designer')
			.update({
				title: newTitle,
				updated_at: new Date().toISOString()
			})
			.eq('id', canvasId)
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

		mutations.renamed_canvases.push({ id: canvasId, title: newTitle });

		return {
			success: true,
			message: `Renamed canvas from "${oldTitle}" to "${newTitle}"`,
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
			.from('canvas_designer')
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
			.from('canvas_designer')
			.delete()
			.eq('id', canvasId)
			.eq('user_id', userId);

		if (error) throw error;

		// Verify deletion - record should no longer exist
		const { data: stillExists } = await supabase
			.from('canvas_designer')
			.select('id')
			.eq('id', canvasId)
			.eq('user_id', userId)
			.single();

		if (stillExists) {
			return {
				success: false,
				message: `Delete failed: canvas still exists. Check database permissions.`
			};
		}

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
			.from('canvas_designer')
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
 * Close Canvas Executor
 */
async function executeCloseCanvas(
	input: Record<string, unknown>,
	context: CanvasToolContext,
	mutations: CanvasMutations
): Promise<ToolExecutionResult> {
	try {
		const { supabase, userId } = context;
		const canvasId = input.canvas_id as string;

		// Verify canvas exists and belongs to user
		const { data: canvas, error } = await supabase
			.from('canvas_designer')
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

		// Set this as the canvas to close in UI
		mutations.closed_canvas = canvasId;

		return {
			success: true,
			message: `Closed canvas "${canvas.title}"`,
			data: { id: canvasId, title: canvas.title }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to close canvas: ${error instanceof Error ? error.message : 'Unknown error'}`
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
			.from('canvas_designer')
			.select('id, title, created_at, updated_at')
			.eq('user_id', userId)
			.order('updated_at', { ascending: false });

		if (error) throw error;

		if (!canvases || canvases.length === 0) {
			return {
				success: true,
				message: 'No canvases found. You can ask me to create one.',
				data: { canvases: [] }
			};
		}

		const list = canvases
			.map((c, i) => `${i + 1}. "${c.title}" (id: ${c.id})`)
			.join('\n');

		return {
			success: true,
			message: `Found ${canvases.length} canvas(es):\n${list}`,
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

		// Validate required params
		if (!canvasId) {
			return {
				success: false,
				message: 'Missing canvas_id. Use: { "canvas_id": "uuid", "render": [...], "semantic": {...} }'
			};
		}

		// Default to empty array/object if not provided
		// Accept 'content' as alias for 'semantic' (common LLM mistake)
		const render = Array.isArray(input.render) ? (input.render as RenderElement[]) : [];
		const semantic = (input.semantic as Record<string, unknown>)
			|| (input.content as Record<string, unknown>)
			|| {};

		// Verify canvas exists and belongs to user
		const { data: existing, error: fetchError } = await supabase
			.from('canvas_designer')
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

		const { data: updated, error } = await supabase
			.from('canvas_designer')
			.update({
				state: newState,
				updated_at: new Date().toISOString()
			})
			.eq('id', canvasId)
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
		const savedRender = (updated.state as CanvasState).render;
		if (!savedRender || savedRender.length !== render.length) {
			return {
				success: false,
				message: `Update failed: expected ${render.length} elements, got ${savedRender?.length || 0}`
			};
		}

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
 * Delete Element Executor
 */
async function executeDeleteElement(
	input: Record<string, unknown>,
	context: CanvasToolContext,
	mutations: CanvasMutations
): Promise<ToolExecutionResult> {
	try {
		const { supabase, userId } = context;
		const canvasId = input.canvas_id as string;
		const elementCode = (input.element_code as string)?.toUpperCase();

		if (!canvasId || !elementCode) {
			return {
				success: false,
				message: 'Missing canvas_id or element_code'
			};
		}

		// Get current canvas state
		const { data: canvas, error: fetchError } = await supabase
			.from('canvas_designer')
			.select('title, state')
			.eq('id', canvasId)
			.eq('user_id', userId)
			.single();

		if (fetchError || !canvas) {
			return {
				success: false,
				message: 'Canvas not found'
			};
		}

		const currentState = canvas.state as CanvasState | null;
		const currentRender = currentState?.render || [];

		// Find the element by code
		const elementIndex = currentRender.findIndex(
			(el) => el.code?.toUpperCase() === elementCode
		);

		if (elementIndex === -1) {
			return {
				success: false,
				message: `Element with code "${elementCode}" not found in canvas`
			};
		}

		// Remove the element
		const newRender = [
			...currentRender.slice(0, elementIndex),
			...currentRender.slice(elementIndex + 1)
		];

		const newState: CanvasState = {
			render: newRender,
			semantic: currentState?.semantic || {},
			viewport: currentState?.viewport || { x: 0, y: 0, scale: 1 }
		};

		// Save updated state
		const { error: updateError } = await supabase
			.from('canvas_designer')
			.update({
				state: newState,
				updated_at: new Date().toISOString()
			})
			.eq('id', canvasId)
			.eq('user_id', userId);

		if (updateError) throw updateError;

		// Verify the element was actually removed
		const { data: verifyCanvas, error: verifyError } = await supabase
			.from('canvas_designer')
			.select('state')
			.eq('id', canvasId)
			.eq('user_id', userId)
			.single();

		if (verifyError || !verifyCanvas) {
			return {
				success: false,
				message: `Delete verification failed: could not re-fetch canvas`
			};
		}

		const verifyState = verifyCanvas.state as CanvasState | null;
		const verifyRender = verifyState?.render || [];
		const stillExists = verifyRender.some((el) => el.code?.toUpperCase() === elementCode);

		if (stillExists) {
			return {
				success: false,
				message: `Delete failed: element ${elementCode} still exists. Check database permissions.`
			};
		}

		// Add to mutations for UI update
		mutations.updated_canvases.push({ id: canvasId, state: newState });

		return {
			success: true,
			message: `Deleted element ${elementCode} from canvas "${canvas.title}"`,
			data: { canvas_id: canvasId, deleted_code: elementCode, remaining_elements: newRender.length }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to delete element: ${error instanceof Error ? error.message : 'Unknown error'}`
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
		'close_canvas',
		'list_canvases',
		'update_canvas',
		'delete_element'
	].includes(toolName);
}
