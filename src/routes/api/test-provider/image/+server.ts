/**
 * Image Provider Test Endpoint
 *
 * Tests all image_generation models in the database.
 * Makes minimal API calls with a simple prompt and small image size.
 *
 * Usage: GET /api/test-provider/image
 * Optional: GET /api/test-provider/image?model=fal-ai/flux/schnell (test single model)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/supabase-admin';
import { FAL_API_KEY } from '$env/static/private';

interface TestResult {
	model: string;
	modelName: string;
	provider: string;
	success: boolean;
	imageUrl?: string;
	error?: string;
	latencyMs: number;
}

export const GET: RequestHandler = async ({ url }) => {
	const singleModel = url.searchParams.get('model');

	// Build query for image_generation models
	let query = supabaseAdmin
		.from('models')
		.select('model_identifier, model_name, provider')
		.eq('model_type', 'image_generation')
		.order('provider')
		.order('model_name');

	if (singleModel) {
		query = query.eq('model_identifier', singleModel);
	}

	const { data: models, error } = await query;

	if (error) {
		console.error('[test-provider/image] DB error:', error);
		return json({ error: `Database error: ${error.message}` }, { status: 500 });
	}

	if (!models || models.length === 0) {
		return json({ error: 'No image_generation models found' }, { status: 404 });
	}

	const results: TestResult[] = [];

	// Test each model sequentially
	for (const model of models) {
		const startTime = Date.now();

		try {
			const imageUrl = await testImageProvider(model.provider, model.model_identifier);
			const latencyMs = Date.now() - startTime;

			results.push({
				model: model.model_identifier,
				modelName: model.model_name,
				provider: model.provider,
				success: true,
				imageUrl,
				latencyMs
			});
		} catch (e) {
			const latencyMs = Date.now() - startTime;
			results.push({
				model: model.model_identifier,
				modelName: model.model_name,
				provider: model.provider,
				success: false,
				error: e instanceof Error ? e.message : 'Unknown error',
				latencyMs
			});
		}
	}

	// Summary
	const passed = results.filter((r) => r.success).length;
	const failed = results.filter((r) => !r.success).length;

	return json({
		summary: {
			total: results.length,
			passed,
			failed
		},
		results
	});
};

async function testImageProvider(provider: string, modelId: string): Promise<string> {
	switch (provider) {
		case 'fal':
			return testFal(modelId);
		default:
			throw new Error(`Image provider not implemented: ${provider}`);
	}
}

/**
 * Test fal.ai image generation
 * Uses minimal settings: 256x256, simple prompt
 */
async function testFal(modelId: string): Promise<string> {
	if (!FAL_API_KEY) {
		throw new Error('FAL_API_KEY not configured');
	}

	// fal.ai REST API: https://fal.run/{model_id}
	const url = `https://fal.run/${modelId}`;

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Key ${FAL_API_KEY}`
		},
		body: JSON.stringify({
			prompt: 'A simple red square on white background',
			image_size: {
				width: 256,
				height: 256
			},
			num_inference_steps: 4, // Minimal steps for speed
			seed: 42,
			num_images: 1,
			enable_safety_checker: false
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Fal.ai ${response.status}: ${error}`);
	}

	const data = await response.json();

	// Fal.ai returns images array with url
	if (!data.images || !data.images[0] || !data.images[0].url) {
		throw new Error('Invalid response from Fal.ai - no image URL');
	}

	return data.images[0].url;
}
