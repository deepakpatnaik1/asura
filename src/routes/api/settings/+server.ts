import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const GET: RequestHandler = async ({ locals: { safeGetSession } }) => {
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
		.select('selected_conversation_model, selected_compression_model, selected_embedding_model, selected_persona')
		.eq('user_id', userId)
		.single();

	// 3. HANDLE MISSING SETTINGS (create defaults for new user)
	if (error) {
		const defaults = {
			selected_conversation_model: 'accounts/fireworks/models/qwen3-235b-a22b',
			selected_compression_model: 'accounts/fireworks/models/qwen3-235b-a22b-instruct-2507',
			selected_embedding_model: 'voyage-3',
			selected_persona: 'gunnar'
		};

		// Try to create default settings for this user
		const { error: insertError } = await supabase
			.from('user_settings')
			.insert({
				user_id: userId,
				...defaults
			});

		if (insertError) {
			console.error('[Settings GET] Failed to create defaults:', insertError);
		}

		return json(defaults);
	}

	return json(data);
};

export const PUT: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
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
	const { selected_conversation_model, selected_compression_model, selected_embedding_model, selected_persona } = await request.json();

	// 3. UPDATE USER SETTINGS
	const { error } = await supabase
		.from('user_settings')
		.update({
			selected_conversation_model,
			selected_compression_model,
			selected_embedding_model,
			selected_persona,
			updated_at: new Date().toISOString()
		})
		.eq('user_id', userId);

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ success: true });
};
