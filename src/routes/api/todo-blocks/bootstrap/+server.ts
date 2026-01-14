/**
 * Bootstrap Todo Blocks
 *
 * POST: Create block structure for existing todos
 *       Called once when user first accesses block-based view
 *       Idempotent: safe to call multiple times
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

// Service role client to bypass RLS (auth already verified)
const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const POST: RequestHandler = async ({ locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = user.id;
	const supabase = supabaseAdmin; // Use service role for all operations

	// Check if user already has blocks (idempotent)
	const { data: existingBlocks, error: checkError } = await supabase
		.from('canvas_todo_blocks')
		.select('id')
		.eq('user_id', userId)
		.limit(1);

	if (checkError) {
		return json({ error: checkError.message }, { status: 500 });
	}

	if (existingBlocks && existingBlocks.length > 0) {
		return json({
			bootstrapped: false,
			message: 'User already has blocks',
			block_count: existingBlocks.length
		});
	}

	// Get all existing todos
	const { data: todos, error: todosError } = await supabase
		.from('canvas_planner_todos')
		.select('id, parent_id, status, created_at')
		.eq('user_id', userId)
		.order('created_at', { ascending: false });

	if (todosError) {
		return json({ error: todosError.message }, { status: 500 });
	}

	if (!todos || todos.length === 0) {
		// Create just a default section for new users
		const { data: section, error: sectionError } = await supabase
			.from('canvas_todo_blocks')
			.insert({
				user_id: userId,
				block_type: 'section',
				content: { name: 'Tasks', collapsed: false },
				sort_order: 0
			})
			.select()
			.single();

		if (sectionError) {
			return json({ error: sectionError.message }, { status: 500 });
		}

		return json({
			bootstrapped: true,
			message: 'Created default section (no existing todos)',
			section_id: section.id,
			todo_count: 0
		});
	}

	// Create sections based on todo structure
	// Strategy: One "Tasks" section for open todos, one "Completed" section for done todos
	const openTodos = todos.filter(t => t.status === 'open' && !t.parent_id);
	const completedTodos = todos.filter(t => t.status === 'completed' && !t.parent_id);

	// Create "Tasks" section
	const { data: tasksSection, error: tasksSectionError } = await supabase
		.from('canvas_todo_blocks')
		.insert({
			user_id: userId,
			block_type: 'section',
			content: { name: 'Tasks', collapsed: false },
			sort_order: 0
		})
		.select()
		.single();

	if (tasksSectionError) {
		return json({ error: tasksSectionError.message }, { status: 500 });
	}

	// Create todo_ref blocks for open parent todos
	const openBlocks = openTodos.map((todo, index) => ({
		user_id: userId,
		block_type: 'todo_ref',
		todo_id: todo.id,
		parent_id: tasksSection.id,
		sort_order: index
	}));

	if (openBlocks.length > 0) {
		const { error: openError } = await supabase
			.from('canvas_todo_blocks')
			.insert(openBlocks);

		if (openError) {
			return json({ error: openError.message }, { status: 500 });
		}
	}

	// Create "Completed" section if there are completed todos
	let completedSectionId = null;
	if (completedTodos.length > 0) {
		const { data: completedSection, error: completedSectionError } = await supabase
			.from('canvas_todo_blocks')
			.insert({
				user_id: userId,
				block_type: 'section',
				content: { name: 'Completed', collapsed: true },
				sort_order: 1
			})
			.select()
			.single();

		if (completedSectionError) {
			return json({ error: completedSectionError.message }, { status: 500 });
		}

		completedSectionId = completedSection.id;

		// Create todo_ref blocks for completed parent todos
		const completedBlocks = completedTodos.map((todo, index) => ({
			user_id: userId,
			block_type: 'todo_ref',
			todo_id: todo.id,
			parent_id: completedSection.id,
			sort_order: index
		}));

		const { error: completedError } = await supabase
			.from('canvas_todo_blocks')
			.insert(completedBlocks);

		if (completedError) {
			return json({ error: completedError.message }, { status: 500 });
		}
	}

	// Note: Child todos (with parent_id) are not given blocks
	// They render inline with their parent in the UI

	return json({
		bootstrapped: true,
		message: 'Bootstrap complete',
		tasks_section_id: tasksSection.id,
		completed_section_id: completedSectionId,
		open_count: openTodos.length,
		completed_count: completedTodos.length,
		total_todos: todos.length
	});
};
