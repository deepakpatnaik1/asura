/**
 * Background Compression Job
 *
 * Compresses a conversation turn into the journal format with embeddings.
 * Runs asynchronously after the conversation is saved to superjournal.
 */

import { VoyageAIClient } from 'voyageai';
import { VOYAGE_API_KEY, SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_COMPRESSION_MODEL, EMBEDDING_MODEL } from '$lib/config/models';
import { getModelParams } from '$lib/config/model-params';
import { createLogger } from '$lib/api/logger';
import { compress } from './compress';
import { getProviderType, assertProviderSupported } from './provider';
import { scheduleRetries } from './retry';

// Lazy-initialized clients
let voyage: VoyageAIClient | null = null;
let supabaseServiceRole: SupabaseClient | null = null;

function getVoyage(): VoyageAIClient {
	if (!voyage) {
		voyage = new VoyageAIClient({ apiKey: VOYAGE_API_KEY });
	}
	return voyage;
}

function getSupabaseServiceRole(): SupabaseClient {
	if (!supabaseServiceRole) {
		supabaseServiceRole = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
	}
	return supabaseServiceRole;
}

export interface CompressJobParams {
	superjournalId: string;
	userId: string;
	userMessage: string;
	aiResponse: string;
	personaName: string;
}

/**
 * Run the compression job for a conversation turn.
 * This creates a journal entry with compressed content and embeddings.
 *
 * @param params - The compression job parameters
 */
export async function runCompressJob(params: CompressJobParams): Promise<void> {
	const { superjournalId, userId, userMessage, aiResponse, personaName } = params;
	const log = createLogger('Compression', userId);
	const supabase = getSupabaseServiceRole();

	const doCompression = async () => {
		// Fetch mode from superjournal first - reader mode skips compression entirely
		const { data: sjData } = await supabase
			.from('superjournal')
			.select('mode')
			.eq('id', superjournalId)
			.single();
		const mode = sjData?.mode || 'chat';

		// Reader mode: no compression/journal - conversations stay in superjournal only
		if (mode === 'reader') {
			log.debug('Skipping compression for reader mode', { superjournalId });
			return;
		}

		// Read selected compression model from user_settings table
		const { data: settings } = await supabase
			.from('user_settings')
			.select('selected_compression_model')
			.eq('user_id', userId)
			.single();

		const compressionModel = settings?.selected_compression_model || DEFAULT_COMPRESSION_MODEL;

		// Fetch compression parameters from database
		const compressionParams = await getModelParams(compressionModel, 'compression');

		log.info('Starting compression', { superjournalId, model: compressionModel });

		const compressionProvider = getProviderType(compressionModel);
		assertProviderSupported(compressionProvider);

		// Call 2: Artisan Cut compression
		const compressionJson = await compress({
			userMessage,
			aiResponse,
			personaName,
			model: compressionModel,
			maxTokens: compressionParams.max_tokens,
			temperature: compressionParams.temperature
		});

		log.debug('Compression output', {
			salienceScore: compressionJson.salience_score
		});

		// Check if placeholder journal row exists (created by star button)
		const { data: existingJournal } = await supabase
			.from('journal')
			.select('id, is_starred')
			.eq('superjournal_id', superjournalId)
			.eq('user_id', userId)
			.single();

		let journalId: string;

		if (existingJournal) {
			// Update existing row (preserve is_starred from placeholder)
			const { error: updateError } = await supabase
				.from('journal')
				.update({
					persona_name: compressionJson.persona_name || personaName,
					boss_essence: compressionJson.boss_essence || userMessage,
					persona_essence: compressionJson.persona_essence || aiResponse,
					decision_arc_summary: compressionJson.decision_arc_summary || 'No arc generated',
					salience_score: compressionJson.salience_score || 5
				})
				.eq('id', existingJournal.id);

			if (updateError) {
				throw new Error(`Journal update failed: ${updateError.message}`);
			}
			journalId = existingJournal.id;
			log.info('Updated existing journal', { journalId, wasStarred: existingJournal.is_starred });
		} else {
			// Insert new row (journal is chat-only, reader mode skipped above)
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
					file_name: null,
					file_type: null,
					embedding: null
				})
				.select('id')
				.single();

			if (journalError) {
				throw new Error(`Journal insert failed: ${journalError.message}`);
			}
			journalId = journalData.id;
			log.info('Saved to journal', { journalId });
		}

		// Generate embedding for decision_arc_summary
		const decisionArc = compressionJson.decision_arc_summary || 'No arc generated';
		log.debug('Generating embedding', { arcLength: decisionArc.length });

		const embeddingResponse = await getVoyage().embed({
			input: decisionArc,
			model: EMBEDDING_MODEL
		});

		const embedding = embeddingResponse.data?.[0]?.embedding;
		if (!embedding) {
			throw new Error('No embedding data returned from Voyage');
		}

		// Update Journal row with embedding
		const { error: embeddingError } = await supabase
			.from('journal')
			.update({ embedding: JSON.stringify(embedding) })
			.eq('id', journalId);

		if (embeddingError) {
			throw new Error(`Embedding update failed: ${embeddingError.message}`);
		}

		log.info('Embedding saved', { journalId });
	};

	try {
		await doCompression();
	} catch (error) {
		log.error('Compression failed, scheduling retries', {
			superjournalId,
			error: error instanceof Error ? error.message : 'Unknown'
		});
		scheduleRetries(doCompression, `Compression-${superjournalId}`, userId);
	}
}
