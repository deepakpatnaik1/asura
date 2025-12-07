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
import { runExtractTablesJob } from './extract-tables';
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
	contentId?: string; // article ID for content-based conversations
}

/**
 * Save to superjournal and return the ID.
 * Does NOT trigger background jobs - caller must do that separately.
 */
export async function saveToSuperjournal(params: SaveConversationParams): Promise<string | null> {
	const { userId, message, aiResponse, conversationModel, persona, contentId } = params;
	const log = createLogger('ChatSave', userId);
	const supabase = getSupabaseServiceRole();

	const insertData: Record<string, unknown> = {
		user_id: userId,
		persona_name: persona,
		user_message: message,
		ai_response: aiResponse,
		model_identifier: conversationModel
	};

	// Include content_id when conversation is about specific content
	if (contentId) {
		insertData.content_id = contentId;
	}

	const { data: superjournalData, error: dbError } = await supabase
		.from('superjournal')
		.insert(insertData)
		.select('id')
		.single();

	if (dbError) {
		log.error('Superjournal insert failed', { error: dbError.message });
		return null;
	}

	const superjournalId = superjournalData?.id || null;
	if (superjournalId) {
		log.info('Saved to superjournal', { superjournalId });
	}
	return superjournalId;
}

/**
 * Trigger background jobs (compression, table extraction) for a saved conversation.
 */
export function triggerBackgroundJobs(params: {
	superjournalId: string;
	userId: string;
	message: string;
	aiResponse: string;
	persona: string;
}): void {
	const { superjournalId, userId, message, aiResponse, persona } = params;

	setTimeout(() => {
		runCompressJob({
			superjournalId,
			userId,
			userMessage: message,
			aiResponse,
			personaName: persona
		});
		runExtractTablesJob({
			superjournalId,
			userId,
			aiResponse
		});
	}, 0);
}

/**
 * Save a conversation turn to the database.
 * This saves to superjournal first, then triggers background compression.
 * Legacy function - prefer saveToSuperjournal + triggerBackgroundJobs for more control.
 *
 * @param params - The conversation parameters to save
 */
export async function saveConversation(params: SaveConversationParams): Promise<void> {
	const { userId, message, aiResponse, persona } = params;
	const log = createLogger('ChatSave', userId);

	try {
		const superjournalId = await saveToSuperjournal(params);

		if (superjournalId) {
			triggerBackgroundJobs({
				superjournalId,
				userId,
				message,
				aiResponse,
				persona
			});
		}
	} catch (error) {
		log.error('Initial save failed, scheduling retries', {
			error: error instanceof Error ? error.message : 'Unknown'
		});

		// Schedule retries at 1min, 5min, 10min
		scheduleRetries(async () => {
			const superjournalId = await saveToSuperjournal(params);
			if (superjournalId) {
				triggerBackgroundJobs({
					superjournalId,
					userId,
					message,
					aiResponse,
					persona
				});
			}
		}, 'SuperjournalSave', userId);
	}
}
