/**
 * Todo Blocks API Endpoint
 *
 * GET: Fetch user's block tree (nested structure)
 * POST: Create a new block
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

// Service role client to bypass RLS (auth already verified)
const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface Block {
	id: string;
	parent_id: string | null;
	block_type: 'section' | 'todo_ref' | 'note' | 'divider';
	content: Record<string, unknown>;
	todo_id: string | null;
	sort_order: number;
	created_at: string;
	children?: Block[];
}

/**
 * Build a nested tree from flat blocks
 */
function buildBlockTree(blocks: Block[]): Block[] {
	const blockMap = new Map<string, Block>();
	const roots: Block[] = [];

	// First pass: create map and initialize children arrays
	for (const block of blocks) {
		blockMap.set(block.id, { ...block, children: [] });
	}

	// Second pass: build tree structure
	for (const block of blocks) {
		const node = blockMap.get(block.id)!;
		if (block.parent_id && blockMap.has(block.parent_id)) {
			blockMap.get(block.parent_id)!.children!.push(node);
		} else {
			roots.push(node);
		}
	}

	// Sort children by sort_order at each level
	function sortChildren(nodes: Block[]) {
		nodes.sort((a, b) => a.sort_order - b.sort_order);
		for (const node of nodes) {
			if (node.children && node.children.length > 0) {
				sortChildren(node.children);
			}
		}
	}
	sortChildren(roots);

	return roots;
}

export const GET: RequestHandler = async ({ locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { data: blocks, error } = await supabaseAdmin
		.from('canvas_todo_blocks')
		.select('*')
		.eq('user_id', user.id)
		.order('sort_order', { ascending: true });

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	const tree = buildBlockTree(blocks || []);

	return json({ blocks: tree });
};

export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json();
	const { block_type, content, parent_id, todo_id, sort_order } = body;

	// Validate block_type
	if (!['section', 'todo_ref', 'note', 'divider'].includes(block_type)) {
		return json({ error: 'Invalid block_type' }, { status: 400 });
	}

	// Validate todo_ref constraint
	if (block_type === 'todo_ref' && !todo_id) {
		return json({ error: 'todo_ref blocks require todo_id' }, { status: 400 });
	}
	if (block_type !== 'todo_ref' && todo_id) {
		return json({ error: 'Only todo_ref blocks can have todo_id' }, { status: 400 });
	}

	// Calculate sort_order if not provided
	let finalSortOrder = sort_order;
	if (finalSortOrder === undefined) {
		// Get max sort_order for this parent
		const { data: maxBlock } = await supabaseAdmin
			.from('canvas_todo_blocks')
			.select('sort_order')
			.eq('user_id', user.id)
			.eq('parent_id', parent_id || null)
			.order('sort_order', { ascending: false })
			.limit(1)
			.single();

		finalSortOrder = (maxBlock?.sort_order ?? -1) + 1;
	}

	const { data: block, error } = await supabaseAdmin
		.from('canvas_todo_blocks')
		.insert({
			user_id: user.id,
			block_type,
			content: content || {},
			parent_id: parent_id || null,
			todo_id: todo_id || null,
			sort_order: finalSortOrder
		})
		.select()
		.single();

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ block });
};
