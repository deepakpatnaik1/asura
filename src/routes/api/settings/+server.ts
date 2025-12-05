import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	DEFAULT_CHAT_MODEL,
	DEFAULT_READER_MODEL,
	DEFAULT_WORK_MODEL,
	EMBEDDING_MODEL
} from '$lib/config/models';
import { DEFAULT_PERSONA, DEFAULT_READER_PERSONA, DEFAULT_TODO_PERSONA } from '$lib/config/personas';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { settingsUpdateSchema, validateSchema } from '$lib/schemas';
import { databaseError } from '$lib/api/errors';

export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// 2. QUERY USER SETTINGS
	const { data, error } = await supabase
		.from('user_settings')
		.select('selected_chat_model, selected_reader_model, selected_work_model, selected_embedding_model, active_content_id, selected_persona_chat, selected_persona_reader, selected_persona_todo')
		.eq('user_id', userId)
		.single();

	// 3. HANDLE MISSING SETTINGS (create defaults for new user)
	if (error) {
		const defaults = {
			selected_chat_model: DEFAULT_CHAT_MODEL,
			selected_reader_model: DEFAULT_READER_MODEL,
			selected_work_model: DEFAULT_WORK_MODEL,
			selected_embedding_model: EMBEDDING_MODEL,
			selected_persona_chat: DEFAULT_PERSONA,
			selected_persona_reader: DEFAULT_READER_PERSONA,
			selected_persona_todo: DEFAULT_TODO_PERSONA
		};

		// Try to create default settings for this user
		const { error: insertError } = await supabase
			.from('user_settings')
			.insert({
				user_id: userId,
				...defaults
			});

		return json(defaults);
	}

	return json(data);
};

export const PUT: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// 2. PARSE AND VALIDATE REQUEST BODY
	const parseResult = await parseRequestJson<unknown>(request);
	if (!parseResult.success) return parseResult.error;

	const validation = validateSchema(settingsUpdateSchema, parseResult.data);
	if (!validation.success) return validation.error;

	const { selected_chat_model, selected_reader_model, selected_work_model, selected_embedding_model, active_content_id, selected_persona_chat, selected_persona_reader, selected_persona_todo } = validation.data;

	// 3. UPDATE USER SETTINGS
	const updateData: Record<string, any> = {
		updated_at: new Date().toISOString()
	};

	// Only include fields that were provided (to support partial updates)
	if (selected_chat_model !== undefined) updateData.selected_chat_model = selected_chat_model;
	if (selected_reader_model !== undefined) updateData.selected_reader_model = selected_reader_model;
	if (selected_work_model !== undefined) updateData.selected_work_model = selected_work_model;
	if (selected_embedding_model !== undefined) updateData.selected_embedding_model = selected_embedding_model;
	if (active_content_id !== undefined) updateData.active_content_id = active_content_id;
	if (selected_persona_chat !== undefined) updateData.selected_persona_chat = selected_persona_chat;
	if (selected_persona_reader !== undefined) updateData.selected_persona_reader = selected_persona_reader;
	if (selected_persona_todo !== undefined) updateData.selected_persona_todo = selected_persona_todo;

	const { error } = await supabase
		.from('user_settings')
		.update(updateData)
		.eq('user_id', userId)
		.select();

	if (error) {
		return databaseError('Failed to update settings');
	}

	return json({ success: true });
};
