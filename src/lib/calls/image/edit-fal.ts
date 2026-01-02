/**
 * Fal.ai Image Editing
 *
 * Handles instruction-based image editing via Fal.ai models:
 * - FLUX Dev img2img: General image-to-image transformation
 * - Z-Image Turbo: Fast editing (8 steps)
 * - FLUX Kontext: Character consistency across generations
 *
 * Key feature: enable_safety_checker: false for unrestricted NSFW content
 */

import { FAL_API_KEY } from '$env/static/private';
import type { ImageEditParams } from './index';

/**
 * Convert a local URL to base64 data URI
 * Fal.ai cannot access localhost URLs, so we fetch and convert to data URI
 */
async function toDataUri(imageUrl: string): Promise<string> {
	// Check if it's a local URL that Fal.ai can't access
	const isLocalUrl = imageUrl.includes('localhost') || imageUrl.includes('127.0.0.1');

	if (!isLocalUrl) {
		// Public URL - Fal.ai can access it directly
		return imageUrl;
	}

	// Fetch the image ourselves
	const response = await fetch(imageUrl);
	if (!response.ok) {
		throw new Error(`Failed to fetch source image: ${response.status}`);
	}

	const buffer = await response.arrayBuffer();
	const base64 = Buffer.from(buffer).toString('base64');

	// Determine mime type from URL or default to webp
	const ext = imageUrl.split('.').pop()?.toLowerCase() || 'webp';
	const mimeTypes: Record<string, string> = {
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		png: 'image/png',
		webp: 'image/webp',
		gif: 'image/gif'
	};
	const mimeType = mimeTypes[ext] || 'image/webp';

	return `data:${mimeType};base64,${base64}`;
}

/**
 * Edit an image using Fal.ai
 */
export async function editWithFal(params: ImageEditParams): Promise<{ imageBase64: string; seed: number }> {
	if (!FAL_API_KEY) {
		throw new Error('FAL_API_KEY not configured');
	}

	const {
		sourceImageUrl,
		prompt,
		model,
		seed: inputSeed,
		strength = 0.75,
		steps,
		cfgScale = 3.5
	} = params;

	// Generate seed if not provided
	const seed = inputSeed ?? Math.floor(Math.random() * 2147483647);

	// Convert local URLs to data URIs so Fal.ai can access them
	const imageInput = await toDataUri(sourceImageUrl);

	// Determine if this is a Kontext model (different API shape)
	const isKontext = model.includes('kontext');
	const isZImage = model.includes('z-image');

	// Default steps based on model type
	const numInferenceSteps = steps ?? (isZImage ? 8 : 28);

	// Fal.ai REST API
	const url = `https://fal.run/${model}`;

	// Build request body based on model type
	let body: Record<string, unknown>;

	if (isKontext) {
		// Kontext models use image_url as reference for character consistency
		body = {
			prompt,
			image_url: imageInput,
			num_inference_steps: numInferenceSteps,
			seed,
			guidance_scale: cfgScale,
			num_images: 1,
			enable_safety_checker: false
		};
	} else {
		// Standard img2img models
		body = {
			prompt,
			image_url: imageInput,
			strength, // How much to change (0 = no change, 1 = complete regeneration)
			num_inference_steps: numInferenceSteps,
			seed,
			guidance_scale: cfgScale,
			num_images: 1,
			enable_safety_checker: false
		};
	}

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Key ${FAL_API_KEY}`
		},
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		const error = await response.text();
		console.error(`[edit-fal] API error: ${response.status} - ${error}`);
		throw new Error(`Fal.ai API error: ${response.status} - ${error}`);
	}

	const data = await response.json();

	// Fal.ai returns images array with url
	if (!data.images || !data.images[0] || !data.images[0].url) {
		console.error(`[edit-fal] Invalid response - no images:`, data);
		throw new Error('Invalid response from Fal.ai API - no image URL');
	}

	// Download image and convert to base64
	const imageResponse = await fetch(data.images[0].url);
	if (!imageResponse.ok) {
		throw new Error('Failed to fetch edited image from Fal.ai URL');
	}
	const imageBuffer = await imageResponse.arrayBuffer();
	const imageBase64 = Buffer.from(imageBuffer).toString('base64');

	return {
		imageBase64,
		seed: data.seed || seed
	};
}
