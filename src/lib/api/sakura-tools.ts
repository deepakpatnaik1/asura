/**
 * Sakura Tools for Eva (Character Designer)
 *
 * Tool definitions and executors for character design workflow.
 * These tools allow Eva to generate images for character creation.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY, FIREWORKS_API_KEY, OPENROUTER_API_KEY } from '$env/static/private';
import { createClient } from '@supabase/supabase-js';

// Service role client for storage operations
const supabaseStorage = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Fireworks FLUX models
 */
const FIREWORKS_MODELS = {
	'flux-schnell': 'accounts/fireworks/models/flux-1-schnell-fp8', // Fast iteration, $0.0014/image
	'flux-dev': 'accounts/fireworks/models/flux-1-dev-fp8', // Character portraits, $0.014/image
	'flux-pro': 'accounts/fireworks/models/flux-1-1-pro' // Premium quality, $0.04/image
} as const;

/**
 * OpenRouter image models
 */
const OPENROUTER_MODELS = {
	'flux-schnell-or': 'black-forest-labs/flux-schnell', // Fast FLUX via OpenRouter
	'flux-dev-or': 'black-forest-labs/flux-1.1-pro', // FLUX Pro via OpenRouter
	'sd-turbo': 'stabilityai/sd-turbo', // Fast SD
	'sdxl': 'stabilityai/stable-diffusion-xl-base-1.0' // SDXL base
} as const;

type FireworksModel = keyof typeof FIREWORKS_MODELS;
type OpenRouterModel = keyof typeof OPENROUTER_MODELS;
type ImageModel = FireworksModel | OpenRouterModel;

function isOpenRouterModel(model: string): model is OpenRouterModel {
	return model in OPENROUTER_MODELS;
}

function isFireworksModel(model: string): model is FireworksModel {
	return model in FIREWORKS_MODELS;
}

/**
 * Tool Definitions
 */

export const GENERATE_IMAGE_TOOL: Anthropic.Tool = {
	name: 'generate_image',
	description:
		'Generate an image using AI models. Returns a URL to the generated image. Fireworks models: flux-schnell (fast), flux-dev (portraits), flux-pro (premium). OpenRouter models: flux-schnell-or, flux-dev-or, sd-turbo (fast SD), sdxl (SDXL base).',
	input_schema: {
		type: 'object',
		properties: {
			prompt: {
				type: 'string',
				description:
					'Detailed image generation prompt. Be specific about subject, style, lighting, composition. Include character details like hair color, eye color, clothing, expression.'
			},
			negative_prompt: {
				type: 'string',
				description:
					'What to avoid in the image. Default: "bad hands, deformed, blurry, watermark, text"'
			},
			model: {
				type: 'string',
				enum: ['flux-schnell', 'flux-dev', 'flux-pro', 'flux-schnell-or', 'flux-dev-or', 'sd-turbo', 'sdxl'],
				description:
					'Model to use. Fireworks: flux-schnell/dev/pro. OpenRouter: flux-schnell-or, flux-dev-or, sd-turbo, sdxl. Default: flux-schnell'
			},
			seed: {
				type: 'number',
				description:
					'Seed for reproducible generations. Use the same seed to get consistent results when iterating on a prompt.'
			},
			width: {
				type: 'number',
				description: 'Image width in pixels (256-1440). Default: 1024'
			},
			height: {
				type: 'number',
				description: 'Image height in pixels (256-1440). Default: 1024'
			},
			role: {
				type: 'string',
				description:
					'Purpose of this image in the character profile: hero (main portrait), card (thumbnail), gallery (additional shots), expression (emotion variants)'
			}
		},
		required: ['prompt']
	}
};

export const EXPORT_CHARACTER_TOOL: Anthropic.Tool = {
	name: 'export_character',
	description:
		'Export a character from a whiteboard to Sakura JSON format. Reads the whiteboard state and produces a character definition with images, backstory, and system prompt.',
	input_schema: {
		type: 'object',
		properties: {
			whiteboard_id: {
				type: 'string',
				description: 'The UUID of the whiteboard (character canvas) to export'
			}
		},
		required: ['whiteboard_id']
	}
};

/**
 * All sakura tools
 */
export const SAKURA_TOOLS: Anthropic.Tool[] = [GENERATE_IMAGE_TOOL, EXPORT_CHARACTER_TOOL];

/**
 * Context for tool execution
 */
export interface SakuraToolContext {
	userId: string;
	supabase?: any; // For export_character (reading whiteboard state)
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
	success: boolean;
	message: string;
	data?: unknown;
}

/**
 * Call Fireworks API to generate image
 * Docs: https://docs.fireworks.ai/api-reference/generate-a-new-image-from-a-text-prompt
 */
