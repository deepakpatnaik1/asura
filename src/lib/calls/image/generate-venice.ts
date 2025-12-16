/**
 * Venice AI Image Generation
 *
 * Handles image generation via Venice AI API.
 * Privacy-first, uncensored generation with FLUX models.
 *
 * NSFW Note: Venice supports NSFW via `safe_mode: false` parameter.
 * This is Eva's primary image generation provider.
 *
 * Docs: https://docs.venice.ai/api-reference/endpoint/image/generate
 */

import { VENICE_API_KEY } from '$env/static/private';
import type { ImageGenParams } from './index';

/**
 * Generate an image using Venice AI
 */
export async function generateWithVenice(params: ImageGenParams): Promise<{ imageBase64: string; seed: number }> {
	if (!VENICE_API_KEY) {
		throw new Error('VENICE_API_KEY not configured');
	}

	const { prompt, negativePrompt, model, seed: inputSeed, width = 512, height = 512, steps = 25, cfgScale = 7.5 } = params;

	// Generate seed if not provided (Venice max: 999999999)
	const seed = inputSeed ?? Math.floor(Math.random() * 999999999);

	// Venice image generation API
	const response = await fetch('https://api.venice.ai/api/v1/image/generate', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${VENICE_API_KEY}`
		},
		body: JSON.stringify({
			model,
			prompt,
			negative_prompt: negativePrompt || 'bad hands, deformed, blurry, watermark, text',
			width,
			height,
			steps,
			seed,
			cfg_scale: cfgScale,
			safe_mode: false // Eva generates adult content
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Venice API error: ${response.status} - ${error}`);
	}

	const data = await response.json();

	// Venice returns images array with url or base64
	if (!data.images || !data.images[0]) {
		throw new Error(`Invalid response from Venice API - no images`);
	}

	const imageData = data.images[0];

	// Venice returns base64 directly as a string in the array
	if (typeof imageData === 'string') {
		return {
			imageBase64: imageData,
			seed: data.seed || seed
		};
	}

	// Handle object response with base64 property
	if (imageData.base64) {
		return {
			imageBase64: imageData.base64,
			seed: data.seed || seed
		};
	}

	// Handle URL response - fetch and convert to base64
	if (imageData.url) {
		const imageResponse = await fetch(imageData.url);
		if (!imageResponse.ok) {
			throw new Error('Failed to fetch generated image from Venice URL');
		}
		const imageBuffer = await imageResponse.arrayBuffer();
		const imageBase64 = Buffer.from(imageBuffer).toString('base64');
		return {
			imageBase64,
			seed: data.seed || seed
		};
	}

	throw new Error(`Invalid response from Venice API - unexpected format: ${typeof imageData}`);
}
