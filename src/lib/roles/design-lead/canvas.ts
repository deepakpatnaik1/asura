/**
 * Role: Design Lead - Canvas Responsibility
 *
 * Canvas CRUD operations for Eva.
 * Tools for managing designer canvases.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ============================================================================
// Types
// ============================================================================

/**
 * Structured prompt text for prompt elements
 */
export interface PromptText {
	setting?: string;
	clothing?: string;
	pose?: string;
	expression?: string;
}

export type RenderElement = {
	id: string;
	type: 'note' | 'label' | 'line' | 'arrow' | 'group' | 'image' | 'text' | 'prompt';
	code: string; // 3-char alphanumeric reference code (e.g., "A7K")
	x?: number;
	y?: number;
	text?: string | PromptText;
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
	thumbnail_url?: string;
	prompt?: string;
	seed?: number;
	model?: string;
	role?: string;
	// Character element properties
	field?: 'name' | 'personality' | 'voice' | 'backstory' | 'appearance';
	promptIndex?: number;
	sourcePromptCode?: string;
};

export interface CanvasState {
	render: RenderElement[];
	semantic: Record<string, unknown>;
	viewport: { x: number; y: number; scale: number };
}

export interface DesignerCanvas {
	id: string;
	title: string;
	state?: CanvasState;
	created_at: string;
	updated_at: string;
}

export interface CanvasMutations {
	created_canvases: DesignerCanvas[];
	renamed_canvases: { id: string; title: string }[];
	deleted_canvases: string[];
	opened_canvas: string | null;
	closed_canvas: string | null;
	updated_canvases: { id: string; state: CanvasState }[];
}

export interface CanvasToolResult {
	success: boolean;
	message: string;
	data?: unknown;
	mutations?: CanvasMutations;
}

// ============================================================================
// Tool Definitions
// ============================================================================

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

// ============================================================================
// Helpers
// ============================================================================

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

// ============================================================================
// Executors
// ============================================================================

