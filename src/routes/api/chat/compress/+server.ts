import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { VoyageAIClient } from 'voyageai';
import { VOYAGE_API_KEY } from '$env/static/private';
import { DEFAULT_COMPRESSION_MODEL, EMBEDDING_MODEL } from '$lib/config/models';
import { getModelParams } from '$lib/config/model-params';
import { compress } from '$lib/calls';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';

const voyage = new VoyageAIClient({ apiKey: VOYAGE_API_KEY });

/**
 * Orphan Recovery Endpoint
 *
 * POST /api/chat/compress
 * Triggers compression for a superjournal entry that's missing its journal entry.
 * Called automatically on page load to recover failed compressions.
 */
export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;

	// 2. PARSE REQUEST BODY
	const parseResult = await parseRequestJson<{
		superjournal_id: string;
		user_message: string;
		ai_response: string;
		persona_name: string;
	}>(request);
	if (!parseResult.success) return parseResult.error;
	const { superjournal_id, user_message, ai_response, persona_name } = parseResult.data;

	if (!superjournal_id || !user_message || !ai_response || !persona_name) {
		return json({ error: { message: 'Missing required fields', code: 'INVALID_INPUT' } }, { status: 400 });
	}

	// Verify this superjournal entry belongs to the user and doesn't have a journal entry
	const { data: entry, error: fetchError } = await supabase
		.from('superjournal')
		.select('id')
		.eq('id', superjournal_id)
		.eq('user_id', auth.userId)
		.single();

	if (fetchError || !entry) {
		return json({ error: { message: 'Entry not found', code: 'NOT_FOUND' } }, { status: 404 });
	}

	// Check if journal entry already exists
	const { data: existingJournal } = await supabase
		.from('journal')
		.select('id')
		.eq('superjournal_id', superjournal_id)
		.single();

	if (existingJournal) {
		return json({ message: 'Already compressed', skipped: true });
	}

	// Run compression
	try {
		const { data: settings } = await supabase
			.from('user_settings')
			.select('selected_compression_model')
			.eq('user_id', auth.userId)
			.single();

		const compressionModel = settings?.selected_compression_model || DEFAULT_COMPRESSION_MODEL;
		const compressionParams = await getModelParams(compressionModel, 'compression');

		const compressionJson = await compress({
			userMessage: user_message,
			aiResponse: ai_response,
			personaName: persona_name,
			model: compressionModel,
			maxTokens: compressionParams.max_tokens,
			temperature: compressionParams.temperature
		});

		// Save to Journal
		const { data: journalData, error: journalError } = await supabase
			.from('journal')
			.insert({
				superjournal_id: superjournal_id,
				user_id: auth.userId,
				persona_name: compressionJson.persona_name || persona_name,
				boss_essence: compressionJson.boss_essence || user_message,
				persona_essence: compressionJson.persona_essence || ai_response,
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

		// Generate and save embedding
		const decisionArc = compressionJson.decision_arc_summary || 'No arc generated';
		const embeddingResponse = await voyage.embed({
			input: decisionArc,
			model: EMBEDDING_MODEL
		});

		const embedding = embeddingResponse.data?.[0]?.embedding;
		if (embedding) {
			await supabase
				.from('journal')
				.update({ embedding: JSON.stringify(embedding) })
				.eq('id', journalData.id);
		}

		return json({ success: true, journal_id: journalData.id });

	} catch (error) {
		return json({ error: { message: 'Compression failed', code: 'COMPRESSION_ERROR' } }, { status: 500 });
	}
};
