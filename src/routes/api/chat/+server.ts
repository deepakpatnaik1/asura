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
import { PERSONA_GUNNAR, PERSONA_KIRBY } from '$lib/prompts';
import { converseStream, compress } from '$lib/calls';

const voyage = new VoyageAIClient({ apiKey: VOYAGE_API_KEY });

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Retry delays: 1 minute, 5 minutes, 10 minutes
const RETRY_DELAYS = [60_000, 300_000, 600_000];

// Retry wrapper for database operations
function scheduleRetries(
	fn: () => Promise<void>,
	label: string,
	delays: number[] = RETRY_DELAYS
) {
	for (const delay of delays) {
		setTimeout(async () => {
			try {
				await fn();
				console.log(`[${label}] Retry succeeded after ${delay / 1000}s`);
			} catch (error) {
				console.error(`[${label}] Retry at ${delay / 1000}s failed:`, error);
			}
		}, delay);
	}
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
	conversationModel: string,
	persona: string
) {
	const saveToSuperjournal = async (): Promise<string | null> => {
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
			throw new Error(`Superjournal insert failed: ${dbError.message}`);
		}

		return superjournalData?.id || null;
	};

	try {
		const superjournalId = await saveToSuperjournal();

		if (superjournalId) {
			console.log(`[Database] Saved to superjournal: ${superjournalId}`);
			// Trigger background compression
			setTimeout(() => {
				compressToJournal(superjournalId, userId, message, aiResponse, persona);
			}, 0);
		}
	} catch (error) {
		console.error('[Database] Initial save failed, scheduling retries:', error);
		// Schedule retries at 1min, 5min, 10min
		scheduleRetries(async () => {
			const superjournalId = await saveToSuperjournal();
			if (superjournalId) {
				// Trigger compression after successful retry
				compressToJournal(superjournalId, userId, message, aiResponse, persona);
			}
		}, 'Superjournal Save');
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
	const doCompression = async () => {
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

		if (compressionProvider !== 'anthropic') {
			throw new Error(`Provider '${compressionProvider}' not implemented. Only 'anthropic' is currently supported.`);
		}

		// Call 2: Artisan Cut compression
		const compressionJson = await compress({
			userMessage,
			aiResponse,
			personaName,
			model: compressionModel,
			maxTokens: compressionParams.max_tokens,
			temperature: compressionParams.temperature
		});
		console.log('[Compression] Call 2 output:', compressionJson);

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
			throw new Error(`Journal insert failed: ${journalError.message}`);
		}

		console.log('[Compression] Successfully saved to Journal');

		// Generate embedding for decision_arc_summary
		const decisionArc = compressionJson.decision_arc_summary || 'No arc generated';
		console.log('[Embedding] Generating embedding for arc:', decisionArc);

		const embeddingResponse = await voyage.embed({
			input: decisionArc,
			model: EMBEDDING_MODEL // 1024 dimensions (default)
		});

		const embedding = embeddingResponse.data?.[0]?.embedding;
		if (!embedding) {
			throw new Error('No embedding data returned from Voyage');
		}

		// Update Journal row with embedding
		const { error: updateError } = await supabase
			.from('journal')
			.update({ embedding: JSON.stringify(embedding) })
			.eq('id', journalData.id);

		if (updateError) {
			throw new Error(`Embedding update failed: ${updateError.message}`);
		}

		console.log('[Embedding] Successfully generated and saved embedding');
	};

	try {
		await doCompression();
	} catch (error) {
		console.error('[Compression] Initial attempt failed, scheduling retries:', error);
		scheduleRetries(doCompression, `Compression ${superjournalId}`);
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

		// Stream response with PERSONA + memory context
		const conversationProvider = getProviderType(conversationModel);

		if (conversationProvider !== 'anthropic') {
			throw new Error(`Provider '${conversationProvider}' not implemented. Only 'anthropic' is currently supported.`);
		}

		// Set up SSE headers for streaming
		const stream = new ReadableStream({
			async start(controller) {
				const encoder = new TextEncoder();

				try {
					// Start streaming using converseStream call
					const generator = converseStream({
						personaPrompt,
						context,
						message,
						model: conversationModel,
						maxTokens: conversationParams.max_tokens,
						temperature: conversationParams.temperature
					});

					let result;
					// Stream chunks to client
					while (true) {
						const { value, done } = await generator.next();
						if (done) {
							result = value;
							break;
						}
						// Send chunk to client via SSE
						const data = JSON.stringify({ type: 'chunk', content: value });
						controller.enqueue(encoder.encode(`data: ${data}\n\n`));
					}

					const aiResponse = extractMessage(result.fullResponse);

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
						conversationModel,
						persona
					);

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
	} catch (error) {
		console.error('Chat API error:', error);
		return json({ error: 'Failed to generate response' }, { status: 500 });
	}
};
