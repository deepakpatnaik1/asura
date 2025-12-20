/**
 * Character Tools for Eva
 *
 * Tools for character design workflow. These tools dispatch to
 * uncensored worker models - Eva (orchestrator) never sees the
 * worker's system prompt or raw output processing.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CHARACTER_PLANNER_PROMPT, FERTILITY_MARKERS } from '$lib/prompts/workers/character-planner';
import { createSimpleLogger } from '$lib/api/logger';
import { generateImage } from '$lib/calls/image';

const log = createSimpleLogger('CharacterTools');

/**
 * Image prompt quality prefix - raw, real, not plastic
 */
const IMAGE_QUALITY_PREFIX = 'Raw photo, candid shot, natural imperfect skin with visible pores and texture, slight skin blemishes, real human skin, unretouched, no makeup or minimal makeup, natural lighting, shallow depth of field, shot on Canon 5D Mark IV, 85mm f/1.4 lens, slight film grain. ';

/**
 * Negative prompt for quality control - reject all artificial looks
 */
const IMAGE_NEGATIVE_PROMPT = 'plastic skin, airbrushed, smooth skin, porcelain skin, perfect skin, flawless skin, CGI, 3D render, digital art, illustration, anime, cartoon, painting, doll-like, mannequin, wax figure, overexposed, oversaturated, bad hands, deformed, blurry, watermark, text, logo, low quality, jpeg artifacts, instagram filter, beauty filter, facetune, photoshopped';

/**
 * Generate a unique 3-character alphanumeric code
 */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // No I or O to avoid confusion
