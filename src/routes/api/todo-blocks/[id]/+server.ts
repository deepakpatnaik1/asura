/**
 * Todo Block [id] API Endpoint
 *
 * PATCH: Update a block (content, parent_id, sort_order)
 * DELETE: Delete a block (cascades to children)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

// Service role client to bypass RLS (auth already verified)
const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const PATCH: RequestHandler = async ({
	params,
	request,
	locals: { safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const blockId = params.id;
	const body = await request.json();

	// Only allow updating specific fields
	const allowedFields = ['content', 'parent_id', 'sort_order'];
	const updateData: Record<string, unknown> = {};

	for (const field of allowedFields) {
		if (body[field] !== undefined) {
			updateData[field] = body[field];
		}
	}

	if (Object.keys(updateData).length === 0) {
		return json({ error: 'No valid fields to update' }, { status: 400 });
	}

	// Verify ownership and update
	const { data: block, error } = await supabaseAdmin
		.from('canvas_todo_blocks')
		.update(updateData)
		.eq('id', blockId)
		.eq('user_id', user.id) // RLS backup
		.select()
		.single();

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	if (!block) {
		return json({ error: 'Block not found' }, { status: 404 });
	}

	return json({ block });
};

export const DELETE: RequestHandler = async ({
	params,
	locals: { safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const blockId = params.id;

	// Get block info before deleting (for response)
	const { data: existing } = await supabaseAdmin
		.from('canvas_todo_blocks')
		.select('id, block_type, content')
		.eq('id', blockId)
		.eq('user_id', user.id)
		.single();

	if (!existing) {
		return json({ error: 'Block not found' }, { status: 404 });
	}

	// Delete (cascades to children via FK constraint)
	const { error } = await supabaseAdmin
		.from('canvas_todo_blocks')
		.delete()
		.eq('id', blockId)
		.eq('user_id', user.id);

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ deleted: existing });
};
