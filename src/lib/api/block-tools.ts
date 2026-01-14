/**
 * Block Tools for Felix
 *
 * Tool definitions and executors for block-based todo presentation.
 * These tools give Felix full creative control over how todos are displayed.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Tool Definitions
 */

export const CREATE_SECTION_TOOL: Anthropic.Tool = {
	name: 'create_section',
	description:
		'Create a new section to group todos. Sections can be nested inside other sections. Use this to organize tasks by project, priority, time period, or any other grouping that makes sense.',
	input_schema: {
		type: 'object',
		properties: {
			name: {
				type: 'string',
				description: 'The section name (e.g., "Today", "This Week", "Honeybloom", "Backlog")'
			},
			parent_section_id: {
				type: 'string',
				description:
					'Optional: UUID of parent section to nest this section inside. Omit for top-level section.'
			},
			collapsed: {
				type: 'boolean',
				description: 'Optional: Whether the section starts collapsed. Default false.'
			}
		},
		required: ['name']
	}
};

export const CREATE_NOTE_TOOL: Anthropic.Tool = {
	name: 'create_note',
	description:
		'Add a note between tasks. Use this for context, reminders, or annotations that help explain the tasks around them.',
	input_schema: {
		type: 'object',
		properties: {
			text: {
				type: 'string',
				description: 'The note text'
			},
			parent_section_id: {
				type: 'string',
				description: 'Optional: UUID of section to place note in. Omit for top-level.'
			}
		},
		required: ['text']
	}
};

export const CREATE_DIVIDER_TOOL: Anthropic.Tool = {
	name: 'create_divider',
	description: 'Add a visual divider between blocks. Use sparingly for clear visual separation.',
	input_schema: {
		type: 'object',
		properties: {
			parent_section_id: {
				type: 'string',
				description: 'Optional: UUID of section to place divider in. Omit for top-level.'
			}
		}
	}
};

export const MOVE_TODO_TO_SECTION_TOOL: Anthropic.Tool = {
	name: 'move_todo_to_section',
	description:
		'Move a todo into a section at a specific position. Creates a block reference for the todo in the target section.',
	input_schema: {
		type: 'object',
		properties: {
			todo_id: {
				type: 'string',
				description: 'UUID of the todo to move'
			},
			section_id: {
				type: 'string',
				description:
					'UUID of the target section. Use null or omit for top-level (outside any section).'
			},
			position: {
				type: 'integer',
				description:
					'Optional: Position within the section (0 = first). Omit to append at end.'
			}
		},
		required: ['todo_id']
	}
};

export const REORDER_BLOCK_TOOL: Anthropic.Tool = {
	name: 'reorder_block',
	description:
		'Move a block (section, note, divider, or todo reference) to a new position within its parent.',
	input_schema: {
		type: 'object',
		properties: {
			block_id: {
				type: 'string',
				description: 'UUID of the block to move'
			},
			new_position: {
				type: 'integer',
				description: 'New position (0 = first)'
			},
			new_parent_id: {
				type: 'string',
				description:
					'Optional: Move to a different parent section. Omit to stay in current parent.'
			}
		},
		required: ['block_id', 'new_position']
	}
};

export const UPDATE_SECTION_TOOL: Anthropic.Tool = {
	name: 'update_section',
	description: 'Update a section name or collapsed state.',
	input_schema: {
		type: 'object',
		properties: {
			section_id: {
				type: 'string',
				description: 'UUID of the section to update'
			},
			name: {
				type: 'string',
				description: 'New section name'
			},
			collapsed: {
				type: 'boolean',
				description: 'Whether the section is collapsed'
			}
		},
		required: ['section_id']
	}
};

export const DELETE_BLOCK_TOOL: Anthropic.Tool = {
	name: 'delete_block',
	description:
		'Delete a block (section, note, divider, or todo reference). Deleting a section also deletes all blocks inside it. Deleting a todo_ref block only removes it from the view—the actual todo remains.',
	input_schema: {
		type: 'object',
		properties: {
			block_id: {
				type: 'string',
				description: 'UUID of the block to delete'
			}
		},
		required: ['block_id']
	}
};

