/**
 * Test All Providers Endpoint
 *
 * Tests all text_generation models in the database.
 * Returns a summary report of pass/fail for each model.
 *
 * Usage: GET /api/test-provider/all
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/supabase-admin';

interface TestResult {
	model: string;
	modelName: string;
	provider: string;
	success: boolean;
	response?: string;
	error?: string;
	latencyMs: number;
}

export const GET: RequestHandler = async ({ fetch }) => {
	// Get all text_generation models
	const { data: models, error } = await supabaseAdmin
		.from('models')
		.select('model_identifier, model_name, provider')
		.eq('model_type', 'text_generation')
		.order('provider')
		.order('model_name');

	if (error) {
		console.error('[test-provider/all] DB error:', error);
		return json({ error: `Database error: ${error.message}` }, { status: 500 });
	}

	if (!models || models.length === 0) {
		return json({ error: 'No active text_generation models found' }, { status: 404 });
	}

	const results: TestResult[] = [];

	// Test each model sequentially (to avoid rate limits)
	for (const model of models) {
		try {
			const response = await fetch(`/api/test-provider?model=${encodeURIComponent(model.model_identifier)}`);
			const result = await response.json();

			results.push({
				model: model.model_identifier,
				modelName: model.model_name,
				provider: model.provider,
				success: result.success,
				response: result.response,
				error: result.error,
				latencyMs: result.latencyMs
			});
		} catch (e) {
			results.push({
				model: model.model_identifier,
				modelName: model.model_name,
				provider: model.provider,
				success: false,
				error: e instanceof Error ? e.message : 'Unknown error',
				latencyMs: 0
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
