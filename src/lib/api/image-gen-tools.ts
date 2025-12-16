/**
 * Image Generation Tools for Eva
 *
 * Tool schema and executor for image generation.
 * Uses the existing provider-agnostic generateImage infrastructure.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToolName } from '$lib/config/personas';
import { generateImage, type ImageGenParams } from '$lib/calls/image';

// Tool schema for Claude's tool_use
export const IMAGE_GEN_TOOL = {
	name: 'generate_image' as ToolName,
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
			style: {
				type: 'string',
				enum: ['photorealistic', 'anime', 'illustration', 'portrait', 'cinematic', 'artistic'],
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
			aspect_ratio: {
				type: 'string',
				enum: ['1:1', '3:4', '4:3', '16:9', '9:16'],
				description: 'Image aspect ratio'
			},
			canvas_id: {
				type: 'string',
				description: 'Optional: ID of the designer canvas to add this image to'
			}
		},
		required: ['prompt']
	}
};

// Trigger phrases that indicate Boss wants image generation
export const IMAGE_GEN_TRIGGERS = [
	"let's draw it up",
	"draw it up",
	"generate it",
	"show me",
	"create the image",
	"make it",
	"draw it",
	"render it",
	"let's see it",
	"visualize it",
	"generate the image",
	"create it"
];

/**
 * Check if a message contains an image generation trigger
 */
export function hasImageGenTrigger(message: string): boolean {
	const lower = message.toLowerCase();
	return IMAGE_GEN_TRIGGERS.some(trigger => lower.includes(trigger));
}

/**
 * Context for image generation execution
 */
export interface ImageGenContext {
	supabase: SupabaseClient;
	model: string; // model_image_gen from settings
}

/**
 * Execute image generation using the configured model and provider
 */
export async function executeImageGen(
	params: {
		prompt: string;
		negative_prompt?: string;
		style?: string;
		framing?: string;
		mood?: string;
		aspect_ratio?: string;
		canvas_id?: string;
	},
	context: ImageGenContext
): Promise<{ success: boolean; imageBase64?: string; seed?: number; error?: string }> {
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
			'9:16': { width: 576, height: 1024 }
		};
		const dims = dimensions[params.aspect_ratio || '3:4'] || dimensions['3:4'];

		// Build params for the provider-agnostic generateImage function
		const imageParams: ImageGenParams = {
			prompt: fullPrompt,
			negativePrompt: params.negative_prompt,
			model: context.model,
			width: dims.width,
			height: dims.height
		};

		// Call the provider-agnostic image generation
		const result = await generateImage(context.supabase, imageParams);

		return {
			success: true,
			imageBase64: result.imageBase64,
			seed: result.seed
		};
	} catch (error) {
		console.error('[ImageGen] Error:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}
