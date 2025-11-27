/**
 * Chat Compress Call (Artisan Cut)
 *
 * Compresses a conversation turn into journal entry format.
 * Takes a full turn, returns structured compression.
 */

import { createMessage } from '$lib/api/anthropic-client';
import { CALL2_PROMPT } from '$lib/prompts';

export interface CompressParams {
	userMessage: string;
	aiResponse: string;
	personaName: string;
	model: string;
	maxTokens: number;
	temperature: number;
}

export interface CompressResult {
	boss_essence: string;
	persona_name: string;
	persona_essence: string;
	decision_arc_summary: string;
	salience_score: number;
	is_instruction?: boolean;
	instruction_scope?: string | null;
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
 * Compress a conversation turn using Artisan Cut.
 *
 * @param params - Compression parameters
 * @returns Compressed journal entry data
 * @throws Error if compression or JSON parsing fails
 */
export async function compress(params: CompressParams): Promise<CompressResult> {
	const { userMessage, aiResponse, personaName, model, maxTokens, temperature } = params;

	const response = await createMessage({
		model,
		max_tokens: maxTokens,
		temperature,
		system: [
			{
				type: 'text' as const,
				text: CALL2_PROMPT,
				cache_control: { type: 'ephemeral' as const }
			}
		],
		messages: [
			{
				role: 'user',
				content: `User message: ${userMessage}\n\nPersona (${personaName}) response: ${aiResponse}`
			}
		]
	});

	const rawOutput = response.content[0]?.type === 'text' ? response.content[0].text : '{}';
	const cleanedOutput = extractJSON(rawOutput);

	const parsed = JSON.parse(cleanedOutput);

	return {
		boss_essence: parsed.boss_essence || userMessage,
		persona_name: parsed.persona_name || personaName,
		persona_essence: parsed.persona_essence || aiResponse,
		decision_arc_summary: parsed.decision_arc_summary || 'No arc generated',
		salience_score: parsed.salience_score || 5,
		is_instruction: parsed.is_instruction || false,
		instruction_scope: parsed.instruction_scope || null
	};
}
