import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	DEFAULT_CONVERSATION_MODEL,
	DEFAULT_COMPRESSION_MODEL,
	DEFAULT_READER_MODEL,
	EMBEDDING_MODEL
} from '$lib/config/models';

export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const { user } = await safeGetSession();
	if (!user) {
		return json(
			{
				error: {
					message: 'Unauthorized - must be logged in',
					code: 'UNAUTHORIZED'
				}
			},
			{ status: 401 }
		);
	}
	const userId = user.id;

	// 2. QUERY USER SETTINGS
	const { data, error } = await supabase
		.from('user_settings')
		.select('selected_conversation_model, selected_compression_model, selected_reader_model, selected_embedding_model, active_reader_article_id')
		.eq('user_id', userId)
		.single();

	// 3. HANDLE MISSING SETTINGS (create defaults for new user)
	if (error) {
		const defaults = {
			selected_conversation_model: DEFAULT_CONVERSATION_MODEL,
			selected_compression_model: DEFAULT_COMPRESSION_MODEL,
			selected_reader_model: DEFAULT_READER_MODEL,
			selected_embedding_model: EMBEDDING_MODEL
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
	const { user } = await safeGetSession();
	if (!user) {
		return json(
			{
				error: {
					message: 'Unauthorized - must be logged in',
					code: 'UNAUTHORIZED'
				}
			},
			{ status: 401 }
		);
	}
	const userId = user.id;

	// 2. PARSE REQUEST BODY
	const { selected_conversation_model, selected_compression_model, selected_reader_model, selected_embedding_model, active_reader_article_id } = await request.json();

	// 3. UPDATE USER SETTINGS
	const updateData: Record<string, any> = {
		updated_at: new Date().toISOString()
	};

	// Only include fields that were provided (to support partial updates)
	if (selected_conversation_model !== undefined) updateData.selected_conversation_model = selected_conversation_model;
	if (selected_compression_model !== undefined) updateData.selected_compression_model = selected_compression_model;
	if (selected_reader_model !== undefined) updateData.selected_reader_model = selected_reader_model;
	if (selected_embedding_model !== undefined) updateData.selected_embedding_model = selected_embedding_model;
	if (active_reader_article_id !== undefined) updateData.active_reader_article_id = active_reader_article_id;

	const { data, error } = await supabase
		.from('user_settings')
		.update(updateData)
		.eq('user_id', userId)
		.select();

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ success: true });
};
