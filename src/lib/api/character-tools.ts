/**
 * Character Tools for Eva
 *
 * Tools for character design workflow. These tools dispatch to
 * uncensored worker models - Eva (orchestrator) never sees the
 * worker's system prompt or raw output processing.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CHARACTER_PLANNER_PROMPT } from '$lib/prompts/workers/character-planner';
import { createSimpleLogger } from '$lib/api/logger';

const log = createSimpleLogger('CharacterTools');

/**
 * Plan Character Tool Definition
 */
export const PLAN_CHARACTER_TOOL: Anthropic.Tool = {
	name: 'plan_character',
	description:
		'Generate a character sheet for a new character. Dispatches to character planning model which creates personality, voice, backstory, appearance, and image prompts. Results are saved to the canvas.',
	input_schema: {
		type: 'object',
		properties: {
			canvas_id: {
				type: 'string',
				description: 'The UUID of the canvas to save the character sheet to'
			},
			name: {
				type: 'string',
				description: 'The character name'
			},
			description: {
				type: 'string',
				description: 'Brief description of the character (e.g., "redhead farmer girl")'
			}
		},
		required: ['canvas_id', 'name', 'description']
	}
};

/**
 * All character tools
 */
export const CHARACTER_TOOLS: Anthropic.Tool[] = [PLAN_CHARACTER_TOOL];

/**
 * Character sheet structure returned by planner
 */
export interface CharacterSheet {
	name: string;
	personality: string;
	voice: string;
	backstory: string;
	appearance: string;
	image_prompts: string[];
}

/**
 * Context for character tool execution
 */
export interface CharacterToolContext {
	supabase: SupabaseClient;
	userId: string;
	characterPlanningModel: string;
	characterPlanningProvider: string;
	openrouterApiKey: string;
	veniceApiKey: string;
}

/**
 * Tool execution result
 */
export interface CharacterToolResult {
	success: boolean;
	message: string;
	data?: unknown;
	/** Canvas ID if a canvas was updated */
	canvasId?: string;
	/** New canvas state if a canvas was updated */
	canvasState?: unknown;
}

/**
 * Check if a tool name is a character tool
 */
export function isCharacterTool(toolName: string): boolean {
	return ['plan_character'].includes(toolName);
}

/**
 * Execute a character tool
 */
export async function executeCharacterTool(
	toolName: string,
	input: Record<string, unknown>,
	context: CharacterToolContext
): Promise<CharacterToolResult> {
	switch (toolName) {
		case 'plan_character':
			return executePlanCharacter(input, context);
		default:
			return {
				success: false,
				message: `Unknown character tool: ${toolName}`
			};
	}
}

/**
 * Call OpenRouter API for character planning
 */
async function callOpenRouter(
	model: string,
	name: string,
	description: string,
	apiKey: string
): Promise<string> {
	const userPrompt = `Create a character sheet for: ${name} - ${description}`;

	log.info('Calling character planner via OpenRouter', { model, name, hasApiKey: !!apiKey });

	const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
			'HTTP-Referer': 'https://aether.local',
			'X-Title': 'Aether Character Planner'
		},
		body: JSON.stringify({
			model,
			messages: [
				{ role: 'system', content: CHARACTER_PLANNER_PROMPT },
				{ role: 'user', content: userPrompt }
			],
			max_tokens: 2048,
			temperature: 0.7
		})
	});

	if (!response.ok) {
		const error = await response.text();
		log.error('OpenRouter API error', { status: response.status, error });
		throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
	}

	const data = await response.json();
	log.info('OpenRouter response received', { hasContent: !!data.choices?.[0]?.message?.content });
	return data.choices?.[0]?.message?.content || '';
}

/**
 * Call Venice API for character planning
 */
