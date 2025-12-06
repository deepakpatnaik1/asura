/**
 * Model Overrides API
 *
 * GET /api/model-overrides - List all model overrides for user
 * POST /api/model-overrides - Create/update a model override
 * DELETE /api/model-overrides - Delete a model override
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { createModelOverrideSchema, deleteModelOverrideSchema, validateSchema } from '$lib/schemas';
import { databaseError } from '$lib/api/errors';

/**
 * GET /api/model-overrides
 * Returns all model overrides for the authenticated user
 */
export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// 2. QUERY MODEL OVERRIDES
	const { data, error } = await supabase
		.from('model_overrides')
		.select('persona, model')
		.eq('user_id', userId)
		.order('persona');

	if (error) {
		return databaseError('Failed to fetch model overrides');
	}

	return json(data || []);
};

/**
 * POST /api/model-overrides
 * Create or update a model override for a persona
 * Uses UPSERT behavior - if override exists for persona, update it
 */
export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// 2. PARSE AND VALIDATE REQUEST BODY
	const parseResult = await parseRequestJson<unknown>(request);
	if (!parseResult.success) return parseResult.error;

	const validation = validateSchema(createModelOverrideSchema, parseResult.data);
	if (!validation.success) return validation.error;

	const { persona, model } = validation.data;

	// 3. UPSERT MODEL OVERRIDE (insert or update on conflict)
	const { error } = await supabase.from('model_overrides').upsert(
		{
			user_id: userId,
			persona,
			model
		},
		{
			onConflict: 'user_id,persona'
		}
	);

	if (error) {
		return databaseError('Failed to save model override');
	}

	return json({ success: true, persona, model });
};

/**
 * DELETE /api/model-overrides
 * Delete a model override for a persona
 */
export const DELETE: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// 2. PARSE AND VALIDATE REQUEST BODY
	const parseResult = await parseRequestJson<unknown>(request);
	if (!parseResult.success) return parseResult.error;

	const validation = validateSchema(deleteModelOverrideSchema, parseResult.data);
	if (!validation.success) return validation.error;

	const { persona } = validation.data;

	// 3. DELETE MODEL OVERRIDE
	const { error } = await supabase
		.from('model_overrides')
		.delete()
		.eq('user_id', userId)
		.eq('persona', persona);

	if (error) {
		return databaseError('Failed to delete model override');
	}

	return json({ success: true, persona });
};
