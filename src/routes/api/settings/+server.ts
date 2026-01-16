import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DEFAULT_MODEL } from '$lib/config/models';
import { DEFAULT_PERSONA } from '$lib/config/personas';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { settingsUpdateSchema, validateSchema } from '$lib/schemas';
import { databaseError } from '$lib/api/errors';

// All model override columns in user_settings
const MODEL_COLUMNS = [
	'model_gunnar',
	'model_kirby',
	'model_samara',
	'model_alicja',
	'model_eva',
	'model_ananya',
	'model_felix',
	'model_embeddings',
	'model_compression',
	'model_chat_compression',
	'model_character_planning',
	'model_image_gen',
	'model_image_edit'
] as const;

// Per-persona uncensored compression flags
const UNCENSORED_FLAGS = [
	'compression_uncensored_gunnar',
	'compression_uncensored_kirby',
	'compression_uncensored_samara',
	'compression_uncensored_alicja',
	'compression_uncensored_eva',
	'compression_uncensored_ananya',
	'compression_uncensored_felix'
] as const;

export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// 2. QUERY USER SETTINGS (including all model columns and uncensored flags)
	const { data, error } = await supabase
		.from('user_settings')
		.select(
			`default_model, selected_persona, watched_article_id, focused_message_id,
			 model_gunnar, model_kirby, model_samara, model_alicja, model_eva, model_ananya, model_felix,
			 model_embeddings, model_compression, model_chat_compression,
			 model_character_planning, model_image_gen, model_image_edit,
			 compression_uncensored_gunnar, compression_uncensored_kirby, compression_uncensored_samara,
			 compression_uncensored_alicja, compression_uncensored_eva, compression_uncensored_ananya, compression_uncensored_felix,
			 hide_completed_todos, scroll_bookmark`
		)
		.eq('user_id', userId)
		.single();

	// 3. HANDLE MISSING SETTINGS (create defaults for new user)
	if (error) {
		console.error('[Settings API] Query error:', error.message, error.code, error.details);

		const defaults = {
			default_model: DEFAULT_MODEL,
			selected_persona: DEFAULT_PERSONA
		};

		// Try to create default settings for this user
		await supabase.from('user_settings').insert({
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

	const validatedData = validation.data;

	// 3. BUILD UPDATE DATA
	const updateData: Record<string, unknown> = {
		updated_at: new Date().toISOString()
	};

	// Core settings
	if (validatedData.default_model !== undefined) updateData.default_model = validatedData.default_model;
	if (validatedData.selected_persona !== undefined) updateData.selected_persona = validatedData.selected_persona;
	if (validatedData.watched_article_id !== undefined) updateData.watched_article_id = validatedData.watched_article_id;
	if (validatedData.focused_message_id !== undefined) updateData.focused_message_id = validatedData.focused_message_id;
	if (validatedData.last_content_owner !== undefined) updateData.last_content_owner = validatedData.last_content_owner;
	if (validatedData.last_content_lifecycle !== undefined) updateData.last_content_lifecycle = validatedData.last_content_lifecycle;
	if (validatedData.hide_completed_todos !== undefined) updateData.hide_completed_todos = validatedData.hide_completed_todos;
	if (validatedData.scroll_bookmark !== undefined) updateData.scroll_bookmark = validatedData.scroll_bookmark;

	// Model overrides - check each column
	for (const col of MODEL_COLUMNS) {
		if ((validatedData as Record<string, unknown>)[col] !== undefined) {
			updateData[col] = (validatedData as Record<string, unknown>)[col];
		}
	}

	// Uncensored compression flags - check each column
	for (const col of UNCENSORED_FLAGS) {
		if ((validatedData as Record<string, unknown>)[col] !== undefined) {
			updateData[col] = (validatedData as Record<string, unknown>)[col];
		}
	}

	// 4. UPDATE USER SETTINGS
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
