/**
 * Role: Design Lead - Generation Responsibility
 *
 * Standalone image generation and editing workflow for Eva.
 * Uses the image-models channel for API calls.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import {
	generateImage,
	editImage,
	type ImageGenParams
} from '$lib/channels/image-models';
import sharp from 'sharp';
import {
	type CanvasState,
	type CanvasMutations,
	createEmptyCanvasMutations
} from './canvas';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ============================================================================
// Constants
// ============================================================================

const CODE_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ============================================================================
// Types
// ============================================================================

export interface GenerationToolContext {
	userId: string;
	imageGenModel: string;
	imageEditModel?: string;
}

export interface GenerationToolResult {
	success: boolean;
	message: string;
	data?: unknown;
	mutations?: CanvasMutations;
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const GENERATE_IMAGE_TOOL: Anthropic.Tool = {
	name: 'generate_image',
	description: 'Generate a character image using the configured image generation model. Call this when Boss approves a character design and wants to see it rendered.',
	input_schema: {
		type: 'object',
		properties: {
			prompt: {
				type: 'string',
				description: 'Detailed image prompt describing the character, pose, clothing, expression, lighting, and style. Be specific and visual.'
			},
			negative_prompt: {
				type: 'string',
				description: 'What to avoid in the image (e.g., "bad hands, deformed, blurry")'
			},
			aspect_ratio: {
				type: 'string',
				enum: ['1:1', '3:4', '4:3', '16:9', '9:16', '21:9'],
				description: 'Image aspect ratio'
			},
			style: {
				type: 'string',
				enum: ['photorealistic', 'anime', 'illustration', 'cinematic', 'artistic', '3d'],
				description: 'Visual style for the image'
			},
			framing: {
				type: 'string',
				enum: ['headshot', 'portrait', 'upper_body', 'full_body', 'environmental'],
				description: 'How the subject is framed in the image'
			},
			mood: {
				type: 'string',
				description: 'Lighting and atmosphere (e.g., "warm golden hour", "soft bedroom lighting", "dramatic shadows")'
			},
			steps: {
				type: 'number',
				description: 'Number of inference steps (20-50 typical, higher = more detail)'
			},
			cfg_scale: {
				type: 'number',
				description: 'Prompt adherence strength (5-15 typical, higher = stricter to prompt)'
			},
			seed: {
				type: 'number',
				description: 'Random seed for reproducible generations'
			},
			canvas_id: {
				type: 'string',
				description: 'ID of the designer canvas to add this image to'
			}
		},
		required: ['prompt']
	}
};

export const EDIT_IMAGE_TOOL: Anthropic.Tool = {
	name: 'edit_image',
	description: 'Edit an existing image using instruction-based transformation. Use this to modify a character image while preserving their identity (e.g., change outfit, pose, background, lighting). Reference the source image by its 3-character code.',
	input_schema: {
		type: 'object',
		properties: {
			source_code: {
				type: 'string',
				description: '3-character alphanumeric code of the source image (e.g., "A7K").'
			},
			instruction: {
				type: 'string',
				description: 'What to change about the image (e.g., "Put her in a red dress", "Change the background to a beach")'
			},
			strength: {
				type: 'number',
				description: 'How much to change (0.3 = subtle, 0.5 = moderate, 0.75 = significant, 0.9 = major). Lower values preserve more of the original.'
			},
			seed: {
				type: 'number',
				description: 'Random seed for reproducible edits'
			},
			canvas_id: {
				type: 'string',
				description: 'ID of the designer canvas to add the edited image to'
			}
		},
		required: ['source_code', 'instruction']
	}
};

export const GENERATION_TOOLS: Anthropic.Tool[] = [GENERATE_IMAGE_TOOL, EDIT_IMAGE_TOOL];

// ============================================================================
// Helpers
// ============================================================================

function generateRandomCode(): string {
	let code = '';
	for (let i = 0; i < 3; i++) {
		code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
	}
	return code;
}

async function generateImageCode(
	canvasId: string,
	imageId: string,
	imageUrl: string
): Promise<string> {
	const maxAttempts = 10;

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const code = generateRandomCode();

		const { error } = await supabase
			.from('element_codes')
			.insert({ code, canvas_id: canvasId, element_id: imageId, storage_url: imageUrl, element_type: 'image' });

		if (!error) {
			return code;
		}

		if (error.code === '23505') {
			continue; // Unique violation, try again
		}

		throw new Error(`Failed to generate image code: ${error.message}`);
	}

	throw new Error('Failed to generate unique image code after max attempts');
}

async function resolveElementCode(
	code: string
): Promise<{ storageUrl: string | null; canvasId: string; elementId: string; elementType: string } | null> {
	const { data, error } = await supabase
		.from('element_codes')
		.select('storage_url, canvas_id, element_id, element_type')
		.eq('code', code.toUpperCase())
		.single();

	if (error || !data) {
		return null;
	}

	return {
		storageUrl: data.storage_url,
		canvasId: data.canvas_id,
		elementId: data.element_id,
		elementType: data.element_type
	};
}

export function isGenerationTool(toolName: string): boolean {
	return ['generate_image', 'edit_image'].includes(toolName);
}

// ============================================================================
// Storage Helper
// ============================================================================

async function storeImageAndUpdateCanvas(
	imageBase64: string,
	canvasId: string,
	userId: string,
	dimensions: { width: number; height: number }
): Promise<{ success: boolean; imageUrl?: string; imageCode?: string; newState?: CanvasState; error?: string }> {
	try {
		const imageId = crypto.randomUUID();
		const filename = `designer/${canvasId}/${imageId}.webp`;

		const imageBuffer = Buffer.from(imageBase64, 'base64');

		const { error: uploadError } = await supabase.storage
			.from('content')
			.upload(filename, imageBuffer, {
				contentType: 'image/webp',
				upsert: false
			});

		if (uploadError) {
			return { success: false, error: `Storage upload failed: ${uploadError.message}` };
		}

		const { data: urlData } = supabase.storage.from('content').getPublicUrl(filename);
		const imageUrl = urlData.publicUrl;

		const imageCode = await generateImageCode(canvasId, imageId, imageUrl);

		const imageElement = {
			id: imageId,
			type: 'image',
			src: imageUrl,
			code: imageCode,
			x: 50,
			y: 50,
			width: dimensions.width,
			height: dimensions.height
		};

		const { data: canvas, error: fetchError } = await supabase
			.from('canvas_designer')
			.select('state')
			.eq('id', canvasId)
			.eq('user_id', userId)
			.single();

		if (fetchError || !canvas) {
			return { success: false, error: `Canvas not found: ${canvasId}` };
		}

		const currentState = canvas.state as { render: unknown[]; semantic: unknown; viewport: unknown };
		const updatedRender = [...currentState.render, imageElement];
		const newState = {
			...currentState,
			render: updatedRender
		} as CanvasState;

		const { error: updateError } = await supabase
			.from('canvas_designer')
			.update({ state: newState })
			.eq('id', canvasId)
			.eq('user_id', userId);

		if (updateError) {
			return { success: false, error: `Canvas update failed: ${updateError.message}` };
		}

		return { success: true, imageUrl, imageCode, newState };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

// ============================================================================
// Executors
// ============================================================================

async function executeGenerateImage(
	input: Record<string, unknown>,
	context: GenerationToolContext
): Promise<GenerationToolResult> {
	try {
		const { userId, imageGenModel } = context;
		const canvasId = input.canvas_id as string | undefined;

		if (!imageGenModel) {
			return { success: false, message: 'No image generation model configured. Set one in Settings.' };
		}

		// Build the full prompt with style modifiers
		let fullPrompt = input.prompt as string;
		if (input.style) fullPrompt += `, ${input.style} style`;
		if (input.mood) fullPrompt += `, ${input.mood}`;
		if (input.framing) fullPrompt += `, ${input.framing} shot`;

		// Map aspect ratio to dimensions
		const dimensions: Record<string, { width: number; height: number }> = {
			'1:1': { width: 1024, height: 1024 },
			'3:4': { width: 768, height: 1024 },
			'4:3': { width: 1024, height: 768 },
			'16:9': { width: 1024, height: 576 },
			'9:16': { width: 576, height: 1024 },
			'21:9': { width: 1344, height: 576 }
		};
		const dims = dimensions[(input.aspect_ratio as string) || '3:4'] || dimensions['3:4'];

		const imageParams: ImageGenParams = {
			prompt: fullPrompt,
			negativePrompt: input.negative_prompt as string | undefined,
			model: imageGenModel,
			width: dims.width,
			height: dims.height,
			steps: input.steps as number | undefined,
			cfgScale: input.cfg_scale as number | undefined,
			seed: input.seed as number | undefined
		};

		const result = await generateImage(supabase, imageParams);

		// If canvas_id provided, store and update canvas
		if (canvasId) {
			const storeResult = await storeImageAndUpdateCanvas(result.imageBase64, canvasId, userId, dims);

			if (!storeResult.success) {
				return { success: false, message: storeResult.error || 'Failed to store image' };
			}

			const mutations = createEmptyCanvasMutations();
			mutations.updated_canvases.push({ id: canvasId, state: storeResult.newState! });

			return {
				success: true,
				message: `Image generated and saved to canvas. Code: ${storeResult.imageCode}`,
				data: { imageCode: storeResult.imageCode, seed: result.seed },
				mutations
			};
		}

		// No canvas, just return the image
		return {
			success: true,
			message: 'Image generated successfully',
			data: { imageBase64: result.imageBase64, seed: result.seed }
		};
	} catch (error) {
		return {
			success: false,
			message: `Image generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

async function executeEditImage(
	input: Record<string, unknown>,
	context: GenerationToolContext
): Promise<GenerationToolResult> {
	try {
		const { userId, imageEditModel } = context;
		const sourceCode = (input.source_code as string)?.toUpperCase();
		const instruction = input.instruction as string;
		const canvasId = input.canvas_id as string | undefined;

		if (!sourceCode || !instruction) {
			return { success: false, message: 'Missing required fields: source_code, instruction' };
		}

		if (!imageEditModel) {
			return { success: false, message: 'No image editing model configured. Set one in Settings.' };
		}

		// Resolve source image
		const sourceInfo = await resolveElementCode(sourceCode);
		if (!sourceInfo || !sourceInfo.storageUrl) {
			return { success: false, message: `Source image ${sourceCode} not found` };
		}

		// Get source image dimensions from canvas state
		const { data: sourceCanvas } = await supabase
			.from('canvas_designer')
			.select('state')
			.eq('id', sourceInfo.canvasId)
			.single();

		let dims = { width: 768, height: 1024 }; // Fallback default
		if (sourceCanvas?.state) {
			const state = sourceCanvas.state as { render: Array<{ id: string; width?: number; height?: number }> };
			const sourceElement = state.render.find(el => el.id === sourceInfo.elementId);
			if (sourceElement?.width && sourceElement?.height) {
				dims = { width: sourceElement.width, height: sourceElement.height };
			}
		}

		const result = await editImage(supabase, {
			sourceImageUrl: sourceInfo.storageUrl,
			prompt: instruction,
			model: imageEditModel,
			strength: (input.strength as number) ?? 0.75,
			seed: input.seed as number | undefined
		});

		// Read actual output dimensions from the returned image
		const outputBuffer = Buffer.from(result.imageBase64, 'base64');
		const outputMetadata = await sharp(outputBuffer).metadata();
		if (outputMetadata.width && outputMetadata.height) {
			dims = { width: outputMetadata.width, height: outputMetadata.height };
		}

		// Determine target canvas
		const targetCanvasId = canvasId || sourceInfo.canvasId;

		// Store and update canvas with actual output dimensions
		const storeResult = await storeImageAndUpdateCanvas(result.imageBase64, targetCanvasId, userId, dims);

		if (!storeResult.success) {
			return { success: false, message: storeResult.error || 'Failed to store edited image' };
		}

		const mutations = createEmptyCanvasMutations();
		mutations.updated_canvases.push({ id: targetCanvasId, state: storeResult.newState! });

		return {
			success: true,
			message: `Image edited and saved. Code: ${storeResult.imageCode} (from ${sourceCode})`,
			data: { imageCode: storeResult.imageCode, seed: result.seed },
			mutations
		};
	} catch (error) {
		return {
			success: false,
			message: `Image editing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

// ============================================================================
// Main Dispatcher
// ============================================================================

export async function executeGenerationTool(
	toolName: string,
	input: Record<string, unknown>,
	context: GenerationToolContext
): Promise<GenerationToolResult> {
	switch (toolName) {
		case 'generate_image':
			return executeGenerateImage(input, context);
		case 'edit_image':
			return executeEditImage(input, context);
		default:
			return { success: false, message: `Unknown generation tool: ${toolName}` };
	}
}

// ============================================================================
// API Helpers (for REST endpoints)
// ============================================================================

/**
 * Store an image and update canvas state
 * Used by paste endpoint - accepts supabase client parameter
 */
