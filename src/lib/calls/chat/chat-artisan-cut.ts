/**
 * Chat Artisan Cut Call
 *
 * Compresses a conversation turn into journal entry format.
 * Takes a full turn, returns structured artisan cut.
 * Supports multiple providers: Anthropic and OpenRouter.
 */

import { OPENROUTER_API_KEY } from '$env/static/private';
import { createMessage } from '$lib/api/anthropic-client';
import { CHAT_ARTISAN_CUT_PROMPT } from '$lib/prompts';
import { compressUserFormat } from '$lib/prompts/templates';
import { getModelProvider, type ProviderType } from './provider';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export interface ArtisanCutParams {
	userMessage: string;
	aiResponse: string;
	personaName: string;
	model: string;
	maxTokens: number;
	temperature: number;
}

export interface ArtisanCutResult {
	turn_essence: string;
	participants: string[];
	conversation_arc: string;
	salience_score: number;
}

/**
 * Extract JSON from LLM output (handles <think> tags)
 */
function extractJSON(text: string): string {
	// Remove <think> tags and content between them
	const withoutThink = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

	// Find the first { and last } to extract JSON object
	const firstBrace = withoutThink.indexOf('{');
	const lastBrace = withoutThink.lastIndexOf('}');

	if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
		return withoutThink.substring(firstBrace, lastBrace + 1);
	}

	return withoutThink;
}

/**
 * Artisan cut using Anthropic API
 */
async function artisanCutWithAnthropic(params: ArtisanCutParams): Promise<string> {
	const { userMessage, aiResponse, personaName, model, maxTokens, temperature } = params;

	const response = await createMessage({
		model,
		max_tokens: maxTokens,
		temperature,
		system: [
			{
				type: 'text' as const,
				text: CHAT_ARTISAN_CUT_PROMPT,
				cache_control: { type: 'ephemeral' as const, ttl: '1h' as const }
			}
		],
		messages: [
			{
				role: 'user',
				content: compressUserFormat(userMessage, personaName, aiResponse)
			}
		]
	});

	return response.content[0]?.type === 'text' ? response.content[0].text : '{}';
}

/**
 * Artisan cut using OpenRouter API (non-streaming)
 */
async function artisanCutWithOpenRouter(params: ArtisanCutParams): Promise<string> {
	const { userMessage, aiResponse, personaName, model, maxTokens, temperature } = params;

	const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${OPENROUTER_API_KEY}`,
			'HTTP-Referer': 'https://aether.vercel.app',
			'X-Title': 'Aether - Artisan Cut'
		},
		body: JSON.stringify({
			model,
			messages: [
				{ role: 'system', content: CHAT_ARTISAN_CUT_PROMPT },
				{ role: 'user', content: compressUserFormat(userMessage, personaName, aiResponse) }
			],
			max_tokens: maxTokens,
			temperature,
			stream: false
		})
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`OpenRouter artisan cut failed: ${response.status} - ${errorText}`);
	}

	const data = await response.json();
	return data.choices?.[0]?.message?.content || '{}';
}

/**
 * Run artisan cut on a conversation turn.
 * Automatically routes to the correct provider based on the model.
 *
 * @param params - Artisan cut parameters
 * @returns Artisan cut journal entry data
 * @throws Error if artisan cut or JSON parsing fails
 */
export async function artisanCut(params: ArtisanCutParams): Promise<ArtisanCutResult> {
	const { userMessage, aiResponse, personaName, model } = params;

	// Look up provider from database
	const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
	let provider: ProviderType;
	try {
		provider = await getModelProvider(supabase, model);
	} catch {
		// Default to Anthropic if model not found
		provider = 'anthropic';
	}

	// Route to appropriate provider
	let rawOutput: string;
	if (provider === 'openrouter') {
		rawOutput = await artisanCutWithOpenRouter(params);
	} else {
		// Default to Anthropic for all other providers
		rawOutput = await artisanCutWithAnthropic(params);
	}

	const cleanedOutput = extractJSON(rawOutput);
	const parsed = JSON.parse(cleanedOutput);

	return {
		turn_essence: parsed.turn_essence || `Boss: ${userMessage}\n${personaName}: ${aiResponse}`,
		participants: parsed.participants || ['boss', personaName.toLowerCase()],
		conversation_arc: parsed.conversation_arc || 'No arc generated',
		salience_score: parsed.salience_score || 5
	};
}
