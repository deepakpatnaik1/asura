import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';

export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;

	// 2. FETCH ACTIVE MODELS ONLY
	const { data, error } = await supabase
		.from('models')
		.select(
			'model_identifier, model_name, provider, model_type, context_window, input_price_per_million, output_price_per_million, cost_per_image'
		)
		.eq('is_active', true)
		.order('model_type', { ascending: true })
		.order('provider', { ascending: true })
		.order('model_name', { ascending: true });

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json(data || []);
};