async function executeCreateCanvas(
	input: Record<string, unknown>,
	userId: string,
	mutations: CanvasMutations
): Promise<CanvasToolResult> {
	try {
		const title = (input.title as string).trim();

		if (!title) {
			return { success: false, message: 'Title cannot be empty' };
		}

		if (title.length > 255) {
			return { success: false, message: 'Title must be 255 characters or less' };
		}

		const { data, error } = await supabase
			.from('canvas_designer')
			.insert({ user_id: userId, title })
			.select('id, title, created_at, updated_at')
			.single();

		if (error) throw error;

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
		mutations.opened_canvas = canvas.id;

		return {
			success: true,
			message: `Created canvas "${title}"`,
			data: canvas,
			mutations
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to create canvas: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

async function executeRenameCanvas(
	input: Record<string, unknown>,
	userId: string,
	mutations: CanvasMutations
): Promise<CanvasToolResult> {
	try {
		const canvasId = input.canvas_id as string;
		const newTitle = (input.title as string).trim();

		if (!newTitle) {
			return { success: false, message: 'Title cannot be empty' };
		}

		if (newTitle.length > 255) {
			return { success: false, message: 'Title must be 255 characters or less' };
		}

		const { data: existing, error: fetchError } = await supabase
			.from('canvas_designer')
			.select('title')
			.eq('id', canvasId)
			.eq('user_id', userId)
			.single();

		if (fetchError || !existing) {
			return { success: false, message: 'Canvas not found' };
		}

		const oldTitle = existing.title;

		const { data: updated, error } = await supabase
			.from('canvas_designer')
			.update({ title: newTitle, updated_at: new Date().toISOString() })
			.eq('id', canvasId)
			.eq('user_id', userId)
			.select('title')
			.single();

		if (error) throw error;

		if (!updated || updated.title !== newTitle) {
			return { success: false, message: `Rename failed: title did not update.` };
		}

		mutations.renamed_canvases.push({ id: canvasId, title: newTitle });

		return {
			success: true,
			message: `Renamed canvas from "${oldTitle}" to "${newTitle}"`,
			data: { id: canvasId, title: newTitle },
			mutations
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to rename canvas: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

async function executeDeleteCanvas(
	input: Record<string, unknown>,
	userId: string,
	mutations: CanvasMutations
): Promise<CanvasToolResult> {
	try {
		const canvasId = input.canvas_id as string;

		const { data: canvas, error: fetchError } = await supabase
			.from('canvas_designer')
			.select('title')
			.eq('id', canvasId)
			.eq('user_id', userId)
			.single();

		if (fetchError || !canvas) {
			return { success: false, message: 'Canvas not found' };
		}

		const { error } = await supabase
			.from('canvas_designer')
			.delete()
			.eq('id', canvasId)
			.eq('user_id', userId);

		if (error) throw error;

		// Verify deletion
		const { data: stillExists } = await supabase
			.from('canvas_designer')
			.select('id')
			.eq('id', canvasId)
			.eq('user_id', userId)
			.single();

		if (stillExists) {
			return { success: false, message: `Delete failed: canvas still exists.` };
		}

		mutations.deleted_canvases.push(canvasId);

		return {
			success: true,
			message: `Deleted canvas "${canvas.title}"`,
			data: { id: canvasId },
			mutations
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to delete canvas: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

async function executeOpenCanvas(
	input: Record<string, unknown>,
	userId: string,
	mutations: CanvasMutations
): Promise<CanvasToolResult> {
	try {
		const canvasId = input.canvas_id as string;

		const { data: canvas, error } = await supabase
			.from('canvas_designer')
			.select('id, title')
			.eq('id', canvasId)
			.eq('user_id', userId)
			.single();

		if (error || !canvas) {
			return { success: false, message: 'Canvas not found' };
		}

		mutations.opened_canvas = canvasId;

		return {
			success: true,
			message: `Opening canvas "${canvas.title}"`,
			data: { id: canvasId, title: canvas.title },
			mutations
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to open canvas: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

async function executeCloseCanvas(
	input: Record<string, unknown>,
	userId: string,
	mutations: CanvasMutations
): Promise<CanvasToolResult> {
	try {
		const canvasId = input.canvas_id as string;

		const { data: canvas, error } = await supabase
			.from('canvas_designer')
			.select('id, title')
			.eq('id', canvasId)
			.eq('user_id', userId)
			.single();

		if (error || !canvas) {
			return { success: false, message: 'Canvas not found' };
		}

		mutations.closed_canvas = canvasId;

		return {
			success: true,
			message: `Closed canvas "${canvas.title}"`,
			data: { id: canvasId, title: canvas.title },
			mutations
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to close canvas: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

async function executeListCanvases(userId: string): Promise<CanvasToolResult> {
	try {
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

async function executeUpdateCanvas(
	input: Record<string, unknown>,
	userId: string,
	mutations: CanvasMutations
): Promise<CanvasToolResult> {
	try {
		const canvasId = input.canvas_id as string;

		if (!canvasId) {
			return {
				success: false,
				message: 'Missing canvas_id. Use: { "canvas_id": "uuid", "render": [...], "semantic": {...} }'
			};
		}

		const render = Array.isArray(input.render) ? (input.render as RenderElement[]) : [];
		const semantic = (input.semantic as Record<string, unknown>)
			|| (input.content as Record<string, unknown>)
			|| {};

		const { data: existing, error: fetchError } = await supabase
			.from('canvas_designer')
			.select('title, state')
			.eq('id', canvasId)
			.eq('user_id', userId)
			.single();

		if (fetchError || !existing) {
			return { success: false, message: 'Canvas not found' };
		}

		const existingState = existing.state as CanvasState | null;
		const viewport = existingState?.viewport || { x: 0, y: 0, scale: 1 };

		const newState: CanvasState = { render, semantic, viewport };

		const { data: updated, error } = await supabase
			.from('canvas_designer')
			.update({ state: newState, updated_at: new Date().toISOString() })
			.eq('id', canvasId)
			.eq('user_id', userId)
			.select('state')
			.single();

		if (error) throw error;

		if (!updated || !updated.state) {
			return { success: false, message: `Update failed: state did not save.` };
		}

		const savedRender = (updated.state as CanvasState).render;
		if (!savedRender || savedRender.length !== render.length) {
			return {
				success: false,
				message: `Update failed: expected ${render.length} elements, got ${savedRender?.length || 0}`
			};
		}

		mutations.updated_canvases.push({ id: canvasId, state: newState });
		mutations.opened_canvas = canvasId;

		return {
			success: true,
			message: `Updated canvas "${existing.title}" with ${render.length} elements`,
			data: { id: canvasId, elementCount: render.length },
			mutations
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to update canvas: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

async function executeDeleteElement(
	input: Record<string, unknown>,
	userId: string,
	mutations: CanvasMutations
): Promise<CanvasToolResult> {
	try {
		const canvasId = input.canvas_id as string;
		const elementCode = (input.element_code as string)?.toUpperCase();

		if (!canvasId || !elementCode) {
			return { success: false, message: 'Missing canvas_id or element_code' };
		}

		const { data: canvas, error: fetchError } = await supabase
			.from('canvas_designer')
			.select('title, state')
			.eq('id', canvasId)
			.eq('user_id', userId)
			.single();

		if (fetchError || !canvas) {
			return { success: false, message: 'Canvas not found' };
		}

		const currentState = canvas.state as CanvasState | null;
		const currentRender = currentState?.render || [];

		const elementIndex = currentRender.findIndex(
			(el) => el.code?.toUpperCase() === elementCode
		);

		if (elementIndex === -1) {
			return {
				success: false,
				message: `Element with code "${elementCode}" not found in canvas`
			};
		}

		const newRender = [
			...currentRender.slice(0, elementIndex),
			...currentRender.slice(elementIndex + 1)
		];

		const newState: CanvasState = {
			render: newRender,
			semantic: currentState?.semantic || {},
			viewport: currentState?.viewport || { x: 0, y: 0, scale: 1 }
		};

		const { error: updateError } = await supabase
			.from('canvas_designer')
			.update({ state: newState, updated_at: new Date().toISOString() })
			.eq('id', canvasId)
			.eq('user_id', userId);

		if (updateError) throw updateError;

		// Verify deletion
		const { data: verifyCanvas, error: verifyError } = await supabase
			.from('canvas_designer')
			.select('state')
			.eq('id', canvasId)
			.eq('user_id', userId)
			.single();

		if (verifyError || !verifyCanvas) {
			return { success: false, message: `Delete verification failed: could not re-fetch canvas` };
		}

		const verifyState = verifyCanvas.state as CanvasState | null;
		const verifyRender = verifyState?.render || [];
		const stillExists = verifyRender.some((el) => el.code?.toUpperCase() === elementCode);

		if (stillExists) {
			return {
				success: false,
				message: `Delete failed: element ${elementCode} still exists.`
			};
		}

		mutations.updated_canvases.push({ id: canvasId, state: newState });

		return {
			success: true,
			message: `Deleted element ${elementCode} from canvas "${canvas.title}"`,
			data: { canvas_id: canvasId, deleted_code: elementCode, remaining_elements: newRender.length },
			mutations
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to delete element: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

// ============================================================================
// Main Dispatcher
// ============================================================================

export async function executeCanvasTool(
	toolName: string,
	input: Record<string, unknown>,
	userId: string
): Promise<CanvasToolResult> {
	const mutations = createEmptyCanvasMutations();

	switch (toolName) {
		case 'create_canvas':
			return executeCreateCanvas(input, userId, mutations);
		case 'rename_canvas':
			return executeRenameCanvas(input, userId, mutations);
		case 'delete_canvas':
			return executeDeleteCanvas(input, userId, mutations);
		case 'open_canvas':
			return executeOpenCanvas(input, userId, mutations);
		case 'close_canvas':
			return executeCloseCanvas(input, userId, mutations);
		case 'list_canvases':
			return executeListCanvases(userId);
		case 'update_canvas':
			return executeUpdateCanvas(input, userId, mutations);
		case 'delete_element':
			return executeDeleteElement(input, userId, mutations);
		default:
			return { success: false, message: `Unknown canvas tool: ${toolName}` };
	}
}
