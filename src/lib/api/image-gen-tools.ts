/**
 * Image Generation Tools for Eva
 *
 * Tool schema and executor for image generation.
 * Uses the existing provider-agnostic generateImage infrastructure.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToolName } from '$lib/config/personas';
import { generateImage, type ImageGenParams } from '$lib/calls/image';
import { captionImage } from '$lib/calls/caption-hf-space';

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
 * Returns the public URL of the stored image
 */
export async function storeImageAndUpdateCanvas(
	supabase: SupabaseClient,
	imageBase64: string,
	canvasId: string,
	dimensions: { width: number; height: number }
): Promise<{ success: boolean; imageUrl?: string; newState?: unknown; error?: string }> {
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

		// Create image element for canvas render array (original dimensions)
		const imageElement = {
			id: imageId,
			type: 'image',
			src: imageUrl,
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

		return { success: true, imageUrl, newState };
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

// Caption tool schema
export const CAPTION_TOOL = {
	name: 'caption_image' as ToolName,
	description: 'Describe an image from the canvas. Use this to see what an image looks like so you can suggest improvements or iterations.',
	input_schema: {
		type: 'object',
		properties: {
			image_url: {
				type: 'string',
				description: 'URL of the image to caption (from canvas render array)'
			},
			detail_level: {
				type: 'string',
				enum: ['brief', 'detailed', 'character', 'training'],
				description: 'Level of detail: brief (1 sentence), detailed (comprehensive), character (focus on character traits), training (for diffusion model prompts)'
			}
		},
		required: ['image_url']
	}
};

/**
 * Execute image captioning using JoyCaption via HuggingFace Space
 * Tries Alpha Two first (faster), falls back to Beta One
 */
export async function executeCaptionImage(
	params: {
		image_url: string;
		detail_level?: 'brief' | 'detailed' | 'character' | 'training';
	}
): Promise<{ success: boolean; caption?: string; model?: string; error?: string }> {
	try {
		const result = await captionImage({
			imageUrl: params.image_url,
			detailLevel: params.detail_level || 'character',
			maxTokens: params.detail_level === 'brief' ? 64 : 512
		});

		return {
			success: true,
			caption: result.caption,
			model: result.model
		};
	} catch (error) {
		console.error('[Caption] Error:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}
