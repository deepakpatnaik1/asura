import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import OpenAI from 'openai';
import { VoyageAIClient } from 'voyageai';
import { FIREWORKS_API_KEY, VOYAGE_API_KEY, SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';
import { buildContextForCalls1A1B } from '$lib/context-builder';
import {
	DEFAULT_CONVERSATION_MODEL,
	DEFAULT_COMPRESSION_MODEL,
	EMBEDDING_MODEL
} from '$lib/config/models';
import { getModelParams } from '$lib/config/model-params';
import {
	BASE_INSTRUCTIONS,
	PERSONA_GUNNAR,
	PERSONA_KIRBY,
	CALL1A_PROMPT,
	CALL1B_PROMPT,
	CALL2A_PROMPT,
	CALL2B_PROMPT
} from '$lib/prompts';
import { createMessage } from '$lib/api/anthropic-client';

const fireworks = new OpenAI({
	baseURL: 'https://api.fireworks.ai/inference/v1',
	apiKey: FIREWORKS_API_KEY
});

const voyage = new VoyageAIClient({ apiKey: VOYAGE_API_KEY });

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Helper function to extract JSON from LLM output (handles <think> tags)
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

// Helper function to extract thinking content from <think> tags
function extractThinking(text: string): string {
	const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/);
	return thinkMatch ? thinkMatch[1].trim() : '';
}

