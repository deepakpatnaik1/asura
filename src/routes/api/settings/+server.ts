import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const GET: RequestHandler = async () => {
	const { data, error } = await supabase
		.from('user_settings')
		.select('selected_conversation_model, selected_compression_model, selected_persona')
		.single();

	if (error) {
		return json({
			selected_conversation_model: 'accounts/fireworks/models/qwen3-235b-a22b',
			selected_compression_model: 'accounts/fireworks/models/qwen3-235b-a22b-instruct-2507',
			selected_persona: 'gunnar'
		});
	}

	return json(data);
};

export const PUT: RequestHandler = async ({ request }) => {
	const { selected_conversation_model, selected_compression_model, selected_persona } = await request.json();

	// Get the single row ID
	const { data: settingsData } = await supabase
		.from('user_settings')
		.select('id')
		.single();

	if (!settingsData) {
		return json({ error: 'Settings not found' }, { status: 404 });
	}

	const { error } = await supabase
		.from('user_settings')
		.update({
			selected_conversation_model,
			selected_compression_model,
			selected_persona,
			updated_at: new Date().toISOString()
		})
		.eq('id', settingsData.id);

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ success: true });
};
