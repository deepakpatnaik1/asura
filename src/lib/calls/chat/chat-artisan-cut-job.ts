/**
 * Background Artisan Cut Job
 *
 * Compresses a conversation turn into the journal format with embeddings.
 * Runs asynchronously after the conversation is saved to superjournal.
 * Uses dedicated artisan cut model from user settings (default: Opus 4.5).
 */

import { VoyageAIClient } from 'voyageai';
import { VOYAGE_API_KEY, SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { EMBEDDING_MODEL } from '$lib/config/models';
import { getModelParams } from '$lib/config/model-params';
import { personaUsesCompression } from '$lib/config/personas';
import { createLogger } from '$lib/api/logger';
import { artisanCut } from './chat-artisan-cut';
import { scheduleRetries } from './retry';

// Default artisan cut model (Opus 4.5)
const DEFAULT_ARTISAN_CUT_MODEL = 'claude-opus-4-5-20251101';

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

export interface ArtisanCutJobParams {
	superjournalId: string;
	userId: string;
	userMessage: string;
	aiResponse: string;
	personaName: string;
	conversationModel: string;
}

/**
 * Run the artisan cut job for a conversation turn.
 * This creates a journal entry with compressed content and embeddings.
 *
 * @param params - The artisan cut job parameters
 */
export async function runArtisanCutJob(params: ArtisanCutJobParams): Promise<void> {
	const { superjournalId, userId, userMessage, aiResponse, personaName, conversationModel } = params;
	const log = createLogger('ArtisanCut', userId);
	const supabase = getSupabaseServiceRole();

	const doArtisanCut = async () => {
		log.info('Artisan cut job started', { superjournalId, personaName });

		// Check if persona uses artisan cut
		if (!personaUsesCompression(personaName)) {
			log.debug('Skipping artisan cut for persona', { superjournalId, personaName });
			return;
		}

		// Get artisan cut model from user settings
		const { data: settings } = await supabase
			.from('user_settings')
			.select('model_chat_artisan_cut')
			.eq('user_id', userId)
			.single();

		const artisanCutModel = settings?.model_chat_artisan_cut || DEFAULT_ARTISAN_CUT_MODEL;
		log.info('Using artisan cut model', { artisanCutModel });

		// Check if placeholder journal row exists (created by star button)
		const { data: existingJournal } = await supabase
			.from('journal')
			.select('id, is_starred')
			.eq('superjournal_id', superjournalId)
			.eq('user_id', userId)
			.single();

		// Run Artisan Cut with dedicated model
		log.info('Starting artisan cut', { superjournalId, model: artisanCutModel });

		const artisanCutParams = await getModelParams(artisanCutModel, 'artisan_cut');

		const artisanCutJson = await artisanCut({
			userMessage,
			aiResponse,
			personaName,
			model: artisanCutModel,
			maxTokens: artisanCutParams.max_tokens,
			temperature: artisanCutParams.temperature
		});

		log.debug('Artisan cut output', { salienceScore: artisanCutJson.salience_score });

		const journalData = {
			turn_essence: artisanCutJson.turn_essence || `Boss: ${userMessage}\n${personaName}: ${aiResponse}`,
			participants: artisanCutJson.participants || ['boss', personaName.toLowerCase()],
			conversation_arc: artisanCutJson.conversation_arc || 'No arc generated',
			salience_score: artisanCutJson.salience_score || 5
		};

		let journalId: string;

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

		const embeddingText = artisanCutJson.conversation_arc || 'No arc generated';

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
		await doArtisanCut();
	} catch (error) {
		log.error('Artisan cut failed, scheduling retries', {
			superjournalId,
			error: error instanceof Error ? error.message : 'Unknown'
		});
		scheduleRetries(doArtisanCut, `ArtisanCut-${superjournalId}`, userId);
	}
}
