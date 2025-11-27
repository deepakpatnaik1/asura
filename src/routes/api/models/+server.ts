import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

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

	// 2. FETCH ACTIVE MODELS
	const { data, error } = await supabase
		.from('models')
		.select(
			'model_identifier, model_name, provider, model_type, context_window, input_price_per_million, output_price_per_million'
		)
		.eq('is_active', true)
		.order('model_type', { ascending: true })
		.order('provider', { ascending: true })
		.order('model_name', { ascending: true });

	if (error) {
		console.error('[Models GET] Database error:', error);
		return json({ error: error.message }, { status: 500 });
	}

	return json(data || []);
};