function generateCode(): string {
	return Array.from({ length: 3 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
}

/**
 * Generate N unique codes that don't collide with existing codes
 */
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
 * Draw Character Tool Definition
 */
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

/**
 * All character tools
 */
export const CHARACTER_TOOLS: Anthropic.Tool[] = [PLAN_CHARACTER_TOOL, DRAW_CHARACTER_TOOL];

/**
 * Physical anchors - consistent identifiers across all images
 */
export interface PhysicalAnchors {
	face: string;
	eyes: string;
	hair: string;
	skin: string;
	distinctive: string;
}

/**
 * Character sheet structure returned by planner
 */
export interface CharacterSheet {
	name: string;
	personality: string;
	voice: string;
	backstory: string;
	physical_anchors: PhysicalAnchors;
	scenes: string[];
}

/**
 * Context for character tool execution
 */
export interface CharacterToolContext {
	supabase: SupabaseClient;
	userId: string;
	characterPlanningModel: string;
	characterPlanningProvider: string;
	imageGenModel: string;
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
	return ['plan_character', 'draw_character'].includes(toolName);
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
		case 'draw_character':
			return executeDrawCharacter(input, context);
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
			log.info('Parsing character planner response', { responseLength: rawOutput.length, preview: rawOutput.substring(0, 200) });
			// Try to extract JSON from response (may have markdown code blocks)
			const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
			if (!jsonMatch) {
				log.error('No JSON found in response', { rawOutput: rawOutput.substring(0, 500) });
				throw new Error('No JSON found in response');
			}
			characterSheet = JSON.parse(jsonMatch[0]);
			log.info('Character sheet parsed successfully', { name: characterSheet.name, promptCount: characterSheet.image_prompts?.length });
		} catch (parseError) {
			log.error('JSON parse failed', { error: parseError instanceof Error ? parseError.message : 'Unknown', rawOutput: rawOutput.substring(0, 500) });
			return {
				success: false,
				message: `Failed to parse character sheet: ${parseError instanceof Error ? parseError.message : 'Invalid JSON'}`,
				data: { rawOutput }
			};
		}

		// Create modular elements with unique codes
		const existingState = canvas.state as { render?: { code?: string }[]; semantic?: Record<string, unknown>; viewport?: unknown } | null;
		const existingCodes = new Set((existingState?.render || []).map(el => el.code).filter(Boolean) as string[]);

		// Generate codes: 4 text fields + N scene fields
		const sceneCount = characterSheet.scenes?.length || 0;
		const codes = generateUniqueCodes(4 + sceneCount, existingCodes);

		// Build modular elements - 4 text fields (name, personality, voice, backstory)
		// physical_anchors go in semantic layer, not as text elements
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

		// Build code summary for Eva (grouped by type)
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

		// Verify database write succeeded by re-reading
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
			log.error('Verification failed - elements not saved', { expected: codes, found: Array.from(savedCodes) });
			return {
				success: false,
				message: `Database verification failed: character elements were not saved correctly`
			};
		}

		log.info('Character sheet verified', { name: characterSheet.name, elementCount: codes.length });

		return {
			success: true,
			message: `Character ${characterSheet.name} created and verified. Text elements: ${textCodes.join(', ')}. Prompt elements: ${promptCodes.join(', ')}.`,
			canvasId,
			canvasState: newState // For client refresh - Eva only sees 'message', not this
		};
	} catch (error) {
		log.error('Character planning failed', { error: error instanceof Error ? error.message : 'Unknown' });
		return {
			success: false,
			message: `Character planning failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Draw Character Executor
 *
 * Generates an image from a prompt element identified by its 3-letter code.
 * Eva never sees the actual prompt content - she only knows the element code.
 */
async function executeDrawCharacter(
	input: Record<string, unknown>,
	context: CharacterToolContext
): Promise<CharacterToolResult> {
	try {
		const { supabase, userId, imageGenModel } = context;
		const canvasId = input.canvas_id as string;
		const code = (input.code as string)?.toUpperCase();

		log.info('Executing draw_character', { canvasId, code, model: imageGenModel });

		if (!canvasId || !code) {
			return {
				success: false,
				message: 'Missing required fields: canvas_id, code'
			};
		}

		if (!imageGenModel) {
			return {
				success: false,
				message: 'No image generation model configured. Set one in Settings.'
			};
		}

		// Fetch canvas
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

		// Extract render elements
		const state = canvas.state as { render?: Array<{ type: string; code: string; text?: string; x?: number; y?: number }>; semantic?: Record<string, unknown>; viewport?: unknown } | null;
		const renderElements = state?.render || [];

		// Find prompt element by code
		const promptElement = renderElements.find(el => el.code === code && el.type === 'prompt');

		if (!promptElement) {
			// List available prompt codes for Eva
			const promptCodes = renderElements.filter(el => el.type === 'prompt').map(el => el.code);
			return {
				success: false,
				message: `Code ${code} is not a valid prompt element. Available prompt codes: ${promptCodes.join(', ') || 'none'}`
			};
		}

		// Get the scene text (Eva never sees this content)
		const sceneText = promptElement.text;
		if (!sceneText) {
			return {
				success: false,
				message: `Prompt element ${code} has no text content`
			};
		}

		// Get physical anchors from semantic layer
		const physicalAnchors = state?.semantic?.physical_anchors as PhysicalAnchors | undefined;
		if (!physicalAnchors) {
			return {
				success: false,
				message: `No physical anchors found. Run plan_character first.`
			};
		}

		// Build full prompt: fertility markers + physical anchors + scene + quality
		const anchorString = [
			physicalAnchors.face,
			physicalAnchors.eyes,
			physicalAnchors.hair,
			physicalAnchors.skin,
			physicalAnchors.distinctive
		].filter(Boolean).join(', ');

		const finalPrompt = `${IMAGE_QUALITY_PREFIX}${FERTILITY_MARKERS}, ${anchorString}. ${sceneText}`;

		log.info('Generating image', { code, model: imageGenModel });

		// Generate the image
		const result = await generateImage(supabase, {
			prompt: finalPrompt,
			negativePrompt: IMAGE_NEGATIVE_PROMPT,
			model: imageGenModel,
			width: 768,
			height: 1024, // Portrait orientation for character images
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
			.update({
				state: newState,
				updated_at: new Date().toISOString()
			})
			.eq('id', canvasId)
			.eq('user_id', userId);

		if (updateError) {
			return {
				success: false,
				message: `Failed to save image to canvas: ${updateError.message}`
			};
		}

		// Verify database write succeeded by re-reading
		const { data: verifyCanvas } = await supabase
			.from('canvas_designer')
			.select('state')
			.eq('id', canvasId)
			.eq('user_id', userId)
			.single();

		const verifyElements = (verifyCanvas?.state as { render?: { code: string; type: string }[] })?.render || [];
		const imageVerified = verifyElements.some(el => el.code === imageCode && el.type === 'image');

		if (!imageVerified) {
			log.error('Verification failed - image not saved', { imageCode, foundCodes: verifyElements.map(el => el.code) });
			return {
				success: false,
				message: `Database verification failed: image ${imageCode} was not saved correctly`
			};
		}

		// Get character name from semantic layer
		const characterName = (state?.semantic?.characterName as string) || 'character';

		log.info('Image verified', { characterName, imageCode, promptCode: code });

		return {
			success: true,
			message: `Image generated and verified for ${characterName}. Code: ${imageCode} (from prompt ${code})`,
			canvasId,
			canvasState: newState // For client refresh - Eva only sees 'message', not this
		};
	} catch (error) {
		log.error('Image generation failed', { error: error instanceof Error ? error.message : 'Unknown' });
		return {
			success: false,
			message: `Image generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}
