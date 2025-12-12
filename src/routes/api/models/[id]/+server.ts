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

	// Delete from model_overrides
	const { error: overridesError } = await supabaseAdmin
		.from('model_overrides')
		.delete()
		.eq('model', modelId);

	if (overridesError) {
		console.error('[DELETE /api/models/:id] Error deleting overrides:', overridesError);
		return json({ error: overridesError.message }, { status: 500 });
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
