/**
 * Fal.ai Image Generation
 *
 * Handles image generation via Fal.ai FLUX and other models.
 * Key feature: enable_safety_checker: false for unrestricted NSFW content
 *
 * Docs: https://fal.ai/models/fal-ai/flux/dev/api
 */

import { FAL_API_KEY } from '$env/static/private';
import type { ImageGenParams } from './index';

/**
 * Generate an image using Fal.ai
 */
export async function generateWithFal(params: ImageGenParams): Promise<{ imageBase64: string; seed: number }> {
	if (!FAL_API_KEY) {
		throw new Error('FAL_API_KEY not configured');
	}

	const { prompt, negativePrompt, model, seed: inputSeed, width = 1024, height = 1024, steps, cfgScale = 3.5 } = params;

	// Generate seed if not provided
	const seed = inputSeed ?? Math.floor(Math.random() * 2147483647);

	// Determine inference steps based on model (if not provided)
	const isSchnell = model.includes('schnell');
	const numInferenceSteps = steps ?? (isSchnell ? 4 : 28);

	// Fal.ai REST API: https://fal.run/{model_id}
	const url = `https://fal.run/${model}`;

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Key ${FAL_API_KEY}`
		},
		body: JSON.stringify({
			prompt,
			negative_prompt: negativePrompt || 'bad hands, deformed, blurry, watermark, text',
			image_size: { width, height },
			num_inference_steps: numInferenceSteps,
			seed,
			guidance_scale: cfgScale,
			num_images: 1,
			enable_safety_checker: false // NSFW capable
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Fal.ai API error: ${response.status} - ${error}`);
	}

	const data = await response.json();

	// Fal.ai returns images array with url
	if (!data.images || !data.images[0] || !data.images[0].url) {
		throw new Error('Invalid response from Fal.ai API - no image URL');
	}

	// Download image and convert to base64
	const imageResponse = await fetch(data.images[0].url);
	if (!imageResponse.ok) {
		throw new Error('Failed to fetch generated image from Fal.ai URL');
	}
	const imageBuffer = await imageResponse.arrayBuffer();
	const imageBase64 = Buffer.from(imageBuffer).toString('base64');

	return {
		imageBase64,
		seed: data.seed || seed
	};
}
