import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DEFAULT_MODEL, EMBEDDING_MODEL } from '$lib/config/models';
import { DEFAULT_PERSONA } from '$lib/config/personas';
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
		.select('default_model, selected_embedding_model, active_content_id, selected_persona, file_artisan_model')
		.eq('user_id', userId)
		.single();

	// 3. HANDLE MISSING SETTINGS (create defaults for new user)
	if (error) {
		const defaults = {
			default_model: DEFAULT_MODEL,
			selected_embedding_model: EMBEDDING_MODEL,
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

	const { default_model, selected_embedding_model, active_content_id, selected_persona, file_artisan_model } =
		validation.data;

	// 3. UPDATE USER SETTINGS
	const updateData: Record<string, unknown> = {
		updated_at: new Date().toISOString()
	};

	// Only include fields that were provided (to support partial updates)
	if (default_model !== undefined) updateData.default_model = default_model;
	if (selected_embedding_model !== undefined)
		updateData.selected_embedding_model = selected_embedding_model;
	if (active_content_id !== undefined) updateData.active_content_id = active_content_id;
	if (selected_persona !== undefined) updateData.selected_persona = selected_persona;
	if (file_artisan_model !== undefined) updateData.file_artisan_model = file_artisan_model;

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
