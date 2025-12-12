/**
 * Provider Test Endpoint
 *
 * Quick verification that a model's provider is correctly wired up.
 * Makes a minimal API call with "Say hi" and returns success/failure.
 *
 * Usage: GET /api/test-provider?model=gpt-5.2-chat-latest
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/supabase-admin';
import {
	OPENAI_API_KEY,
	GOOGLE_AI_API_KEY,
	FIREWORKS_API_KEY,
	OPENROUTER_API_KEY,
	TOGETHER_API_KEY,
	GROQ_API_KEY,
	REPLICATE_API_KEY,
	ANTHROPIC_API_KEY
} from '$env/static/private';

interface TestResult {
	model: string;
	provider: string;
	success: boolean;
	response?: string;
	error?: string;
	latencyMs: number;
}

export const GET: RequestHandler = async ({ url }) => {
	const modelId = url.searchParams.get('model');

	if (!modelId) {
		return json({ error: 'model parameter required' }, { status: 400 });
	}

	// Look up provider from database
	const { data: models, error: dbError } = await supabaseAdmin
		.from('models')
		.select('provider, model_name')
		.eq('model_identifier', modelId);

	if (dbError) {
		console.error('[test-provider] DB error:', dbError);
		return json({ error: `Database error: ${dbError.message}` }, { status: 500 });
	}

	if (!models || models.length === 0) {
		return json({ error: `Model not found: ${modelId}` }, { status: 404 });
	}

	const modelData = models[0];

	const provider = modelData.provider;
	const startTime = Date.now();

	try {
		const response = await testProvider(provider, modelId);
		const latencyMs = Date.now() - startTime;

		const result: TestResult = {
			model: modelId,
			provider,
			success: true,
			response: response.slice(0, 200),
			latencyMs
		};

		return json(result);
	} catch (e) {
		const latencyMs = Date.now() - startTime;
		const result: TestResult = {
			model: modelId,
			provider,
			success: false,
			error: e instanceof Error ? e.message : 'Unknown error',
			latencyMs
		};

		return json(result);
	}
};

async function testProvider(provider: string, model: string): Promise<string> {
	const testMessage = 'Say "hello" and nothing else.';

	switch (provider) {
		case 'anthropic':
			return testAnthropic(model, testMessage);
		case 'openai':
			return testOpenAI(model, testMessage);
		case 'google':
			return testGoogle(model, testMessage);
		case 'fireworks':
			return testFireworks(model, testMessage);
		case 'openrouter':
			return testOpenRouter(model, testMessage);
		case 'together':
			return testTogether(model, testMessage);
		case 'groq':
			return testGroq(model, testMessage);
		case 'replicate':
			return testReplicate(model, testMessage);
		default:
			throw new Error(`Provider not implemented: ${provider}`);
	}
}

async function testAnthropic(model: string, message: string): Promise<string> {
	const response = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': ANTHROPIC_API_KEY,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify({
			model,
			max_tokens: 50,
			messages: [{ role: 'user', content: message }]
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Anthropic ${response.status}: ${error}`);
	}

	const data = await response.json();
	return data.content?.[0]?.text || '';
}

async function testOpenAI(model: string, message: string): Promise<string> {
	const response = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${OPENAI_API_KEY}`
		},
		body: JSON.stringify({
			model,
			max_completion_tokens: 50,
			messages: [{ role: 'user', content: message }]
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`OpenAI ${response.status}: ${error}`);
	}

	const data = await response.json();
	return data.choices?.[0]?.message?.content || '';
}

async function testGoogle(model: string, message: string): Promise<string> {
	const response = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_AI_API_KEY}`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [{ parts: [{ text: message }] }],
				generationConfig: { maxOutputTokens: 50 }
			})
		}
	);

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Google ${response.status}: ${error}`);
	}

	const data = await response.json();
	return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function testFireworks(model: string, message: string): Promise<string> {
	const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${FIREWORKS_API_KEY}`
		},
		body: JSON.stringify({
			model, // Model ID already includes accounts/fireworks/models/ prefix
			max_tokens: 50,
			messages: [{ role: 'user', content: message }]
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Fireworks ${response.status}: ${error}`);
	}

	const data = await response.json();
	return data.choices?.[0]?.message?.content || '';
}

async function testOpenRouter(model: string, message: string): Promise<string> {
	const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${OPENROUTER_API_KEY}`
		},
		body: JSON.stringify({
			model,
			max_tokens: 50,
			messages: [{ role: 'user', content: message }]
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`OpenRouter ${response.status}: ${error}`);
	}

	const data = await response.json();
	return data.choices?.[0]?.message?.content || '';
}

async function testTogether(model: string, message: string): Promise<string> {
	const response = await fetch('https://api.together.xyz/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${TOGETHER_API_KEY}`
		},
		body: JSON.stringify({
			model,
			max_tokens: 50,
			messages: [{ role: 'user', content: message }]
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Together ${response.status}: ${error}`);
	}

	const data = await response.json();
	return data.choices?.[0]?.message?.content || '';
}

async function testGroq(model: string, message: string): Promise<string> {
	const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${GROQ_API_KEY}`
		},
		body: JSON.stringify({
			model,
			max_tokens: 50,
			messages: [{ role: 'user', content: message }]
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Groq ${response.status}: ${error}`);
	}

	const data = await response.json();
	return data.choices?.[0]?.message?.content || '';
}

async function testReplicate(model: string, message: string): Promise<string> {
	// Replicate now accepts owner/name format for official models (Aug 2025 update)
	// Use the models endpoint which handles version resolution automatically
	const response = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${REPLICATE_API_KEY}`,
			Prefer: 'wait' // Wait for result synchronously (up to 60s)
		},
		body: JSON.stringify({
			input: {
				prompt: message,
				max_new_tokens: 50
			}
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Replicate ${response.status}: ${error}`);
	}

	const result = await response.json();

	// With Prefer: wait, we get the completed prediction directly
	if (result.status === 'succeeded') {
		const output = result.output;
		if (Array.isArray(output)) return output.join('');
		if (typeof output === 'string') return output;
		return JSON.stringify(output) || '';
	}

	if (result.status === 'failed') {
		throw new Error(`Replicate prediction failed: ${result.error}`);
	}

	// If still processing (shouldn't happen with Prefer: wait), return status
	throw new Error(`Replicate prediction not ready: ${result.status}`);
}
