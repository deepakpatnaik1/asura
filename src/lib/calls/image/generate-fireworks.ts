/**
 * Fireworks Image Generation
 *
 * Handles image generation via Fireworks AI FLUX models.
 *
 * Docs: https://docs.fireworks.ai/api-reference/generate-a-new-image-from-a-text-prompt
 */

import { FIREWORKS_API_KEY } from '$env/static/private';
import type { ImageGenParams } from './index';

/**
 * Generate an image using Fireworks AI
 */
export async function generateWithFireworks(params: ImageGenParams): Promise<{ imageBase64: string; seed: number }> {
	if (!FIREWORKS_API_KEY) {
		throw new Error('FIREWORKS_API_KEY not configured');
	}

	const { prompt, model, seed: inputSeed, width = 1024, height = 1024 } = params;

	// Set inference steps based on model
	const isSchnell = model.includes('schnell');
	const isDev = model.includes('dev');
	const steps = isSchnell ? 4 : isDev ? 28 : 25;

	// Generate seed if not provided
	const seed = inputSeed ?? Math.floor(Math.random() * 2147483647);

	// Fireworks API: model ID goes in URL, not body
	const url = `https://api.fireworks.ai/inference/v1/workflows/${model}/text_to_image`;

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${FIREWORKS_API_KEY}`,
			Accept: 'image/png'
		},
		body: JSON.stringify({
			prompt,
			guidance_scale: 3.5,
			num_inference_steps: steps,
			seed,
			height,
			width
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Fireworks API error: ${response.status} - ${error}`);
	}

	// Fireworks returns binary PNG data when Accept: image/png
	const imageBuffer = await response.arrayBuffer();
	const imageBase64 = Buffer.from(imageBuffer).toString('base64');

	return {
		imageBase64,
		seed
	};
}
