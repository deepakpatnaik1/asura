import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { supabaseAdmin } from '$lib/supabase-admin';

export const DELETE: RequestHandler = async ({ params, locals: { safeGetSession } }) => {
	// 1. AUTHENTICATION CHECK (still verify user is logged in)
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;

	const modelId = params.id;
	if (!modelId) {
		return json({ error: 'Model ID required' }, { status: 400 });
	}

	// 2. DELETE DEPENDENT ROWS FIRST (FK constraints)
	// Use supabaseAdmin to bypass RLS (models is admin-only data)

	// Delete from model_parameters
	const { error: paramsError } = await supabaseAdmin
		.from('model_parameters')
		.delete()
		.eq('model_identifier', modelId);

	if (paramsError) {
		console.error('[DELETE /api/models/:id] Error deleting parameters:', paramsError);
		return json({ error: paramsError.message }, { status: 500 });
	}

	// Clear model from user_settings where it's referenced
	// (Set to null so it falls back to default_model)
	const modelColumns = [
		'model_gunnar', 'model_kirby', 'model_samara', 'model_alicja', 'model_ananya',
		'model_embeddings', 'model_file_artisan_cut', 'model_chat_artisan_cut'
	];

	for (const col of modelColumns) {
		await supabaseAdmin
			.from('user_settings')
			.update({ [col]: null })
			.eq(col, modelId);
	}

	// 3. DELETE THE MODEL (use .select() to verify deletion actually happened)
	const { data, error } = await supabaseAdmin
		.from('models')
		.delete()
		.eq('model_identifier', modelId)
		.select();

	if (error) {
		console.error('[DELETE /api/models/:id] Error:', error);
		return json({ error: error.message }, { status: 500 });
	}

	// Verify deletion happened
	if (!data || data.length === 0) {
		console.error('[DELETE /api/models/:id] Model not found:', modelId);
		return json({ error: 'Model not found' }, { status: 404 });
	}

	return json({ success: true });
};