export const COLLAPSE_SECTION_TOOL: Anthropic.Tool = {
	name: 'collapse_section',
	description: 'Collapse a section to hide its contents.',
	input_schema: {
		type: 'object',
		properties: {
			section_id: {
				type: 'string',
				description: 'UUID of the section to collapse'
			}
		},
		required: ['section_id']
	}
};

export const EXPAND_SECTION_TOOL: Anthropic.Tool = {
	name: 'expand_section',
	description: 'Expand a collapsed section to show its contents.',
	input_schema: {
		type: 'object',
		properties: {
			section_id: {
				type: 'string',
				description: 'UUID of the section to expand'
			}
		},
		required: ['section_id']
	}
};

/**
 * All block tools
 */
export const BLOCK_TOOLS: Anthropic.Tool[] = [
	CREATE_SECTION_TOOL,
	CREATE_NOTE_TOOL,
	CREATE_DIVIDER_TOOL,
	MOVE_TODO_TO_SECTION_TOOL,
	REORDER_BLOCK_TOOL,
	UPDATE_SECTION_TOOL,
	DELETE_BLOCK_TOOL,
	COLLAPSE_SECTION_TOOL,
	EXPAND_SECTION_TOOL
];

/**
 * Context for tool execution
 */
export interface BlockToolContext {
	supabase: SupabaseClient;
	userId: string;
}

/**
 * Tool execution result
 */
export interface BlockToolResult {
	success: boolean;
	message: string;
	data?: unknown;
}

/**
 * Block mutations payload (for UI updates)
 */
export interface BlockMutations {
	created_blocks: { id: string; block_type: string; parent_id: string | null }[];
	updated_blocks: { id: string }[];
	deleted_blocks: string[];
	moved_blocks: { id: string; new_parent_id: string | null; new_position: number }[];
}

/**
 * Create empty mutations object
 */
export function createEmptyBlockMutations(): BlockMutations {
	return {
		created_blocks: [],
		updated_blocks: [],
		deleted_blocks: [],
		moved_blocks: []
	};
}

/**
 * Get next sort_order for a parent
 */
async function getNextSortOrder(
	supabase: SupabaseClient,
	userId: string,
	parentId: string | null
): Promise<number> {
	const query = supabase
		.from('canvas_todo_blocks')
		.select('sort_order')
		.eq('user_id', userId)
		.order('sort_order', { ascending: false })
		.limit(1);

	if (parentId) {
		query.eq('parent_id', parentId);
	} else {
		query.is('parent_id', null);
	}

	const { data } = await query.single();
	return (data?.sort_order ?? -1) + 1;
}

/**
 * Execute a block tool
 */
export async function executeBlockTool(
	toolName: string,
	input: Record<string, unknown>,
	context: BlockToolContext,
	mutations: BlockMutations
): Promise<BlockToolResult> {
	switch (toolName) {
		case 'create_section':
			return executeCreateSection(input, context, mutations);
		case 'create_note':
			return executeCreateNote(input, context, mutations);
		case 'create_divider':
			return executeCreateDivider(input, context, mutations);
		case 'move_todo_to_section':
			return executeMoveToSection(input, context, mutations);
		case 'reorder_block':
			return executeReorderBlock(input, context, mutations);
		case 'update_section':
			return executeUpdateSection(input, context, mutations);
		case 'delete_block':
			return executeDeleteBlock(input, context, mutations);
		case 'collapse_section':
			return executeCollapseSection(input, context, mutations);
		case 'expand_section':
			return executeExpandSection(input, context, mutations);
		default:
			return { success: false, message: `Unknown block tool: ${toolName}` };
	}
}

/**
 * Create Section
 */
