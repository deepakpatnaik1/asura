/**
 * Image Generation API
 *
 * Generates images using Fireworks FLUX models and uploads to Supabase storage.
 * Used by Eva (character designer persona) for character creation workflow.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { z } from 'zod';
import { validateSchema } from '$lib/schemas';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY, FIREWORKS_API_KEY } from '$env/static/private';

// Service role client for storage operations
const supabaseStorage = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Fireworks FLUX models
const FLUX_MODELS = {
	'flux-schnell': 'accounts/fireworks/models/flux-1-schnell-fp8', // Fast iteration, $0.0014/image
	'flux-dev': 'accounts/fireworks/models/flux-1-dev-fp8', // Character portraits, $0.014/image
	'flux-pro': 'accounts/fireworks/models/flux-1-1-pro' // Premium quality, $0.04/image
} as const;

type FluxModel = keyof typeof FLUX_MODELS;

// Request validation schema
const generateImageSchema = z.object({
	prompt: z.string().min(1).max(2000),
	negative_prompt: z.string().max(1000).optional(),
	model: z.enum(['flux-schnell', 'flux-dev', 'flux-pro']).default('flux-schnell'),
	seed: z.number().int().min(0).max(2147483647).optional(),
	width: z.number().int().min(256).max(1440).default(1024),
	height: z.number().int().min(256).max(1440).default(1024),
	guidance_scale: z.number().min(1).max(20).default(7.5),
	num_inference_steps: z.number().int().min(1).max(50).optional() // Auto-set based on model
});

type GenerateImageRequest = z.infer<typeof generateImageSchema>;

/**
 * Call Fireworks API to generate image
 */
async function generateWithFireworks(
	params: GenerateImageRequest
): Promise<{ imageBase64: string; seed: number }> {
	const modelId = FLUX_MODELS[params.model as FluxModel];

	// Set inference steps based on model if not provided
	const steps =
		params.num_inference_steps ??
		(params.model === 'flux-schnell' ? 4 : params.model === 'flux-dev' ? 28 : 25);

	// Generate seed if not provided
	const seed = params.seed ?? Math.floor(Math.random() * 2147483647);

	const response = await fetch('https://api.fireworks.ai/inference/v1/workflows/text-to-image', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${FIREWORKS_API_KEY}`,
			Accept: 'application/json'
		},
		body: JSON.stringify({
			model: modelId,
			prompt: params.prompt,
			negative_prompt: params.negative_prompt || 'bad hands, deformed, blurry, watermark, text',
			cfg_scale: params.guidance_scale,
			height: params.height,
			width: params.width,
			steps,
			seed,
			safety_check: false
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Fireworks API error: ${response.status} - ${error}`);
	}

	const data = await response.json();

	// Fireworks returns base64 image in the response
	if (!data.image || !data.image.url) {
		throw new Error('Invalid response from Fireworks API - no image URL');
	}

	// The image URL is a data URL (base64)
	const imageUrl = data.image.url as string;
	if (!imageUrl.startsWith('data:image/')) {
		throw new Error('Invalid image format from Fireworks API');
	}

	// Extract base64 from data URL
	const base64Match = imageUrl.match(/^data:image\/\w+;base64,(.+)$/);
	if (!base64Match) {
		throw new Error('Could not extract base64 from image URL');
	}

	return {
		imageBase64: base64Match[1],
		seed
	};
}

/**
 * Upload image to Supabase storage
 */
async function uploadToStorage(
	imageBase64: string,
	userId: string,
	filename: string
): Promise<string> {
	const imageBuffer = Buffer.from(imageBase64, 'base64');
	const storagePath = `generated/${userId}/${filename}`;

	const { error } = await supabaseStorage.storage.from('content').upload(storagePath, imageBuffer, {
		contentType: 'image/png',
		upsert: true
	});

	if (error) {
		throw new Error(`Storage upload failed: ${error.message}`);
	}

	// Return public URL
	return `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/content/${storagePath}`;
}

export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	// 1. Check for API key first
	if (!FIREWORKS_API_KEY) {
		return json(
			{ error: { code: 'CONFIG_ERROR', message: 'FIREWORKS_API_KEY not configured' } },
			{ status: 500 }
		);
	}

	// 2. Authentication
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// 3. Parse and validate request
	const parseResult = await parseRequestJson<unknown>(request);
	if (!parseResult.success) return parseResult.error;

	const validation = validateSchema(generateImageSchema, parseResult.data);
	if (!validation.success) return validation.error;

	const params = validation.data;

	try {
		// 4. Generate image with Fireworks
		const { imageBase64, seed } = await generateWithFireworks(params);

		// 5. Upload to storage
		const timestamp = Date.now();
		const filename = `${params.model}-${seed}-${timestamp}.png`;
		const publicUrl = await uploadToStorage(imageBase64, userId, filename);

		// 6. Return result
		return json({
			success: true,
			url: publicUrl,
			seed,
			model: params.model,
			prompt: params.prompt,
			width: params.width,
			height: params.height
		});
	} catch (error) {
		console.error('Image generation failed:', error);
		return json(
			{
				error: {
					code: 'GENERATION_ERROR',
					message: error instanceof Error ? error.message : 'Image generation failed'
				}
			},
			{ status: 500 }
		);
	}
};