// Helper function to extract message content (everything outside <think> tags)
function extractMessage(text: string): string {
	return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

// Helper function to detect if model is Anthropic
function isAnthropicModel(modelIdentifier: string): boolean {
	return modelIdentifier.startsWith('claude-');
}

// Background compression function
async function compressToJournal(
	superjournalId: string,
	userId: string,
	userMessage: string,
	aiResponse: string,
	personaName: string
) {
	try {
		// Read selected compression model from user_settings table
		const { data: settings } = await supabase
			.from('user_settings')
			.select('selected_compression_model')
			.eq('user_id', userId)
			.single();

		const compressionModel = settings?.selected_compression_model || DEFAULT_COMPRESSION_MODEL;

		// Fetch compression parameters from database
		const compressionParams = await getModelParams(compressionModel, 'compression');

		console.log(`[Compression] Starting Call 2A/2B for superjournal_id: ${superjournalId}`);

		const isAnthropicCompression = isAnthropicModel(compressionModel);

		// Call 2A: Initial Artisan Cut compression
		let call2AOutput: string;

		if (isAnthropicCompression) {
			// Use Anthropic API
			const response = await createMessage({
				model: compressionModel,
				max_tokens: compressionParams.max_tokens,
				temperature: compressionParams.temperature,
				system: CALL2A_PROMPT,
				messages: [
					{
						role: 'user',
						content: `User message: ${userMessage}\n\nPersona (${personaName}) response: ${aiResponse}`
					}
				]
			});
			call2AOutput = response.content[0]?.type === 'text' ? response.content[0].text : '{}';
		} else {
			// Use Fireworks API
			const response = await fireworks.chat.completions.create({
				model: compressionModel,
				messages: [
					{
						role: 'system',
						content: CALL2A_PROMPT
					},
					{
						role: 'user',
						content: `User message: ${userMessage}\n\nPersona (${personaName}) response: ${aiResponse}`
					}
				],
				max_tokens: compressionParams.max_tokens,
				temperature: compressionParams.temperature
			});
			call2AOutput = response.choices[0]?.message?.content || '{}';
		}
		console.log('[Compression] Call 2A output:', call2AOutput);

		let call2AJson;
		try {
			const cleanedOutput = extractJSON(call2AOutput);
			call2AJson = JSON.parse(cleanedOutput);
		} catch (parseError) {
			console.error('[Compression] Call 2A JSON parse error:', parseError);
			console.error('[Compression] Raw output:', call2AOutput);
			return; // Abort if Call 2A output is invalid
		}

		// Call 2B: Verification and refinement
		let call2BOutput: string;

		if (isAnthropicCompression) {
			// Use Anthropic API
			const response = await createMessage({
				model: compressionModel,
				max_tokens: compressionParams.max_tokens,
				temperature: compressionParams.temperature,
				system: CALL2A_PROMPT,
				messages: [
					{
						role: 'assistant',
						content: JSON.stringify(call2AJson)
					},
					{
						role: 'user',
						content: CALL2B_PROMPT
					}
				]
			});
			call2BOutput = response.content[0]?.type === 'text' ? response.content[0].text : '{}';
		} else {
			// Use Fireworks API
			const response = await fireworks.chat.completions.create({
				model: compressionModel,
				messages: [
					{
						role: 'system',
						content: CALL2A_PROMPT
					},
					{
						role: 'assistant',
						content: JSON.stringify(call2AJson)
					},
					{
						role: 'user',
						content: CALL2B_PROMPT
					}
				],
				max_tokens: compressionParams.max_tokens,
				temperature: compressionParams.temperature
			});
			call2BOutput = response.choices[0]?.message?.content || '{}';
		}
		console.log('[Compression] Call 2B output:', call2BOutput);

		let call2BJson;
		try {
			const cleanedOutput = extractJSON(call2BOutput);
			call2BJson = JSON.parse(cleanedOutput);
		} catch (parseError) {
			console.error('[Compression] Call 2B JSON parse error:', parseError);
			console.error('[Compression] Raw output:', call2BOutput);
			return; // Abort if Call 2B output is invalid
		}

		// Save to Journal table (without embedding initially)
		const { data: journalData, error: journalError } = await supabase
			.from('journal')
			.insert({
				superjournal_id: superjournalId,
				user_id: userId,
				persona_name: call2BJson.persona_name || personaName,
				boss_essence: call2BJson.boss_essence || userMessage,
				persona_essence: call2BJson.persona_essence || aiResponse,
				decision_arc_summary: call2BJson.decision_arc_summary || 'No arc generated',
				salience_score: call2BJson.salience_score || 5,
				is_starred: false,
				is_instruction: call2BJson.is_instruction || false,
				instruction_scope: call2BJson.instruction_scope || null,
				file_name: null,
				file_type: null,
				embedding: null
			})
			.select('id')
			.single();

		if (journalError) {
			console.error('[Compression] Journal insert error:', journalError);
			return;
		}

		console.log('[Compression] Successfully saved to Journal');

		// Generate embedding for decision_arc_summary
		try {
			const decisionArc = call2BJson.decision_arc_summary || 'No arc generated';
			console.log('[Embedding] Generating embedding for arc:', decisionArc);

			const embeddingResponse = await voyage.embed({
				input: decisionArc,
				model: EMBEDDING_MODEL // 1024 dimensions (default)
			});

			const embedding = embeddingResponse.data[0].embedding;

			// Update Journal row with embedding
			const { error: updateError } = await supabase
				.from('journal')
				.update({ embedding: JSON.stringify(embedding) })
				.eq('id', journalData.id);

			if (updateError) {
				console.error('[Embedding] Failed to update embedding:', updateError);
			} else {
				console.log('[Embedding] Successfully generated and saved embedding');
			}
		} catch (embeddingError) {
			console.error('[Embedding] Failed to generate embedding:', embeddingError);
		}
	} catch (error) {
		console.error('[Compression] Background compression error:', error);
	}
}

export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	try {
		// 1. AUTHENTICATION CHECK
		const { user } = await safeGetSession();
		if (!user) {
			return json(
				{
					error: {
						message: 'Unauthorized - must be logged in',
						code: 'UNAUTHORIZED'
					}
				},
				{ status: 401 }
			);
		}
		const userId = user.id;

		// 2. Read selected conversation model and persona from user_settings table
		const { data: settings } = await supabase
			.from('user_settings')
			.select('selected_conversation_model, selected_persona')
			.eq('user_id', userId)
			.single();

		const conversationModel = settings?.selected_conversation_model || DEFAULT_CONVERSATION_MODEL;
		const selectedPersona = settings?.selected_persona || 'gunnar';

		// Fetch conversation parameters from database
		const conversationParams = await getModelParams(conversationModel, 'conversation');

		const { message, persona = selectedPersona } = await request.json();

		if (!message) {
			return json({ error: 'Message is required' }, { status: 400 });
		}

		// Build context for Call 1A/1B (memory injection with vector search)
		const { context, stats } = await buildContextForCalls1A1B(
			userId, // Authenticated user ID
			persona, // current persona for instruction filtering
			conversationModel,
			message // user query for vector search (Priority 5)
		);

		console.log('[Chat API] Context stats:', stats);

		// Select persona prompt based on selected persona
		const personaPrompt = persona === 'kirby' ? PERSONA_KIRBY : PERSONA_GUNNAR;

		// Construct system prompt (BASE_INSTRUCTIONS + PERSONA + CALL1A_PROMPT)
		const systemPrompt = `${BASE_INSTRUCTIONS}\n\n---\n\n${personaPrompt}\n\n---\n\n${CALL1A_PROMPT}`;

		// Construct full user prompt with memory context
		const fullUserPrompt = context.length > 0
			? `${context}--- CURRENT QUERY ---\n${message}`
			: message;

		// Call 1A: Initial response with BASE_INSTRUCTIONS + PERSONA + memory context
		const isAnthropic = isAnthropicModel(conversationModel);
		let call1AResponse: string;
		let call1ATokens: { input: number; output: number };

		if (isAnthropic) {
			// Use Anthropic API
			const response = await createMessage({
				model: conversationModel,
				max_tokens: conversationParams.max_tokens,
				temperature: conversationParams.temperature,
				system: systemPrompt,
				messages: [
					{
						role: 'user',
						content: fullUserPrompt
					}
				]
			});
			call1AResponse = response.content[0]?.type === 'text' ? response.content[0].text : 'No response generated';
			call1ATokens = {
				input: response.usage.input_tokens,
				output: response.usage.output_tokens
			};
		} else {
			// Use Fireworks API
			const response = await fireworks.chat.completions.create({
				model: conversationModel,
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: fullUserPrompt }
				],
				max_tokens: conversationParams.max_tokens,
				temperature: conversationParams.temperature
			});
			call1AResponse = response.choices[0]?.message?.content || 'No response generated';
			call1ATokens = {
				input: response.usage?.prompt_tokens || 0,
				output: response.usage?.completion_tokens || 0
			};
		}

		// Extract thinking and message from Call 1A
		const call1AThinking = extractThinking(call1AResponse);
		const call1AMessage = extractMessage(call1AResponse);

		// Construct system prompt for Call 1B (BASE_INSTRUCTIONS + PERSONA, without CALL1A_PROMPT)
		const call1BSystemPrompt = `${BASE_INSTRUCTIONS}\n\n---\n\n${personaPrompt}`;

		// Call 1B: Refine response with CALL1B_PROMPT
		// Note: Call 1B receives the SAME context as Call 1A (for informed critique)
		let call1BResponse: string;
		let call1BTokens: { input: number; output: number };

		if (isAnthropic) {
			// Use Anthropic API
			const response = await createMessage({
				model: conversationModel,
				max_tokens: conversationParams.max_tokens,
				temperature: conversationParams.temperature,
				system: call1BSystemPrompt,
				messages: [
					{
						role: 'user',
						content: fullUserPrompt // Same context as Call 1A
					},
					{
						role: 'assistant',
						content: call1AMessage // Only the message, not the thinking
					},
					{
						role: 'user',
						content: CALL1B_PROMPT
					}
				]
			});
			call1BResponse = response.content[0]?.type === 'text' ? response.content[0].text : 'No response generated';
			call1BTokens = {
				input: response.usage.input_tokens,
				output: response.usage.output_tokens
			};
		} else {
			// Use Fireworks API
			const response = await fireworks.chat.completions.create({
				model: conversationModel,
				messages: [
					{ role: 'system', content: call1BSystemPrompt },
					{ role: 'user', content: fullUserPrompt }, // Same context as Call 1A
					{ role: 'assistant', content: call1AMessage }, // Only the message, not the thinking
					{ role: 'user', content: CALL1B_PROMPT }
				],
				max_tokens: conversationParams.max_tokens,
				temperature: conversationParams.temperature
			});
			call1BResponse = response.choices[0]?.message?.content || 'No response generated';
			call1BTokens = {
				input: response.usage?.prompt_tokens || 0,
				output: response.usage?.completion_tokens || 0
			};
		}

		const call1BMessage = extractMessage(call1BResponse);

		// Save to Superjournal
		const { data: superjournalData, error: dbError } = await supabase
			.from('superjournal')
			.insert({
				user_id: userId,
				persona_name: persona,
				user_message: message,
				ai_response: call1BMessage,
					model_identifier: conversationModel
			})
			.select('id')
			.single();

		if (dbError) {
			console.error('Database error:', dbError);
			return json({ error: 'Failed to save message' }, { status: 500 });
		}

		// Track token usage for this conversation turn
		if (superjournalData?.id) {
			try {
				// Sum tokens from Call 1A + Call 1B
				const totalInputTokens = call1ATokens.input + call1BTokens.input;
				const totalOutputTokens = call1ATokens.output + call1BTokens.output;

				// Fetch pricing for the conversation model
				const { data: modelData, error: modelError } = await supabase
					.from('models')
					.select('input_price_per_million, output_price_per_million')
					.eq('model_identifier', conversationModel)
					.single();

				if (modelError) {
					console.error('[Token Tracking] Failed to fetch model pricing:', modelError);
				} else if (modelData) {
					// Calculate cost in USD
					const inputCost = (totalInputTokens / 1_000_000) * modelData.input_price_per_million;
					const outputCost = (totalOutputTokens / 1_000_000) * modelData.output_price_per_million;
					const totalCost = inputCost + outputCost;

					// Insert token usage record
					const { error: tokenError } = await supabase.from('token_usage').insert({
						user_id: userId,
						conversation_id: superjournalData.id,
						model_identifier: conversationModel,
						total_input_tokens: totalInputTokens,
						total_output_tokens: totalOutputTokens,
						cost_usd: totalCost
					});

					if (tokenError) {
						console.error('[Token Tracking] Failed to save token usage:', tokenError);
					} else {
						console.log(
							`[Token Tracking] Saved: ${totalInputTokens} input, ${totalOutputTokens} output, $${totalCost.toFixed(6)} cost`
						);
					}
				}
			} catch (tokenTrackingError) {
				console.error('[Token Tracking] Error:', tokenTrackingError);
			}

			// Trigger background compression
			setTimeout(() => {
				compressToJournal(superjournalData.id, userId, message, call1BMessage, persona);
			}, 0);
		}

		// Return simple JSON response
		return json({
			message: call1BMessage,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Chat API error:', error);
		return json({ error: 'Failed to generate response' }, { status: 500 });
	}
};