async function callVenice(
	model: string,
	name: string,
	description: string,
	apiKey: string
): Promise<string> {
	const userPrompt = `Create a character sheet for: ${name} - ${description}`;

	log.info('Calling character planner via Venice', { model, name, hasApiKey: !!apiKey });

	const response = await fetch('https://api.venice.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model,
			messages: [
				{ role: 'system', content: CHARACTER_PLANNER_PROMPT },
				{ role: 'user', content: userPrompt }
			],
			max_tokens: 2048,
			temperature: 0.7
		})
	});

	if (!response.ok) {
		const error = await response.text();
		log.error('Venice API error', { status: response.status, error });
		throw new Error(`Venice API error: ${response.status} - ${error}`);
	}

	const data = await response.json();
	log.info('Venice response received', { hasContent: !!data.choices?.[0]?.message?.content });
	return data.choices?.[0]?.message?.content || '';
}

/**
 * Call character planner with appropriate provider
 */
async function callCharacterPlanner(
	model: string,
	provider: string,
	name: string,
	description: string,
	openrouterApiKey: string,
	veniceApiKey: string
): Promise<string> {
	if (provider === 'venice') {
		return callVenice(model, name, description, veniceApiKey);
	}
	// Default to OpenRouter for all other providers
	return callOpenRouter(model, name, description, openrouterApiKey);
}

/**
 * Plan Character Executor
 */
async function executePlanCharacter(
	input: Record<string, unknown>,
	context: CharacterToolContext
): Promise<CharacterToolResult> {
	try {
		const { supabase, userId, characterPlanningModel, characterPlanningProvider, openrouterApiKey, veniceApiKey } = context;
		const canvasId = input.canvas_id as string;
		const name = input.name as string;
		const description = input.description as string;

		log.info('Executing plan_character', { canvasId, name, description, model: characterPlanningModel, provider: characterPlanningProvider });

		if (!canvasId || !name || !description) {
			log.warn('Missing required fields', { canvasId, name, description });
			return {
				success: false,
				message: 'Missing required fields: canvas_id, name, description'
			};
		}

		// Verify canvas exists
		const { data: canvas, error: canvasError } = await supabase
			.from('canvas_designer')
			.select('id, title, state')
			.eq('id', canvasId)
			.eq('user_id', userId)
			.single();

		if (canvasError || !canvas) {
			return {
				success: false,
				message: 'Canvas not found'
			};
		}

		// Call character planner model via appropriate provider
		const rawOutput = await callCharacterPlanner(
			characterPlanningModel,
			characterPlanningProvider,
			name,
			description,
			openrouterApiKey,
			veniceApiKey
		);

		// Parse JSON from response
		let characterSheet: CharacterSheet;
		try {
			// Try to extract JSON from response (may have markdown code blocks)
			const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
			if (!jsonMatch) {
				throw new Error('No JSON found in response');
			}
			characterSheet = JSON.parse(jsonMatch[0]);
		} catch (parseError) {
			return {
				success: false,
				message: `Failed to parse character sheet: ${parseError instanceof Error ? parseError.message : 'Invalid JSON'}`,
				data: { rawOutput }
			};
		}

		// Update canvas with character sheet in semantic layer
		const existingState = canvas.state as { render?: unknown[]; semantic?: Record<string, unknown>; viewport?: unknown } | null;
		const newState = {
			render: existingState?.render || [],
			semantic: {
				...existingState?.semantic,
				character: characterSheet
			},
			viewport: existingState?.viewport || { x: 0, y: 0, scale: 1 }
		};

		const { error: updateError } = await supabase
			.from('canvas_designer')
			.update({
				state: newState,
				updated_at: new Date().toISOString()
			})
			.eq('id', canvasId)
			.eq('user_id', userId);

		if (updateError) {
			return {
				success: false,
				message: `Failed to save character sheet: ${updateError.message}`
			};
		}

		return {
			success: true,
			message: `Character sheet created for ${characterSheet.name}. Saved to canvas.`,
			// Note: Do NOT return character sheet content - Eva must stay blind to NSFW output
			canvasId,
			canvasState: newState
		};
	} catch (error) {
		log.error('Character planning failed', { error: error instanceof Error ? error.message : 'Unknown' });
		return {
			success: false,
			message: `Character planning failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}
