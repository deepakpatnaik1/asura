/**
 * OpenRouter Image Generation
 *
 * Handles image generation via OpenRouter API.
 * Supports FLUX, Stable Diffusion, and other models.
 *
 * NSFW Note: OpenRouter follows strict content policies and does NOT provide
 * a direct API parameter to disable safety filters. The underlying model's
 * behavior applies. For NSFW content, use Venice or Fal.ai instead.
 *
 * Docs: https://openrouter.ai/docs/guides/overview/multimodal/image-generation
 */

import { OPENROUTER_API_KEY } from '$env/static/private';
import type { ImageGenParams } from './index';

/**
 * Generate an image using OpenRouter
 */
export async function generateWithOpenRouter(params: ImageGenParams): Promise<{ imageBase64: string; seed: number }> {
	if (!OPENROUTER_API_KEY) {
		throw new Error('OPENROUTER_API_KEY not configured');
	}

	const { prompt, negativePrompt, model, seed: inputSeed, width = 1024, height = 1024, steps, cfgScale } = params;

	// Generate seed if not provided
	const seed = inputSeed ?? Math.floor(Math.random() * 2147483647);

	// Build request body - only include optional params if provided
	const body: Record<string, unknown> = {
		model,
		prompt,
		negative_prompt: negativePrompt || 'bad hands, deformed, blurry, watermark, text',
		width,
		height,
		seed,
		n: 1
	};
	if (steps) body.num_inference_steps = steps;
	if (cfgScale) body.guidance_scale = cfgScale;

	const response = await fetch('https://openrouter.ai/api/v1/images/generations', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${OPENROUTER_API_KEY}`,
			'HTTP-Referer': 'https://asura.app',
			'X-Title': 'Asura'
		},
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
	}

	const data = await response.json();

	// OpenRouter returns images in data array with b64_json or url
	if (!data.data || !data.data[0]) {
		throw new Error('Invalid response from OpenRouter API - no image data');
	}

	const imageData = data.data[0];

	// Handle base64 response
	if (imageData.b64_json) {
		return {
			imageBase64: imageData.b64_json,
			seed
		};
	}

	// Handle URL response - fetch and convert to base64
	if (imageData.url) {
		const imageResponse = await fetch(imageData.url);
		if (!imageResponse.ok) {
			throw new Error('Failed to fetch generated image from URL');
		}
		const imageBuffer = await imageResponse.arrayBuffer();
		const imageBase64 = Buffer.from(imageBuffer).toString('base64');
		return {
			imageBase64,
			seed
		};
	}

	throw new Error('Invalid response from OpenRouter API - no image URL or base64');
}
