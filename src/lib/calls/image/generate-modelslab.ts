/**
 * ModelsLab Image Generation
 *
 * Handles image generation via ModelsLab API.
 * NSFW-focused provider with uncensored generation.
 *
 * Docs: https://docs.modelslab.com/image-generation/text-to-image
 */

import { MODELSLAB_API_KEY } from '$env/static/private';
import type { ImageGenParams } from './index';

/**
 * Generate an image using ModelsLab
 */
export async function generateWithModelsLab(params: ImageGenParams): Promise<{ imageBase64: string; seed: number }> {
	if (!MODELSLAB_API_KEY) {
		throw new Error('MODELSLAB_API_KEY not configured');
	}

	const { prompt, negativePrompt, model, seed: inputSeed, width = 512, height = 512 } = params;

	// Generate seed if not provided
	const seed = inputSeed ?? Math.floor(Math.random() * 2147483647);

	// ModelsLab text2img API
	const response = await fetch('https://modelslab.com/api/v6/images/text2img', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			key: MODELSLAB_API_KEY,
			model_id: model,
			prompt,
			negative_prompt: negativePrompt || 'bad hands, deformed, blurry, watermark, text',
			width: String(width),
			height: String(height),
			samples: '1',
			num_inference_steps: '30',
			seed,
			guidance_scale: 7.5,
			safety_checker: 'no', // NSFW capable
			enhance_prompt: 'no',
			webhook: null,
			track_id: null
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`ModelsLab API error: ${response.status} - ${error}`);
	}

	const data = await response.json();

	// ModelsLab returns status and output array
	if (data.status === 'error') {
		throw new Error(`ModelsLab API error: ${data.message || 'Unknown error'}`);
	}

	// Handle processing status (async generation)
	if (data.status === 'processing') {
		const fetchResult = data.fetch_result;
		if (!fetchResult) {
			throw new Error('ModelsLab returned processing status but no fetch_result URL');
		}

		// Wait and poll
		let attempts = 0;
		const maxAttempts = 30; // 30 seconds max wait
		while (attempts < maxAttempts) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
			const pollResponse = await fetch(fetchResult, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ key: MODELSLAB_API_KEY })
			});
			const pollData = await pollResponse.json();
			if (pollData.status === 'success' && pollData.output && pollData.output[0]) {
				const imageUrl = pollData.output[0];
				const imageResponse = await fetch(imageUrl);
				if (!imageResponse.ok) {
					throw new Error('Failed to fetch generated image from ModelsLab URL');
				}
				const imageBuffer = await imageResponse.arrayBuffer();
				const imageBase64 = Buffer.from(imageBuffer).toString('base64');
				return { imageBase64, seed };
			}
			if (pollData.status === 'error') {
				throw new Error(`ModelsLab generation failed: ${pollData.message || 'Unknown error'}`);
			}
			attempts++;
		}
		throw new Error('ModelsLab generation timed out');
	}

	// Handle immediate success
	if (!data.output || !data.output[0]) {
		throw new Error('Invalid response from ModelsLab API - no output URL');
	}

	// Download image and convert to base64
	const imageResponse = await fetch(data.output[0]);
	if (!imageResponse.ok) {
		throw new Error('Failed to fetch generated image from ModelsLab URL');
	}
	const imageBuffer = await imageResponse.arrayBuffer();
	const imageBase64 = Buffer.from(imageBuffer).toString('base64');

	return {
		imageBase64,
		seed
	};
}