async function generateWithFireworks(params: {
	prompt: string;
	negative_prompt?: string;
	model: FireworksModel;
	seed?: number;
	width?: number;
	height?: number;
}): Promise<{ imageBase64: string; seed: number }> {
	const model = params.model;
	const modelId = FIREWORKS_MODELS[model];

	// Set inference steps based on model
	const steps = model === 'flux-schnell' ? 4 : model === 'flux-dev' ? 28 : 25;

	// Generate seed if not provided
	const seed = params.seed ?? Math.floor(Math.random() * 2147483647);

	// Fireworks API: model ID goes in URL, not body
	const url = `https://api.fireworks.ai/inference/v1/workflows/${modelId}/text_to_image`;

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${FIREWORKS_API_KEY}`,
			Accept: 'image/png'
		},
		body: JSON.stringify({
			prompt: params.prompt,
			guidance_scale: 3.5,
			num_inference_steps: steps,
			seed,
			height: params.height || 1024,
			width: params.width || 1024
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Fireworks API error: ${response.status} - ${error}`);
	}

	// Fireworks returns binary PNG data when Accept: image/png
	const imageBuffer = await response.arrayBuffer();
	const imageBase64 = Buffer.from(imageBuffer).toString('base64');

	return {
		imageBase64,
		seed
	};
}

/**
 * Call OpenRouter API to generate image
 */
