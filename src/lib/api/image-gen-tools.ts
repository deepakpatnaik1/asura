/**
 * Image Generation Tools for Eva
 *
 * Tool schema and executor for image generation.
 * Uses the existing provider-agnostic generateImage infrastructure.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToolName } from '$lib/config/personas';
import { generateImage, editImage, type ImageGenParams, type ImageEditParams } from '$lib/calls/image';

// Character set for image codes: 0-9, A-Z (uppercase only for clarity)
const CODE_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Generate a random 3-character alphanumeric code
 */
function generateRandomCode(): string {
	let code = '';
	for (let i = 0; i < 3; i++) {
		code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
	}
	return code;
}

/**
 * Generate a unique image code, checking for collisions
 * Returns the code and inserts it into the image_codes table
 */
export async function generateImageCode(
	supabase: SupabaseClient,
	canvasId: string,
	imageId: string,
	imageUrl: string
): Promise<string> {
	const maxAttempts = 10;

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const code = generateRandomCode();

		// Try to insert - will fail if code already exists (primary key constraint)
		const { error } = await supabase
			.from('image_codes')
			.insert({ code, canvas_id: canvasId, image_id: imageId, image_url: imageUrl });

		if (!error) {
			return code;
		}

		// If it's a unique violation, try again
		if (error.code === '23505') {
			continue;
		}

		// Other error - throw
		throw new Error(`Failed to generate image code: ${error.message}`);
	}

	throw new Error('Failed to generate unique image code after max attempts');
}

/**
 * Look up an image URL by its code
 */
export async function resolveImageCode(
	supabase: SupabaseClient,
	code: string
): Promise<{ imageUrl: string; canvasId: string; imageId: string } | null> {
	const { data, error } = await supabase
		.from('image_codes')
		.select('image_url, canvas_id, image_id')
		.eq('code', code.toUpperCase())
		.single();

	if (error || !data) {
		return null;
	}

	return {
		imageUrl: data.image_url,
		canvasId: data.canvas_id,
		imageId: data.image_id
	};
}

// Tool schema for Claude's tool_use
export const IMAGE_GEN_TOOL = {
	name: 'generate_image' as ToolName,
	description: 'Generate a character image using the configured image generation model. Call this when Boss approves a character design and wants to see it rendered.',
	input_schema: {
		type: 'object',
		properties: {
			// Core (required)
			prompt: {
				type: 'string',
				description: 'Detailed image prompt describing the character, pose, clothing, expression, lighting, and style. Be specific and visual.'
			},
			// Content control
			negative_prompt: {
				type: 'string',
				description: 'What to avoid in the image (e.g., "bad hands, deformed, blurry")'
			},
			// Dimensions
			aspect_ratio: {
				type: 'string',
				enum: ['1:1', '3:4', '4:3', '16:9', '9:16', '21:9'],
				description: 'Image aspect ratio'
			},
			// Style
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
			// Quality
			steps: {
				type: 'number',
				description: 'Number of inference steps (20-50 typical, higher = more detail)'
			},
			cfg_scale: {
				type: 'number',
				description: 'Prompt adherence strength (5-15 typical, higher = stricter to prompt)'
			},
			// Reproducibility
			seed: {
				type: 'number',
				description: 'Random seed for reproducible generations'
			},
			// Asura-specific
			canvas_id: {
				type: 'string',
				description: 'ID of the designer canvas to add this image to (from context injection)'
			}
		},
		required: ['prompt']
	}
};

/**
 * Context for image generation execution
 */
export interface ImageGenContext {
	supabase: SupabaseClient;
	model: string; // model_image_gen from settings
}

/**
 * Store generated image to Supabase storage and update canvas
 * Returns the public URL and code of the stored image
 */