export async function storeImageToCanvas(
	supabaseClient: typeof supabase,
	imageBase64: string,
	canvasId: string,
	dimensions: { width: number; height: number }
): Promise<{ success: boolean; imageUrl?: string; imageCode?: string; newState?: CanvasState; error?: string }> {
	try {
		const imageId = crypto.randomUUID();
		const filename = `designer/${canvasId}/${imageId}.webp`;

		const imageBuffer = Buffer.from(imageBase64, 'base64');

		const { error: uploadError } = await supabaseClient.storage
			.from('content')
			.upload(filename, imageBuffer, {
				contentType: 'image/webp',
				upsert: false
			});

		if (uploadError) {
			return { success: false, error: `Storage upload failed: ${uploadError.message}` };
		}

		const { data: urlData } = supabaseClient.storage.from('content').getPublicUrl(filename);
		const imageUrl = urlData.publicUrl;

		const imageCode = await generateImageCode(canvasId, imageId, imageUrl);

		const imageElement = {
			id: imageId,
			type: 'image',
			src: imageUrl,
			code: imageCode,
			x: 50,
			y: 50,
			width: dimensions.width,
			height: dimensions.height
		};

		const { data: canvas, error: fetchError } = await supabaseClient
			.from('canvas_designer')
			.select('state')
			.eq('id', canvasId)
			.single();

		if (fetchError || !canvas) {
			return { success: false, error: `Canvas not found: ${canvasId}` };
		}

		const currentState = canvas.state as { render: unknown[]; semantic: unknown; viewport: unknown };
		const updatedRender = [...currentState.render, imageElement];
		const newState = {
			...currentState,
			render: updatedRender
		} as CanvasState;

		const { error: updateError } = await supabaseClient
			.from('canvas_designer')
			.update({ state: newState })
			.eq('id', canvasId);

		if (updateError) {
			return { success: false, error: `Canvas update failed: ${updateError.message}` };
		}

		return { success: true, imageUrl, imageCode, newState };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

interface RenderElement {
	id: string;
	code?: string;
	type: string;
	src?: string;
	text?: string;
}

/**
 * Sync element codes from canvas state to the element_codes table
 * Called when canvas state is updated via REST API
 */
export async function syncCanvasElementCodes(
	supabaseClient: typeof supabase,
	canvasId: string,
	renderElements: RenderElement[]
): Promise<void> {
	// Get existing codes for this canvas
	const { data: existingCodes } = await supabaseClient
		.from('element_codes')
		.select('code, element_id')
		.eq('canvas_id', canvasId);

	const existingByElementId = new Map(
		(existingCodes || []).map(ec => [ec.element_id, ec.code])
	);

	// Upsert codes for elements that have them
	const elementsWithCodes = renderElements.filter(el => el.code && el.id);

	for (const el of elementsWithCodes) {
		if (!existingByElementId.has(el.id)) {
			// New element with code - insert
			await supabaseClient
				.from('element_codes')
				.insert({
					code: el.code,
					canvas_id: canvasId,
					element_id: el.id,
					element_type: el.type,
					storage_url: el.src || null
				});
		}
	}

	// Clean up codes for deleted elements
	const currentElementIds = new Set(renderElements.map(el => el.id));
	const orphanedCodes = (existingCodes || [])
		.filter(ec => !currentElementIds.has(ec.element_id))
		.map(ec => ec.code);

	if (orphanedCodes.length > 0) {
		await supabaseClient
			.from('element_codes')
			.delete()
			.in('code', orphanedCodes);
	}
}

// ============================================================================
// Re-export element code utilities for chat API
// ============================================================================

export { resolveElementCode };
