import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { VoyageAIClient } from 'voyageai';
import { VOYAGE_API_KEY, SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';
import { buildContextForCalls1A1B } from '$lib/context-builder';
import {
	DEFAULT_CONVERSATION_MODEL,
	DEFAULT_COMPRESSION_MODEL,
	EMBEDDING_MODEL
} from '$lib/config/models';
import { getModelParams } from '$lib/config/model-params';
import { DEFAULT_PERSONA } from '$lib/config/personas';
import {
	BASE_INSTRUCTIONS,
	PERSONA_GUNNAR,
	PERSONA_KIRBY,
	CALL1A_PROMPT,
	CALL2A_PROMPT
} from '$lib/prompts';
import { createMessage, createMessageStream } from '$lib/api/anthropic-client';

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

// Helper function to detect provider type
function getProviderType(modelIdentifier: string): 'anthropic' | 'openai' | 'fireworks' {
	if (modelIdentifier.startsWith('claude-')) {
		return 'anthropic';
	}
	if (modelIdentifier.startsWith('gpt-') || modelIdentifier.startsWith('o1-')) {
		return 'openai';
	}
	if (modelIdentifier.startsWith('accounts/fireworks/')) {
		return 'fireworks';
	}
	throw new Error(`Unknown model provider for identifier: ${modelIdentifier}`);
}

// Background function to save conversation to database
async function saveConversationToDatabase(
	userId: string,
	message: string,
	aiResponse: string,
	tokens: { input: number; output: number },
	conversationModel: string,
	persona: string
) {
	try {
		// Save to Superjournal
		const { data: superjournalData, error: dbError } = await supabase
			.from('superjournal')
			.insert({
				user_id: userId,
				persona_name: persona,
				user_message: message,
				ai_response: aiResponse,
				model_identifier: conversationModel
			})
			.select('id')
			.single();

		if (dbError) {
			console.error('[Database] Failed to save to superjournal:', dbError);
			return;
		}

		// Track token usage for this conversation turn
		if (superjournalData?.id) {
			try {
				const totalInputTokens = tokens.input;
				const totalOutputTokens = tokens.output;

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
				compressToJournal(superjournalData.id, userId, message, aiResponse, persona);
			}, 0);
		}
	} catch (error) {
		console.error('[Database] Error saving conversation:', error);
	}
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

		console.log(`[Compression] Starting Call 2 for superjournal_id: ${superjournalId}`);

		const compressionProvider = getProviderType(compressionModel);

		// Call 2: Artisan Cut compression
		let compressionOutput: string;

		if (compressionProvider === 'anthropic') {
			const response = await createMessage({
				model: compressionModel,
				max_tokens: compressionParams.max_tokens,
				temperature: compressionParams.temperature,
				system: [
					{
						type: 'text' as const,
						text: CALL2A_PROMPT,
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
			compressionOutput = response.content[0]?.type === 'text' ? response.content[0].text : '{}';
		} else {
			throw new Error(`Provider '${compressionProvider}' not implemented. Only 'anthropic' is currently supported.`);
		}
		console.log('[Compression] Call 2 output:', compressionOutput);

		let compressionJson;
		try {
			const cleanedOutput = extractJSON(compressionOutput);
			compressionJson = JSON.parse(cleanedOutput);
		} catch (parseError) {
			console.error('[Compression] JSON parse error:', parseError);
			console.error('[Compression] Raw output:', compressionOutput);
			return;
		}

		// Save to Journal table (without embedding initially)
		const { data: journalData, error: journalError } = await supabase
			.from('journal')
			.insert({
				superjournal_id: superjournalId,
				user_id: userId,
				persona_name: compressionJson.persona_name || personaName,
				boss_essence: compressionJson.boss_essence || userMessage,
				persona_essence: compressionJson.persona_essence || aiResponse,
				decision_arc_summary: compressionJson.decision_arc_summary || 'No arc generated',
				salience_score: compressionJson.salience_score || 5,
				is_starred: false,
				is_instruction: compressionJson.is_instruction || false,
				instruction_scope: compressionJson.instruction_scope || null,
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
			const decisionArc = compressionJson.decision_arc_summary || 'No arc generated';
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
		const selectedPersona = settings?.selected_persona || DEFAULT_PERSONA;

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

		// Construct system prompt with cache breakpoints
		// Cache only stable behavioral instructions (BASE_INSTRUCTIONS + PERSONA + CALL1A_PROMPT)
		// Context stays in user message to preserve proven prompt architecture
		const systemPromptWithCache = [
			{
				type: 'text' as const,
				text: `${BASE_INSTRUCTIONS}\n\n---\n\n${personaPrompt}`,
				cache_control: { type: 'ephemeral' as const }
			},
			{
				type: 'text' as const,
				text: CALL1A_PROMPT,
				cache_control: { type: 'ephemeral' as const }
			}
		];

		// Construct full user prompt with context (proven architecture)
		const fullUserPrompt = context.length > 0
			? `${context}--- CURRENT QUERY ---\n${message}`
			: message;

		// Stream response with BASE_INSTRUCTIONS + PERSONA + memory context
		const conversationProvider = getProviderType(conversationModel);

		if (conversationProvider === 'anthropic') {
			// Set up SSE headers for streaming
			const stream = new ReadableStream({
				async start(controller) {
					const encoder = new TextEncoder();

					try {
						// Start streaming from Anthropic API
						const streamResponse = await createMessageStream({
							model: conversationModel,
							max_tokens: conversationParams.max_tokens,
							temperature: conversationParams.temperature,
							system: systemPromptWithCache,
							messages: [
								{
									role: 'user',
									content: fullUserPrompt
								}
							]
						});

						let fullResponse = '';

						// Stream chunks to client
						for await (const event of streamResponse) {
							// Handle content delta events (actual text chunks)
							if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
								const chunk = event.delta.text;
								fullResponse += chunk;

								// Send chunk to client via SSE
								const data = JSON.stringify({ type: 'chunk', content: chunk });
								controller.enqueue(encoder.encode(`data: ${data}\n\n`));
							}
						}

						// Capture token counts AFTER loop completes
						const finalMessage = await streamResponse.finalMessage();
						const tokens = {
							input: finalMessage.usage.input_tokens,
							output: finalMessage.usage.output_tokens
						};

						const aiResponse = extractMessage(fullResponse);

						// Send completion event IMMEDIATELY (don't wait for database)
						const doneData = JSON.stringify({
							type: 'done',
							timestamp: new Date().toISOString(),
							model_identifier: conversationModel
						});
						controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
						controller.close();

						// Trigger background save AFTER stream closes
						saveConversationToDatabase(
							userId,
							message,
							aiResponse,
							tokens,
							conversationModel,
							persona
						).catch((error) => {
							console.error('[Background] Failed to save conversation:', error);
						});

					} catch (error) {
						console.error('Streaming error:', error);
						const errorData = JSON.stringify({ type: 'error', message: 'Failed to generate response' });
						controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
						controller.close();
					}
				}
			});

			// Return response immediately
			return new Response(stream, {
				headers: {
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-cache',
					'Connection': 'keep-alive'
				}
			});
		} else {
			throw new Error(`Provider '${conversationProvider}' not implemented. Only 'anthropic' is currently supported.`);
		}
	} catch (error) {
		console.error('Chat API error:', error);
		return json({ error: 'Failed to generate response' }, { status: 500 });
	}
};