async function generateWithOpenRouter(params: {
	prompt: string;
	negative_prompt?: string;
	model: OpenRouterModel;
	seed?: number;
	width?: number;
	height?: number;
}): Promise<{ imageBase64: string; seed: number }> {
	const modelId = OPENROUTER_MODELS[params.model];

	// Generate seed if not provided
	const seed = params.seed ?? Math.floor(Math.random() * 2147483647);

	const response = await fetch('https://openrouter.ai/api/v1/images/generations', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${OPENROUTER_API_KEY}`,
			'HTTP-Referer': 'https://asura.app',
			'X-Title': 'Asura'
		},
		body: JSON.stringify({
			model: modelId,
			prompt: params.prompt,
			negative_prompt: params.negative_prompt || 'bad hands, deformed, blurry, watermark, text',
			width: params.width || 1024,
			height: params.height || 1024,
			seed,
			n: 1
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
	}

	const data = await response.json();

	// OpenRouter returns images in data array with b64_json or url
	if (!data.data || !data.data[0]) {
		throw new Error('Invalid response from OpenRouter API - no image data');
	}

	const imageData = data.data[0];

	// Handle base64 response
	if (imageData.b64_json) {
		return {
			imageBase64: imageData.b64_json,
			seed
		};
	}

	// Handle URL response - fetch and convert to base64
	if (imageData.url) {
		const imageResponse = await fetch(imageData.url);
		if (!imageResponse.ok) {
			throw new Error('Failed to fetch generated image from URL');
		}
		const imageBuffer = await imageResponse.arrayBuffer();
		const imageBase64 = Buffer.from(imageBuffer).toString('base64');
		return {
			imageBase64,
			seed
		};
	}

	throw new Error('Invalid response from OpenRouter API - no image URL or base64');
}

/**
 * Upload image to Supabase storage
 */
async function uploadToStorage(
	imageBase64: string,
	userId: string,
	filename: string
): Promise<string> {
	const imageBuffer = Buffer.from(imageBase64, 'base64');
	const storagePath = `generated/${userId}/${filename}`;

	const { error } = await supabaseStorage.storage.from('content').upload(storagePath, imageBuffer, {
		contentType: 'image/png',
		upsert: true
	});

	if (error) {
		throw new Error(`Storage upload failed: ${error.message}`);
	}

	// Return public URL
	return `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/content/${storagePath}`;
}

/**
 * Execute a sakura tool
 */
export async function executeSakuraTool(
	toolName: string,
	input: Record<string, unknown>,
	context: SakuraToolContext
): Promise<ToolExecutionResult> {
	switch (toolName) {
		case 'generate_image':
			return executeGenerateImage(input, context);

		case 'export_character':
			return executeExportCharacter(input, context);

		default:
			return {
				success: false,
				message: `Unknown sakura tool: ${toolName}`
			};
	}
}

/**
 * Generate Image Executor
 */
async function executeGenerateImage(
	input: Record<string, unknown>,
	context: SakuraToolContext
): Promise<ToolExecutionResult> {
	try {
		const { userId } = context;
		const prompt = input.prompt as string;
		const negative_prompt = input.negative_prompt as string | undefined;
		const model = (input.model as string) || 'flux-schnell';
		const seed = input.seed as number | undefined;
		const width = (input.width as number) || 1024;
		const height = (input.height as number) || 1024;
		const role = input.role as string | undefined;

		// Validate prompt
		if (!prompt || prompt.trim().length === 0) {
			return {
				success: false,
				message: 'Prompt cannot be empty'
			};
		}

		let imageBase64: string;
		let usedSeed: number;

		// Route to appropriate provider based on model
		if (isOpenRouterModel(model)) {
			if (!OPENROUTER_API_KEY) {
				return {
					success: false,
					message: 'OPENROUTER_API_KEY not configured. Cannot generate images with OpenRouter models.'
				};
			}
			const result = await generateWithOpenRouter({
				prompt,
				negative_prompt,
				model,
				seed,
				width,
				height
			});
			imageBase64 = result.imageBase64;
			usedSeed = result.seed;
		} else if (isFireworksModel(model)) {
			if (!FIREWORKS_API_KEY) {
				return {
					success: false,
					message: 'FIREWORKS_API_KEY not configured. Cannot generate images with Fireworks models.'
				};
			}
			const result = await generateWithFireworks({
				prompt,
				negative_prompt,
				model,
				seed,
				width,
				height
			});
			imageBase64 = result.imageBase64;
			usedSeed = result.seed;
		} else {
			return {
				success: false,
				message: `Unknown model: ${model}. Valid models: ${[...Object.keys(FIREWORKS_MODELS), ...Object.keys(OPENROUTER_MODELS)].join(', ')}`
			};
		}

		// Upload to storage
		const timestamp = Date.now();
		const filename = `${model}-${usedSeed}-${timestamp}.png`;
		const publicUrl = await uploadToStorage(imageBase64, userId, filename);

		return {
			success: true,
			message: `Generated image with ${model} (seed: ${usedSeed}). URL: ${publicUrl}`,
			data: {
				url: publicUrl,
				seed: usedSeed,
				model,
				prompt,
				width,
				height,
				role
			}
		};
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : 'Unknown error';
		console.error('[SakuraTools] Image generation failed:', errorMsg);
		return {
			success: false,
			message: `Image generation failed: ${errorMsg}`
		};
	}
}

/**
 * Sakura Character Export Format
 */
interface SakuraCharacter {
	id: string;
	name: string;
	age?: number;
	tagline?: string;
	tags?: string[];
	images: {
		hero?: string;
		card?: string;
		gallery?: string[];
	};
	backstory?: string;
	system_prompt?: string;
}

/**
 * Export Character Executor
 */
async function executeExportCharacter(
	input: Record<string, unknown>,
	context: SakuraToolContext
): Promise<ToolExecutionResult> {
	try {
		const { userId, supabase } = context;
		const whiteboardId = input.whiteboard_id as string;

		if (!supabase) {
			return {
				success: false,
				message: 'Database access not available for export'
			};
		}

		// Fetch whiteboard
		const { data: whiteboard, error } = await supabase
			.from('whiteboards')
			.select('title, state')
			.eq('id', whiteboardId)
			.eq('user_id', userId)
			.single();

		if (error || !whiteboard) {
			return {
				success: false,
				message: 'Whiteboard not found'
			};
		}

		const state = whiteboard.state as {
			render?: Array<{
				id: string;
				type: string;
				src?: string;
				role?: string;
				text?: string;
			}>;
			semantic?: Record<string, unknown>;
		} | null;

		if (!state) {
			return {
				success: false,
				message: 'Whiteboard has no content to export'
			};
		}

		const render = state.render || [];
		const semantic = (state.semantic || {}) as {
			character?: {
				name?: string;
				age?: number;
				tagline?: string;
				tags?: string[];
			};
			images?: {
				hero?: string;
				gallery?: string[];
			};
			backstory?: string;
			system_prompt?: string;
		};

		// Build character from semantic layer (if structured)
		const character: SakuraCharacter = {
			id: whiteboardId,
			name: semantic.character?.name || whiteboard.title,
			age: semantic.character?.age,
			tagline: semantic.character?.tagline,
			tags: semantic.character?.tags,
			images: {
				hero: undefined,
				card: undefined,
				gallery: []
			}
		};

		// Extract images from render elements
		const imageElements = render.filter((el) => el.type === 'image' && el.src);
		for (const img of imageElements) {
			if (img.role === 'hero') {
				character.images.hero = img.src;
			} else if (img.role === 'card') {
				character.images.card = img.src;
			} else {
				character.images.gallery?.push(img.src!);
			}
		}

		// If no hero but we have images, use first as hero
		if (!character.images.hero && imageElements.length > 0) {
			character.images.hero = imageElements[0].src;
		}

		// Extract backstory and system prompt from note elements
		// Look for semantic references first, then fall back to scanning notes
		if (semantic.backstory) {
			const backstoryEl = render.find((el) => el.id === semantic.backstory);
			character.backstory = backstoryEl?.text;
		}
		if (semantic.system_prompt) {
			const promptEl = render.find((el) => el.id === semantic.system_prompt);
			character.system_prompt = promptEl?.text;
		}

		// If no semantic references, look for notes with likely content
		if (!character.backstory || !character.system_prompt) {
			const noteElements = render.filter((el) => el.type === 'note' && el.text);
			for (const note of noteElements) {
				const text = note.text?.toLowerCase() || '';
				if (!character.backstory && (text.includes('backstory') || text.length > 200)) {
					character.backstory = note.text;
				}
				if (!character.system_prompt && (text.includes('you are') || text.includes('system'))) {
					character.system_prompt = note.text;
				}
			}
		}

		// Clean up empty values
		if (character.images.gallery?.length === 0) {
			delete character.images.gallery;
		}

		const exportJson = JSON.stringify(character, null, 2);

		return {
			success: true,
			message: `Exported character "${character.name}" to Sakura JSON format`,
			data: {
				character,
				json: exportJson
			}
		};
	} catch (error) {
		return {
			success: false,
			message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Check if a tool name is a sakura tool
 */
export function isSakuraTool(toolName: string): boolean {
	return ['generate_image', 'export_character'].includes(toolName);
}
