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
import { EMBEDDING_MODEL } from '$lib/config/models';
import { getModelParams } from '$lib/config/model-params';
import { personaUsesCompression } from '$lib/config/personas';
import { createLogger } from '$lib/api/logger';
import { compress } from './compress';
import { getModelCanCompress } from './provider';
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
	conversationModel: string;
}

/**
 * Run the compression job for a conversation turn.
 * This creates a journal entry with compressed content and embeddings.
 *
 * @param params - The compression job parameters
 */
export async function runCompressJob(params: CompressJobParams): Promise<void> {
	const { superjournalId, userId, userMessage, aiResponse, personaName, conversationModel } = params;
	const log = createLogger('Compression', userId);
	const supabase = getSupabaseServiceRole();

	const doCompression = async () => {
		// Check if persona uses compression
		if (!personaUsesCompression(personaName)) {
			log.debug('Skipping compression for persona', { superjournalId, personaName });
			return;
		}

		// Check if model can do compression
		const canCompress = await getModelCanCompress(supabase, conversationModel);

		// Check if placeholder journal row exists (created by star button)
		const { data: existingJournal } = await supabase
			.from('journal')
			.select('id, is_starred')
			.eq('superjournal_id', superjournalId)
			.eq('user_id', userId)
			.single();

		let journalId: string;
		let embeddingText: string;

		if (canCompress) {
			// Model can compress: Run full Artisan Cut compression
			log.info('Starting compression', { superjournalId, model: conversationModel });

			const compressionParams = await getModelParams(conversationModel, 'compression');

			const compressionJson = await compress({
				userMessage,
				aiResponse,
				personaName,
				model: conversationModel,
				maxTokens: compressionParams.max_tokens,
				temperature: compressionParams.temperature
			});

			log.debug('Compression output', { salienceScore: compressionJson.salience_score });

			const journalData = {
				persona_name: compressionJson.persona_name || personaName,
				boss_essence: compressionJson.boss_essence || userMessage,
				persona_essence: compressionJson.persona_essence || aiResponse,
				decision_arc_summary: compressionJson.decision_arc_summary || 'No arc generated',
				salience_score: compressionJson.salience_score || 5
			};

			if (existingJournal) {
				const { error: updateError } = await supabase
					.from('journal')
					.update(journalData)
					.eq('id', existingJournal.id);

				if (updateError) throw new Error(`Journal update failed: ${updateError.message}`);
				journalId = existingJournal.id;
				log.info('Updated existing journal', { journalId, wasStarred: existingJournal.is_starred });
			} else {
				const { data: inserted, error: insertError } = await supabase
					.from('journal')
					.insert({
						superjournal_id: superjournalId,
						user_id: userId,
						...journalData,
						is_starred: false,
						file_name: null,
						file_type: null,
						embedding: null
					})
					.select('id')
					.single();

				if (insertError) throw new Error(`Journal insert failed: ${insertError.message}`);
				journalId = inserted.id;
				log.info('Saved to journal', { journalId });
			}

			embeddingText = compressionJson.decision_arc_summary || 'No arc generated';
		} else {
			// Model cannot compress: Store verbatim (no compression LLM call)
			log.info('Storing verbatim (no compression)', { superjournalId, model: conversationModel });

			const journalData = {
				persona_name: personaName,
				boss_essence: userMessage,
				persona_essence: aiResponse,
				decision_arc_summary: null, // No compression
				salience_score: 5 // Default
			};

			if (existingJournal) {
				const { error: updateError } = await supabase
					.from('journal')
					.update(journalData)
					.eq('id', existingJournal.id);

				if (updateError) throw new Error(`Journal update failed: ${updateError.message}`);
				journalId = existingJournal.id;
				log.info('Updated existing journal (verbatim)', { journalId });
			} else {
				const { data: inserted, error: insertError } = await supabase
					.from('journal')
					.insert({
						superjournal_id: superjournalId,
						user_id: userId,
						...journalData,
						is_starred: false,
						file_name: null,
						file_type: null,
						embedding: null
					})
					.select('id')
					.single();

				if (insertError) throw new Error(`Journal insert failed: ${insertError.message}`);
				journalId = inserted.id;
				log.info('Saved to journal (verbatim)', { journalId });
			}

			// For embedding, concatenate user message and AI response
			embeddingText = `${userMessage}\n\n${aiResponse}`;
		}

		// Generate embedding (works for both paths)
		log.debug('Generating embedding', { textLength: embeddingText.length });

		const embeddingResponse = await getVoyage().embed({
			input: embeddingText,
			model: EMBEDDING_MODEL
		});

		const embedding = embeddingResponse.data?.[0]?.embedding;
		if (!embedding) {
			throw new Error('No embedding data returned from Voyage');
		}

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
