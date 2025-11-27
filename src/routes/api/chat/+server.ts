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
import { parseRequestJson } from '$lib/api/parse-json';
import { requireAuth } from '$lib/api/require-auth';
import { waitForRateLimit, RATE_LIMITS } from '$lib/api/rate-limit';
import { createLogger, createSimpleLogger } from '$lib/api/logger';
import { chatMessageSchema, validateSchema } from '$lib/schemas';
import { internalError } from '$lib/api/errors';

const voyage = new VoyageAIClient({ apiKey: VOYAGE_API_KEY });

// Service role client for background operations (after stream closes)
const supabaseServiceRole = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Retry delays: 1 minute, 5 minutes, 10 minutes
const RETRY_DELAYS = [60_000, 300_000, 600_000];

// Background logger (no request context)
const bgLog = createSimpleLogger('ChatBackground');

// Retry wrapper for database operations
function scheduleRetries(
	fn: () => Promise<void>,
	label: string,
	userId: string,
	delays: number[] = RETRY_DELAYS
) {
	const log = createLogger('ChatRetry', userId);
	for (const delay of delays) {
		setTimeout(async () => {
			try {
				await fn();
				log.info('Retry succeeded', { label, delaySeconds: delay / 1000 });
			} catch (error) {
				log.error('Retry failed', { label, delaySeconds: delay / 1000, error: error instanceof Error ? error.message : 'Unknown' });
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
	const log = createLogger('ChatSave', userId);

	const saveToSuperjournal = async (): Promise<string | null> => {
		const { data: superjournalData, error: dbError } = await supabaseServiceRole
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
			log.info('Saved to superjournal', { superjournalId });
			// Trigger background compression
			setTimeout(() => {
				compressToJournal(superjournalId, userId, message, aiResponse, persona);
			}, 0);
		}
	} catch (error) {
		log.error('Initial save failed, scheduling retries', { error: error instanceof Error ? error.message : 'Unknown' });
		// Schedule retries at 1min, 5min, 10min
		scheduleRetries(async () => {
			const superjournalId = await saveToSuperjournal();
			if (superjournalId) {
				// Trigger compression after successful retry
				compressToJournal(superjournalId, userId, message, aiResponse, persona);
			}
		}, 'SuperjournalSave', userId);
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
	const log = createLogger('Compression', userId);

	const doCompression = async () => {
		// Read selected compression model from user_settings table
		const { data: settings } = await supabaseServiceRole
			.from('user_settings')
			.select('selected_compression_model')
			.eq('user_id', userId)
			.single();

		const compressionModel = settings?.selected_compression_model || DEFAULT_COMPRESSION_MODEL;

		// Fetch compression parameters from database
		const compressionParams = await getModelParams(compressionModel, 'compression');

		log.info('Starting compression', { superjournalId, model: compressionModel });

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
		log.debug('Compression output', { salienceScore: compressionJson.salience_score, isInstruction: compressionJson.is_instruction });

		// Save to Journal table (without embedding initially)
		const { data: journalData, error: journalError } = await supabaseServiceRole
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

		log.info('Saved to journal', { journalId: journalData.id });

		// Generate embedding for decision_arc_summary
		const decisionArc = compressionJson.decision_arc_summary || 'No arc generated';
		log.debug('Generating embedding', { arcLength: decisionArc.length });

		const embeddingResponse = await voyage.embed({
			input: decisionArc,
			model: EMBEDDING_MODEL // 1024 dimensions (default)
		});

		const embedding = embeddingResponse.data?.[0]?.embedding;
		if (!embedding) {
			throw new Error('No embedding data returned from Voyage');
		}

		// Update Journal row with embedding
		const { error: updateError } = await supabaseServiceRole
			.from('journal')
			.update({ embedding: JSON.stringify(embedding) })
			.eq('id', journalData.id);

		if (updateError) {
			throw new Error(`Embedding update failed: ${updateError.message}`);
		}

		log.info('Embedding saved', { journalId: journalData.id });
	};

	try {
		await doCompression();
	} catch (error) {
		log.error('Compression failed, scheduling retries', { superjournalId, error: error instanceof Error ? error.message : 'Unknown' });
		scheduleRetries(doCompression, `Compression-${superjournalId}`, userId);
	}
}

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	try {
		// 1. AUTHENTICATION CHECK
		const auth = await requireAuth(safeGetSession);
		if (!auth.success) return auth.error;
		const { userId } = auth;

		const log = createLogger('ChatAPI', userId);

		// 2. RATE LIMIT (1 request per minute - waits silently if needed)
		await waitForRateLimit(userId, RATE_LIMITS.ai);

		// 3. Read selected conversation model and persona from user_settings table
		const { data: settings } = await supabase
			.from('user_settings')
			.select('selected_conversation_model, selected_persona')
			.eq('user_id', userId)
			.single();

		const conversationModel = settings?.selected_conversation_model || DEFAULT_CONVERSATION_MODEL;
		const selectedPersona = settings?.selected_persona || DEFAULT_PERSONA;

		// Fetch conversation parameters from database
		const conversationParams = await getModelParams(conversationModel, 'conversation');

		const parseResult = await parseRequestJson<unknown>(request);
		if (!parseResult.success) return parseResult.error;

		// Validate with Zod schema
		const validation = validateSchema(chatMessageSchema, parseResult.data);
		if (!validation.success) return validation.error;

		const { message, persona = selectedPersona } = validation.data;

		// Build context for Call 1A/1B (memory injection with vector search)
		const { context, stats } = await buildContextForCalls1A1B(
			supabase, // Session-scoped client (RLS enforced)
			userId, // Authenticated user ID
			persona, // current persona for instruction filtering
			conversationModel,
			message // user query for vector search (Priority 5)
		);

		log.info('Context built', { ...stats, model: conversationModel, persona });

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
					log.error('Streaming error', { error: error instanceof Error ? error.message : 'Unknown' });
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
		bgLog.error('Chat API error', { error: error instanceof Error ? error.message : 'Unknown' });
		return internalError('Failed to generate response');
	}
};
