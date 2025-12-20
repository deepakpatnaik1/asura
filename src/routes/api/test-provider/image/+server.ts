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
import { FAL_API_KEY, VENICE_API_KEY, MODELSLAB_API_KEY } from '$env/static/private';

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
		case 'venice':
			return testVenice(modelId);
		case 'modelslab':
			return testModelsLab(modelId);
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

/**
 * Test Venice AI image generation
 * Uses minimal settings: 256x256, simple prompt
 */
async function testVenice(modelId: string): Promise<string> {
	if (!VENICE_API_KEY) {
		throw new Error('VENICE_API_KEY not configured');
	}

	const response = await fetch('https://api.venice.ai/api/v1/image/generate', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${VENICE_API_KEY}`
		},
		body: JSON.stringify({
			model: modelId,
			prompt: 'A simple red square on white background',
			width: 256,
			height: 256,
			steps: 4,
			seed: 42,
			safe_mode: false
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Venice ${response.status}: ${error}`);
	}

	const data = await response.json();

	// Venice returns images array with base64 or url
	if (!data.images || !data.images[0]) {
		throw new Error('Invalid response from Venice - no images');
	}

	const imageData = data.images[0];

	// Return URL if present, otherwise indicate base64 was returned
	if (typeof imageData === 'string') {
		return `data:image/png;base64,${imageData.substring(0, 50)}...`;
	}
	if (imageData.url) {
		return imageData.url;
	}
	if (imageData.base64) {
		return `data:image/png;base64,${imageData.base64.substring(0, 50)}...`;
	}

	throw new Error('Invalid response from Venice - unexpected format');
}

/**
 * Test ModelsLab image generation
 * Uses minimal settings: 256x256, simple prompt
 * Note: ModelsLab may return async processing status
 */
async function testModelsLab(modelId: string): Promise<string> {
	if (!MODELSLAB_API_KEY) {
		throw new Error('MODELSLAB_API_KEY not configured');
	}

	const response = await fetch('https://modelslab.com/api/v6/images/text2img', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			key: MODELSLAB_API_KEY,
			model_id: modelId,
			prompt: 'A simple red square on white background',
			width: '256',
			height: '256',
			samples: '1',
			num_inference_steps: '4',
			seed: 42,
			safety_checker: 'no',
			enhance_prompt: 'no'
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`ModelsLab ${response.status}: ${error}`);
	}

	const data = await response.json();

	if (data.status === 'error') {
		throw new Error(`ModelsLab error: ${data.message || 'Unknown error'}`);
	}

	// Handle async processing
	if (data.status === 'processing') {
		const fetchResult = data.fetch_result;
		if (!fetchResult) {
			throw new Error('ModelsLab processing but no fetch_result URL');
		}

		// Poll for up to 30 seconds
		let attempts = 0;
		while (attempts < 30) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
			const pollResponse = await fetch(fetchResult, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ key: MODELSLAB_API_KEY })
			});
			const pollData = await pollResponse.json();
			if (pollData.status === 'success' && pollData.output && pollData.output[0]) {
				return pollData.output[0];
			}
			if (pollData.status === 'error') {
				throw new Error(`ModelsLab failed: ${pollData.message || 'Unknown error'}`);
			}
			attempts++;
		}
		throw new Error('ModelsLab generation timed out after 30s');
	}

	// Immediate success
	if (!data.output || !data.output[0]) {
		throw new Error('Invalid response from ModelsLab - no output');
	}

	return data.output[0];
}
