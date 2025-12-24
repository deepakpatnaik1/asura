/**
 * Role: Design Lead - Character Responsibility
 *
 * Character planning and drawing workflow for Eva.
 * Uses the image-models channel for API calls.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { FERTILITY_MARKERS } from '$lib/prompts/workers/character-planner';
import {
	generateCharacterSheet,
	generateImage,
	type CharacterSheet,
	type PhysicalAnchors,
	type PlannerApiKeys
} from '$lib/channels/image-models';
import {
	type CanvasState,
	type CanvasMutations,
	createEmptyCanvasMutations
} from './canvas';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ============================================================================
// Constants
// ============================================================================

const IMAGE_QUALITY_PREFIX = 'Raw photo, candid shot, natural imperfect skin with visible pores and texture, slight skin blemishes, real human skin, unretouched, no makeup or minimal makeup, natural lighting, shallow depth of field, shot on Canon 5D Mark IV, 85mm f/1.4 lens, slight film grain. ';

const IMAGE_NEGATIVE_PROMPT = 'plastic skin, airbrushed, smooth skin, porcelain skin, perfect skin, flawless skin, CGI, 3D render, digital art, illustration, anime, cartoon, painting, doll-like, mannequin, wax figure, overexposed, oversaturated, bad hands, deformed, blurry, watermark, text, logo, low quality, jpeg artifacts, instagram filter, beauty filter, facetune, photoshopped';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // No I or O to avoid confusion

// ============================================================================
// Types
// ============================================================================

export interface CharacterToolContext {
	userId: string;
	characterPlanningModel: string;
	characterPlanningProvider: string;
	imageGenModel: string;
	apiKeys: PlannerApiKeys;
}

export interface CharacterToolResult {
	success: boolean;
	message: string;
	data?: unknown;
	mutations?: CanvasMutations;
}

// ============================================================================
// Tool Definitions
// ============================================================================

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

export const DRAW_CHARACTER_TOOL: Anthropic.Tool = {
	name: 'draw_character',
	description:
		'Generate an image from a prompt element. Use the 3-letter code of the prompt element (returned by plan_character).',
	input_schema: {
		type: 'object',
		properties: {
			canvas_id: {
				type: 'string',
				description: 'The UUID of the canvas containing the character'
			},
			code: {
				type: 'string',
				description: 'The 3-letter code of the prompt element to draw (e.g., "ABC")'
			}
		},
		required: ['canvas_id', 'code']
	}
};

export const CHARACTER_TOOLS: Anthropic.Tool[] = [PLAN_CHARACTER_TOOL, DRAW_CHARACTER_TOOL];

// ============================================================================
// Helpers
// ============================================================================

function generateCode(): string {
	return Array.from({ length: 3 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
}

function generateUniqueCodes(count: number, existingCodes: Set<string> = new Set()): string[] {
	const codes: string[] = [];
	while (codes.length < count) {
		const code = generateCode();
		if (!existingCodes.has(code) && !codes.includes(code)) {
			codes.push(code);
		}
	}
	return codes;
}

export function isCharacterTool(toolName: string): boolean {
	return ['plan_character', 'draw_character'].includes(toolName);
}

// ============================================================================
// Executors
// ============================================================================

async function executePlanCharacter(
	input: Record<string, unknown>,
	context: CharacterToolContext
): Promise<CharacterToolResult> {
	try {
		const { userId, characterPlanningModel, characterPlanningProvider, apiKeys } = context;
		const canvasId = input.canvas_id as string;
		const name = input.name as string;
		const description = input.description as string;

		if (!canvasId || !name || !description) {
			return { success: false, message: 'Missing required fields: canvas_id, name, description' };
		}

		// Verify canvas exists
		const { data: canvas, error: canvasError } = await supabase
			.from('canvas_designer')
			.select('id, title, state')
			.eq('id', canvasId)
			.eq('user_id', userId)
			.single();

		if (canvasError || !canvas) {
			return { success: false, message: 'Canvas not found' };
		}

		// Call character planner via channel
		const characterSheet = await generateCharacterSheet(
			characterPlanningModel,
			characterPlanningProvider,
			name,
			description,
			apiKeys
		);

		// Create modular elements with unique codes
		const existingState = canvas.state as { render?: { code?: string }[]; semantic?: Record<string, unknown>; viewport?: { x: number; y: number; scale: number } } | null;
		const existingCodes = new Set((existingState?.render || []).map(el => el.code).filter(Boolean) as string[]);

		const sceneCount = characterSheet.scenes?.length || 0;
		const codes = generateUniqueCodes(4 + sceneCount, existingCodes);

		// Build modular elements - 4 text fields
		const textFields: Array<{ field: 'name' | 'personality' | 'voice' | 'backstory'; value: string }> = [
			{ field: 'name', value: characterSheet.name },
			{ field: 'personality', value: characterSheet.personality },
			{ field: 'voice', value: characterSheet.voice },
			{ field: 'backstory', value: characterSheet.backstory }
		];

		const elements: Array<{
			id: string;
			type: 'text' | 'prompt';
			code: string;
			text: string;
			field?: 'name' | 'personality' | 'voice' | 'backstory';
			promptIndex?: number;
			x: number;
			y: number;
		}> = [];

		// Add text field elements
		textFields.forEach((tf, i) => {
			elements.push({
				id: codes[i],
				type: 'text',
				code: codes[i],
				text: tf.value,
				field: tf.field,
				x: 0,
				y: i * 150
			});
		});

		// Add scene/prompt elements
		(characterSheet.scenes || []).forEach((sceneText, i) => {
			elements.push({
				id: codes[4 + i],
				type: 'prompt',
				code: codes[4 + i],
				text: sceneText,
				promptIndex: i,
				x: 500,
				y: i * 200
			});
		});

		const textCodes = codes.slice(0, 4);
		const promptCodes = codes.slice(4);

		const newState = {
			render: elements,
			semantic: {
				characterName: characterSheet.name,
				physical_anchors: characterSheet.physical_anchors
			},
			viewport: existingState?.viewport || { x: 0, y: 0, scale: 1 }
		};

		const { error: updateError } = await supabase
			.from('canvas_designer')
			.update({ state: newState, updated_at: new Date().toISOString() })
			.eq('id', canvasId)
			.eq('user_id', userId);

		if (updateError) {
			return { success: false, message: `Failed to save character sheet: ${updateError.message}` };
		}

		// Verify database write
		const { data: verifyCanvas } = await supabase
			.from('canvas_designer')
			.select('state')
			.eq('id', canvasId)
			.eq('user_id', userId)
			.single();

		const savedElements = (verifyCanvas?.state as { render?: { code: string }[] })?.render || [];
		const savedCodes = new Set(savedElements.map(el => el.code));
		const allCodesVerified = codes.every(code => savedCodes.has(code));

		if (!allCodesVerified) {
			return { success: false, message: `Database verification failed: character elements were not saved correctly` };
		}

		const mutations = createEmptyCanvasMutations();
		mutations.updated_canvases.push({ id: canvasId, state: newState as CanvasState });
		mutations.opened_canvas = canvasId;

		return {
			success: true,
			message: `Character ${characterSheet.name} created and verified. Text elements: ${textCodes.join(', ')}. Prompt elements: ${promptCodes.join(', ')}.`,
			mutations
		};
	} catch (error) {
		return {
			success: false,
			message: `Character planning failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

async function executeDrawCharacter(
	input: Record<string, unknown>,
	context: CharacterToolContext
): Promise<CharacterToolResult> {
	try {
		const { userId, imageGenModel } = context;
		const canvasId = input.canvas_id as string;
		const code = (input.code as string)?.toUpperCase();

		if (!canvasId || !code) {
			return { success: false, message: 'Missing required fields: canvas_id, code' };
		}

		if (!imageGenModel) {
			return { success: false, message: 'No image generation model configured. Set one in Settings.' };
		}

		// Fetch canvas
		const { data: canvas, error: canvasError } = await supabase
			.from('canvas_designer')
			.select('id, title, state')
			.eq('id', canvasId)
			.eq('user_id', userId)
			.single();

		if (canvasError || !canvas) {
			return { success: false, message: 'Canvas not found' };
		}

		const state = canvas.state as { render?: Array<{ type: string; code: string; text?: string; x?: number; y?: number }>; semantic?: Record<string, unknown>; viewport?: unknown } | null;
		const renderElements = state?.render || [];

		// Find prompt element by code
		const promptElement = renderElements.find(el => el.code === code && el.type === 'prompt');

		if (!promptElement) {
			const promptCodes = renderElements.filter(el => el.type === 'prompt').map(el => el.code);
			return {
				success: false,
				message: `Code ${code} is not a valid prompt element. Available prompt codes: ${promptCodes.join(', ') || 'none'}`
			};
		}

		// Get the scene text
		let sceneText: string;
		const rawText = promptElement.text;

		if (!rawText) {
			return { success: false, message: `Prompt element ${code} has no text content` };
		}

		if (typeof rawText === 'string') {
			sceneText = rawText;
		} else if (typeof rawText === 'object') {
			const obj = rawText as { setting?: string; clothing?: string; pose?: string; expression?: string };
			sceneText = [obj.setting, obj.clothing, obj.pose, obj.expression]
				.filter(Boolean)
				.join('. ');
		} else {
			return { success: false, message: `Prompt element ${code} has invalid text format` };
		}

		// Get physical anchors from semantic layer
		const physicalAnchors = state?.semantic?.physical_anchors as PhysicalAnchors | undefined;
		if (!physicalAnchors) {
			return { success: false, message: `No physical anchors found. Run plan_character first.` };
		}

		// Build full prompt
		const anchorString = [
			physicalAnchors.face,
			physicalAnchors.eyes,
			physicalAnchors.hair,
			physicalAnchors.skin,
			physicalAnchors.distinctive
		].filter(Boolean).join(', ');

		const finalPrompt = `${IMAGE_QUALITY_PREFIX}${FERTILITY_MARKERS}, ${anchorString}. ${sceneText}`;

		// Generate the image via channel
		const result = await generateImage(supabase, {
			prompt: finalPrompt,
			negativePrompt: IMAGE_NEGATIVE_PROMPT,
			model: imageGenModel,
			width: 768,
			height: 1024,
			steps: 30,
			cfgScale: 7
		});

		// Generate unique code for this image
		const existingCodes = new Set(renderElements.map(el => el.code));
		const [imageCode] = generateUniqueCodes(1, existingCodes);

		// Position image to the right of its source prompt
		const promptX = promptElement.x || 500;
		const promptY = promptElement.y || 0;

		const newRender = [
			...renderElements,
			{
				id: imageCode,
				type: 'image',
				code: imageCode,
				src: `data:image/png;base64,${result.imageBase64}`,
				seed: result.seed,
				sourcePromptCode: code,
				x: promptX + 450,
				y: promptY,
				width: 384,
				height: 512
			}
		];

		const newState = {
			render: newRender,
			semantic: state?.semantic || {},
			viewport: state?.viewport || { x: 0, y: 0, scale: 1 }
		};

		const { error: updateError } = await supabase
			.from('canvas_designer')
			.update({ state: newState, updated_at: new Date().toISOString() })
			.eq('id', canvasId)
			.eq('user_id', userId);

		if (updateError) {
			return { success: false, message: `Failed to save image to canvas: ${updateError.message}` };
		}

		// Verify database write
		const { data: verifyCanvas } = await supabase
			.from('canvas_designer')
			.select('state')
			.eq('id', canvasId)
			.eq('user_id', userId)
			.single();

		const verifyElements = (verifyCanvas?.state as { render?: { code: string; type: string }[] })?.render || [];
		const imageVerified = verifyElements.some(el => el.code === imageCode && el.type === 'image');

		if (!imageVerified) {
			return { success: false, message: `Database verification failed: image ${imageCode} was not saved correctly` };
		}

		const characterName = (state?.semantic?.characterName as string) || 'character';

		const mutations = createEmptyCanvasMutations();
		mutations.updated_canvases.push({ id: canvasId, state: newState as CanvasState });

		return {
			success: true,
			message: `Image generated and verified for ${characterName}. Code: ${imageCode} (from prompt ${code})`,
			mutations
		};
	} catch (error) {
		return {
			success: false,
			message: `Image generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

// ============================================================================
// Main Dispatcher
// ============================================================================

export async function executeCharacterTool(
	toolName: string,
	input: Record<string, unknown>,
	context: CharacterToolContext
): Promise<CharacterToolResult> {
	switch (toolName) {
		case 'plan_character':
			return executePlanCharacter(input, context);
		case 'draw_character':
			return executeDrawCharacter(input, context);
		default:
			return { success: false, message: `Unknown character tool: ${toolName}` };
	}
}
