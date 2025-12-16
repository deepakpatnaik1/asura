/**
 * Image Generation Module
 *
 * Provides image generation across providers.
 * Routes to the correct implementation based on provider from database.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getModelProvider, type ProviderType } from '../chat/provider';
import { generateWithFal } from './generate-fal';
import { generateWithModelsLab } from './generate-modelslab';
import { generateWithFireworks } from './generate-fireworks';
import { generateWithOpenRouter } from './generate-openrouter';
import { generateWithVenice } from './generate-venice';

/**
 * Parameters for generating an image
 */
export interface ImageGenParams {
	/** Text prompt describing the image */
	prompt: string;
	/** What to avoid in the image */
	negativePrompt?: string;
	/** Model identifier (looked up in database) */
	model: string;
	/** Seed for reproducible generations */
	seed?: number;
	/** Image width in pixels */
	width?: number;
	/** Image height in pixels */
	height?: number;
	/** Inference steps (20-50 typical) */
	steps?: number;
	/** Prompt adherence/guidance scale (5-15 typical) */
	cfgScale?: number;
}

/**
 * Result from image generation
 */
export interface ImageGenResult {
	/** Base64-encoded image data */
	imageBase64: string;
	/** Seed used for generation (for reproducibility) */
	seed: number;
	/** Model used */
	model: string;
}

/**
 * Generate an image using the appropriate provider.
 *
 * Routes to the correct implementation based on the model's provider in the database.
 *
 * @param supabase - Supabase client for provider lookup
 * @param params - Image generation parameters
 * @returns Generated image result
 */
export async function generateImage(
	supabase: SupabaseClient,
	params: ImageGenParams
): Promise<ImageGenResult> {
	const provider = await getModelProvider(supabase, params.model);

	let result: { imageBase64: string; seed: number };

	switch (provider) {
		case 'fal':
			result = await generateWithFal(params);
			break;

		case 'modelslab':
			result = await generateWithModelsLab(params);
			break;

		case 'venice':
			result = await generateWithVenice(params);
			break;

		case 'replicate':
			// Replicate image generation - to be implemented
			throw new Error('Replicate image generation not yet implemented');

		case 'fireworks':
			result = await generateWithFireworks(params);
			break;

		case 'openrouter':
			result = await generateWithOpenRouter(params);
			break;

		case 'together':
			// Together image generation - similar to OpenAI-compatible
			throw new Error('Together image generation not yet implemented');

		default:
			throw new Error(`Image generation not supported for provider: ${provider}`);
	}

	return {
		...result,
		model: params.model
	};
}

// Re-export individual generators for direct use
export { generateWithFal } from './generate-fal';
export { generateWithModelsLab } from './generate-modelslab';
export { generateWithFireworks } from './generate-fireworks';
export { generateWithOpenRouter } from './generate-openrouter';
export { generateWithVenice } from './generate-venice';
