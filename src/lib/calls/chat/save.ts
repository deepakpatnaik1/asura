/**
 * Save Conversation to Database
 *
 * Handles saving conversation turns to superjournal and triggering
 * background compression jobs.
 */

import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '$lib/api/logger';
import { runCompressJob } from './compress-job';
import { scheduleRetries } from './retry';

// Lazy-initialized client
let supabaseServiceRole: SupabaseClient | null = null;

function getSupabaseServiceRole(): SupabaseClient {
	if (!supabaseServiceRole) {
		supabaseServiceRole = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
	}
	return supabaseServiceRole;
}

export interface SaveConversationParams {
	userId: string;
	message: string;
	aiResponse: string;
	conversationModel: string;
	persona: string;
}

/**
 * Save a conversation turn to the database.
 * This saves to superjournal first, then triggers background compression.
 *
 * @param params - The conversation parameters to save
 */
export async function saveConversation(params: SaveConversationParams): Promise<void> {
	const { userId, message, aiResponse, conversationModel, persona } = params;
	const log = createLogger('ChatSave', userId);
	const supabase = getSupabaseServiceRole();

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
			log.info('Saved to superjournal', { superjournalId });

			// Trigger background compression
			setTimeout(() => {
				runCompressJob({
					superjournalId,
					userId,
					userMessage: message,
					aiResponse,
					personaName: persona
				});
			}, 0);
		}
	} catch (error) {
		log.error('Initial save failed, scheduling retries', {
			error: error instanceof Error ? error.message : 'Unknown'
		});

		// Schedule retries at 1min, 5min, 10min
		scheduleRetries(async () => {
			const superjournalId = await saveToSuperjournal();
			if (superjournalId) {
				// Trigger compression after successful retry
				runCompressJob({
					superjournalId,
					userId,
					userMessage: message,
					aiResponse,
					personaName: persona
				});
			}
		}, 'SuperjournalSave', userId);
	}
}