async function executeCreateSection(
	input: Record<string, unknown>,
	context: BlockToolContext,
	mutations: BlockMutations
): Promise<BlockToolResult> {
	try {
		const { supabase, userId } = context;
		const name = input.name as string;
		const parentId = (input.parent_section_id as string) || null;
		const collapsed = (input.collapsed as boolean) || false;

		const sortOrder = await getNextSortOrder(supabase, userId, parentId);

		const { data, error } = await supabase
			.from('canvas_todo_blocks')
			.insert({
				user_id: userId,
				block_type: 'section',
				content: { name, collapsed },
				parent_id: parentId,
				sort_order: sortOrder
			})
			.select()
			.single();

		if (error) throw error;

		mutations.created_blocks.push({
			id: data.id,
			block_type: 'section',
			parent_id: parentId
		});

		return {
			success: true,
			message: `Created section "${name}"`,
			data: { id: data.id, name }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to create section: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Create Note
 */
async function executeCreateNote(
	input: Record<string, unknown>,
	context: BlockToolContext,
	mutations: BlockMutations
): Promise<BlockToolResult> {
	try {
		const { supabase, userId } = context;
		const text = input.text as string;
		const parentId = (input.parent_section_id as string) || null;

		const sortOrder = await getNextSortOrder(supabase, userId, parentId);

		const { data, error } = await supabase
			.from('canvas_todo_blocks')
			.insert({
				user_id: userId,
				block_type: 'note',
				content: { text },
				parent_id: parentId,
				sort_order: sortOrder
			})
			.select()
			.single();

		if (error) throw error;

		mutations.created_blocks.push({
			id: data.id,
			block_type: 'note',
			parent_id: parentId
		});

		return {
			success: true,
			message: `Added note: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`,
			data: { id: data.id }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to create note: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Create Divider
 */
async function executeCreateDivider(
	input: Record<string, unknown>,
	context: BlockToolContext,
	mutations: BlockMutations
): Promise<BlockToolResult> {
	try {
		const { supabase, userId } = context;
		const parentId = (input.parent_section_id as string) || null;

		const sortOrder = await getNextSortOrder(supabase, userId, parentId);

		const { data, error } = await supabase
			.from('canvas_todo_blocks')
			.insert({
				user_id: userId,
				block_type: 'divider',
				content: {},
				parent_id: parentId,
				sort_order: sortOrder
			})
			.select()
			.single();

		if (error) throw error;

		mutations.created_blocks.push({
			id: data.id,
			block_type: 'divider',
			parent_id: parentId
		});

		return {
			success: true,
			message: 'Added divider',
			data: { id: data.id }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to create divider: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Move Todo to Section
 */
async function executeMoveToSection(
	input: Record<string, unknown>,
	context: BlockToolContext,
	mutations: BlockMutations
): Promise<BlockToolResult> {
	try {
		const { supabase, userId } = context;
		const todoId = input.todo_id as string;
		const sectionId = (input.section_id as string) || null;
		const position = input.position as number | undefined;

		// Check if todo_ref already exists for this todo
		const { data: existing } = await supabase
			.from('canvas_todo_blocks')
			.select('id')
			.eq('user_id', userId)
			.eq('block_type', 'todo_ref')
			.eq('todo_id', todoId)
			.single();

		if (existing) {
			// Move existing block
			const sortOrder =
				position !== undefined ? position : await getNextSortOrder(supabase, userId, sectionId);

			const { error } = await supabase
				.from('canvas_todo_blocks')
				.update({ parent_id: sectionId, sort_order: sortOrder })
				.eq('id', existing.id);

			if (error) throw error;

			mutations.moved_blocks.push({
				id: existing.id,
				new_parent_id: sectionId,
				new_position: sortOrder
			});

			return {
				success: true,
				message: `Moved todo to ${sectionId ? 'section' : 'top level'}`,
				data: { block_id: existing.id }
			};
		} else {
			// Create new todo_ref block
			const sortOrder =
				position !== undefined ? position : await getNextSortOrder(supabase, userId, sectionId);

			const { data, error } = await supabase
				.from('canvas_todo_blocks')
				.insert({
					user_id: userId,
					block_type: 'todo_ref',
					todo_id: todoId,
					parent_id: sectionId,
					sort_order: sortOrder
				})
				.select()
				.single();

			if (error) throw error;

			mutations.created_blocks.push({
				id: data.id,
				block_type: 'todo_ref',
				parent_id: sectionId
			});

			return {
				success: true,
				message: `Added todo to ${sectionId ? 'section' : 'top level'}`,
				data: { block_id: data.id }
			};
		}
	} catch (error) {
		return {
			success: false,
			message: `Failed to move todo: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Reorder Block
 */
async function executeReorderBlock(
	input: Record<string, unknown>,
	context: BlockToolContext,
	mutations: BlockMutations
): Promise<BlockToolResult> {
	try {
		const { supabase, userId } = context;
		const blockId = input.block_id as string;
		const newPosition = input.new_position as number;
		const newParentId = input.new_parent_id as string | undefined;

		const updateData: Record<string, unknown> = { sort_order: newPosition };
		if (newParentId !== undefined) {
			updateData.parent_id = newParentId || null;
		}

		const { data, error } = await supabase
			.from('canvas_todo_blocks')
			.update(updateData)
			.eq('id', blockId)
			.eq('user_id', userId)
			.select()
			.single();

		if (error) throw error;

		mutations.moved_blocks.push({
			id: blockId,
			new_parent_id: data.parent_id,
			new_position: newPosition
		});

		return {
			success: true,
			message: `Moved block to position ${newPosition}`,
			data: { id: blockId }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to reorder block: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Update Section
 */
async function executeUpdateSection(
	input: Record<string, unknown>,
	context: BlockToolContext,
	mutations: BlockMutations
): Promise<BlockToolResult> {
	try {
		const { supabase, userId } = context;
		const sectionId = input.section_id as string;
		const name = input.name as string | undefined;
		const collapsed = input.collapsed as boolean | undefined;

		// Get current content
		const { data: current, error: fetchError } = await supabase
			.from('canvas_todo_blocks')
			.select('content')
			.eq('id', sectionId)
			.eq('user_id', userId)
			.eq('block_type', 'section')
			.single();

		if (fetchError || !current) {
			return { success: false, message: 'Section not found' };
		}

		const newContent = { ...(current.content as Record<string, unknown>) };
		if (name !== undefined) newContent.name = name;
		if (collapsed !== undefined) newContent.collapsed = collapsed;

		const { error } = await supabase
			.from('canvas_todo_blocks')
			.update({ content: newContent })
			.eq('id', sectionId)
			.eq('user_id', userId);

		if (error) throw error;

		mutations.updated_blocks.push({ id: sectionId });

		const changes: string[] = [];
		if (name !== undefined) changes.push(`renamed to "${name}"`);
		if (collapsed !== undefined) changes.push(collapsed ? 'collapsed' : 'expanded');

		return {
			success: true,
			message: `Updated section: ${changes.join(', ')}`,
			data: { id: sectionId }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to update section: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Delete Block
 */
async function executeDeleteBlock(
	input: Record<string, unknown>,
	context: BlockToolContext,
	mutations: BlockMutations
): Promise<BlockToolResult> {
	try {
		const { supabase, userId } = context;
		const blockId = input.block_id as string;

		// Get block info before deleting
		const { data: block, error: fetchError } = await supabase
			.from('canvas_todo_blocks')
			.select('block_type, content')
			.eq('id', blockId)
			.eq('user_id', userId)
			.single();

		if (fetchError || !block) {
			return { success: false, message: 'Block not found' };
		}

		const { error } = await supabase
			.from('canvas_todo_blocks')
			.delete()
			.eq('id', blockId)
			.eq('user_id', userId);

		if (error) throw error;

		mutations.deleted_blocks.push(blockId);

		const blockName =
			block.block_type === 'section'
				? `section "${(block.content as { name?: string }).name || 'Untitled'}"`
				: block.block_type;

		return {
			success: true,
			message: `Deleted ${blockName}`,
			data: { id: blockId }
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to delete block: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Collapse Section
 */
async function executeCollapseSection(
	input: Record<string, unknown>,
	context: BlockToolContext,
	mutations: BlockMutations
): Promise<BlockToolResult> {
	return executeUpdateSection({ ...input, section_id: input.section_id, collapsed: true }, context, mutations);
}

/**
 * Expand Section
 */
async function executeExpandSection(
	input: Record<string, unknown>,
	context: BlockToolContext,
	mutations: BlockMutations
): Promise<BlockToolResult> {
	return executeUpdateSection({ ...input, section_id: input.section_id, collapsed: false }, context, mutations);
}

/**
 * Check if a tool name is a block tool
 */
export function isBlockTool(toolName: string): boolean {
	return [
		'create_section',
		'create_note',
		'create_divider',
		'move_todo_to_section',
		'reorder_block',
		'update_section',
		'delete_block',
		'collapse_section',
		'expand_section'
	].includes(toolName);
}