export async function storeImageAndUpdateCanvas(
	supabase: SupabaseClient,
	imageBase64: string,
	canvasId: string,
	dimensions: { width: number; height: number }
): Promise<{ success: boolean; imageUrl?: string; imageCode?: string; newState?: unknown; error?: string }> {
	try {
		// Generate unique filename
		const imageId = crypto.randomUUID();
		const filename = `designer/${canvasId}/${imageId}.webp`;

		// Decode base64 to buffer
		const imageBuffer = Buffer.from(imageBase64, 'base64');

		// Upload to storage (Venice returns WEBP format)
		const { error: uploadError } = await supabase.storage
			.from('content')
			.upload(filename, imageBuffer, {
				contentType: 'image/webp',
				upsert: false
			});

		if (uploadError) {
			console.error('[ImageGen] Storage upload error:', uploadError);
			return { success: false, error: `Storage upload failed: ${uploadError.message}` };
		}

		// Get public URL
		const { data: urlData } = supabase.storage.from('content').getPublicUrl(filename);
		const imageUrl = urlData.publicUrl;

		// Generate unique 3-character code for this image
		const imageCode = await generateImageCode(supabase, canvasId, imageId, imageUrl);

		// Create image element for canvas render array (original dimensions)
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

		// Fetch current canvas state
		const { data: canvas, error: fetchError } = await supabase
			.from('canvas_designer')
			.select('state')
			.eq('id', canvasId)
			.single();

		if (fetchError || !canvas) {
			console.error('[ImageGen] Canvas fetch error:', fetchError);
			return { success: false, error: `Canvas not found: ${canvasId}` };
		}

		// Update render array with new image
		const currentState = canvas.state as { render: unknown[]; semantic: unknown; viewport: unknown };
		const updatedRender = [...currentState.render, imageElement];
		const newState = {
			...currentState,
			render: updatedRender
		};

		const { error: updateError } = await supabase
			.from('canvas_designer')
			.update({ state: newState })
			.eq('id', canvasId);

		if (updateError) {
			console.error('[ImageGen] Canvas update error:', updateError);
			return { success: false, error: `Canvas update failed: ${updateError.message}` };
		}

		return { success: true, imageUrl, imageCode, newState };
	} catch (error) {
		console.error('[ImageGen] storeImageAndUpdateCanvas error:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

/**
 * Execute image generation using the configured model and provider
 */
export async function executeImageGen(
	params: {
		prompt: string;
		negative_prompt?: string;
		aspect_ratio?: string;
		style?: string;
		framing?: string;
		mood?: string;
		steps?: number;
		cfg_scale?: number;
		seed?: number;
		canvas_id?: string;
	},
	context: ImageGenContext
): Promise<{ success: boolean; imageBase64?: string; seed?: number; canvas_id?: string; error?: string }> {
	try {
		// Build the full prompt with style modifiers
		let fullPrompt = params.prompt;
		if (params.style) fullPrompt += `, ${params.style} style`;
		if (params.mood) fullPrompt += `, ${params.mood}`;
		if (params.framing) fullPrompt += `, ${params.framing} shot`;

		// Map aspect ratio to dimensions
		const dimensions: Record<string, { width: number; height: number }> = {
			'1:1': { width: 1024, height: 1024 },
			'3:4': { width: 768, height: 1024 },
			'4:3': { width: 1024, height: 768 },
			'16:9': { width: 1024, height: 576 },
			'9:16': { width: 576, height: 1024 },
			'21:9': { width: 1344, height: 576 }
		};
		const dims = dimensions[params.aspect_ratio || '3:4'] || dimensions['3:4'];

		// Build params for the provider-agnostic generateImage function
		const imageParams: ImageGenParams = {
			prompt: fullPrompt,
			negativePrompt: params.negative_prompt,
			model: context.model,
			width: dims.width,
			height: dims.height,
			steps: params.steps,
			cfgScale: params.cfg_scale,
			seed: params.seed
		};

		// Call the provider-agnostic image generation
		const result = await generateImage(context.supabase, imageParams);

		return {
			success: true,
			imageBase64: result.imageBase64,
			seed: result.seed,
			canvas_id: params.canvas_id
		};
	} catch (error) {
		console.error('[ImageGen] Error:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

// Edit image tool schema
export const EDIT_IMAGE_TOOL = {
	name: 'edit_image' as ToolName,
	description: 'Edit an existing image using instruction-based transformation. Use this to modify a character image while preserving their identity (e.g., change outfit, pose, background, lighting). Reference the source image by its 3-character code (shown at bottom-left of each image).',
	input_schema: {
		type: 'object',
		properties: {
			source_code: {
				type: 'string',
				description: '3-character alphanumeric code of the source image (e.g., "A7K"). Shown at bottom-left of each image in canvas.'
			},
			instruction: {
				type: 'string',
				description: 'What to change about the image (e.g., "Put her in a red dress", "Change the background to a beach", "Make it night time")'
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

/**
 * Context for image editing execution
 */
export interface ImageEditContext {
	supabase: SupabaseClient;
	model: string; // model_image_edit from settings
}

/**
 * Execute image editing using the configured model and provider
 */
export async function executeEditImage(
	params: {
		source_image_url: string;
		instruction: string;
		strength?: number;
		seed?: number;
		canvas_id?: string;
	},
	context: ImageEditContext
): Promise<{ success: boolean; imageBase64?: string; seed?: number; canvas_id?: string; error?: string }> {
	try {
		const editParams: ImageEditParams = {
			sourceImageUrl: params.source_image_url,
			prompt: params.instruction,
			model: context.model,
			strength: params.strength ?? 0.75,
			seed: params.seed
		};

		const result = await editImage(context.supabase, editParams);

		return {
			success: true,
			imageBase64: result.imageBase64,
			seed: result.seed,
			canvas_id: params.canvas_id
		};
	} catch (error) {
		console.error('[ImageEdit] Error:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}
