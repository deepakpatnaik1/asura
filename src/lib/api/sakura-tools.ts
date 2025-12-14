/**
 * Sakura Tools for Eva (Character Designer)
 *
 * Tool definitions and executors for character design workflow.
 * These tools allow Eva to generate images for character creation.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY, FIREWORKS_API_KEY, OPENROUTER_API_KEY, FAL_API_KEY, MODELSLAB_API_KEY, VENICE_API_KEY } from '$env/static/private';
import { createClient } from '@supabase/supabase-js';
import {
	generateThumbnail,
	uploadImageToStorage,
	uploadThumbnailToStorage
} from '$lib/capabilities/image-extraction';
import { captionImage as captionImageCall } from '$lib/calls/caption/index';

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

/**
 * Fal.ai image models - NSFW capable with enable_safety_checker: false
 */
const FAL_MODELS = {
	'fal-flux-dev': 'fal-ai/flux/dev', // High quality, $0.025/megapixel
	'fal-flux-schnell': 'fal-ai/flux/schnell', // Fast generation
	'fal-flux-pro': 'fal-ai/flux-pro/v1.1', // Premium quality
	'fal-realistic': 'fal-ai/realistic-vision', // Realistic/NSFW, FREE
	'fal-sdxl': 'fal-ai/fast-sdxl' // SDXL, free tier
} as const;

/**
 * FLUX Kontext models - instruction-based image editing (no mask needed)
 * Preserves identity automatically when editing clothing, hair, expression, etc.
 */
const KONTEXT_MODELS = {
	'kontext-dev': 'fal-ai/flux-kontext/dev', // Open source, good quality
	'kontext-pro': 'fal-ai/flux-pro/kontext' // Premium, $0.04/image
} as const;

type KontextModel = keyof typeof KONTEXT_MODELS;

/**
 * ModelsLab image models - NSFW-focused provider with uncensored generation
 * Docs: https://docs.modelslab.com/image-generation/text-to-image
 */
const MODELSLAB_MODELS = {
	'ml-realistic-vision': 'realistic-vision-v51', // Popular photorealistic, NSFW capable
	'ml-juggernaut-xl': 'juggernaut-xl-v9', // High quality SDXL, NSFW capable
	'ml-epicrealism': 'epicrealism-natural-sin', // Realistic portraits, uncensored
	'ml-deliberate': 'deliberate-v3' // Versatile, good for characters
} as const;

/**
 * Venice AI image models - Privacy-first, uncensored generation
 * Docs: https://docs.venice.ai/api-reference/endpoint/image/generate
 */
const VENICE_MODELS = {
	'venice-flux-uncensored': 'flux-dev-uncensored', // FLUX Dev uncensored, NSFW capable
	'venice-flux-dev': 'flux-dev', // Standard FLUX Dev
	'venice-lustify': 'lustify-sdxl' // Optimized for character art
} as const;

type FireworksModel = keyof typeof FIREWORKS_MODELS;
type OpenRouterModel = keyof typeof OPENROUTER_MODELS;
type FalModel = keyof typeof FAL_MODELS;
type ModelsLabModel = keyof typeof MODELSLAB_MODELS;
type VeniceModel = keyof typeof VENICE_MODELS;
type ImageModel = FireworksModel | OpenRouterModel | FalModel | ModelsLabModel | VeniceModel;

// Reverse mapping: database model_identifier → internal tool key
const MODEL_IDENTIFIER_TO_KEY: Record<string, ImageModel> = {
	// Fal.ai models
	'fal-ai/flux/dev': 'fal-flux-dev',
	'fal-ai/flux/schnell': 'fal-flux-schnell',
	'fal-ai/flux-pro/v1.1': 'fal-flux-pro',
	'fal-ai/realistic-vision': 'fal-realistic',
	'fal-ai/fast-sdxl': 'fal-sdxl',
	// Fireworks models
	'accounts/fireworks/models/flux-1-schnell-fp8': 'flux-schnell',
	'accounts/fireworks/models/flux-1-dev-fp8': 'flux-dev',
	'accounts/fireworks/models/flux-1-1-pro': 'flux-pro',
	// ModelsLab models
	'realistic-vision-v51': 'ml-realistic-vision',
	'juggernaut-xl-v9': 'ml-juggernaut-xl',
	'epicrealism-natural-sin': 'ml-epicrealism',
	'deliberate-v3': 'ml-deliberate',
	// Venice AI models
	'flux-dev-uncensored': 'venice-flux-uncensored',
	'flux-dev': 'venice-flux-dev',
	'lustify-sdxl': 'venice-lustify'
};

/**
 * Convert database model_identifier to internal tool key
 * Accepts either format and returns the internal key
 */
function normalizeModelKey(modelInput: string): ImageModel {
	// Check if it's already an internal key
	if (modelInput in FIREWORKS_MODELS || modelInput in OPENROUTER_MODELS || modelInput in FAL_MODELS || modelInput in MODELSLAB_MODELS || modelInput in VENICE_MODELS) {
		return modelInput as ImageModel;
	}
	// Check reverse mapping (database identifier → internal key)
	if (modelInput in MODEL_IDENTIFIER_TO_KEY) {
		return MODEL_IDENTIFIER_TO_KEY[modelInput];
	}
	// Default fallback - Fal.ai flux-schnell (fast, NSFW capable)
	return 'fal-flux-schnell';
}

function isOpenRouterModel(model: string): model is OpenRouterModel {
	return model in OPENROUTER_MODELS;
}

function isFireworksModel(model: string): model is FireworksModel {
	return model in FIREWORKS_MODELS;
}

function isFalModel(model: string): model is FalModel {
	return model in FAL_MODELS;
}

function isModelsLabModel(model: string): model is ModelsLabModel {
	return model in MODELSLAB_MODELS;
}

function isVeniceModel(model: string): model is VeniceModel {
	return model in VENICE_MODELS;
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
				enum: ['fal-flux-schnell', 'fal-flux-dev', 'fal-flux-pro', 'fal-realistic', 'fal-sdxl', 'ml-realistic-vision', 'ml-juggernaut-xl', 'ml-epicrealism', 'ml-deliberate', 'flux-schnell', 'flux-dev', 'flux-pro', 'flux-schnell-or', 'flux-dev-or', 'sd-turbo', 'sdxl', 'venice-flux-uncensored', 'venice-flux-dev', 'venice-lustify'],
				description:
					'Model to use. Fal.ai (recommended, NSFW capable): fal-flux-schnell (fast), fal-flux-dev (quality), fal-flux-pro (premium), fal-realistic, fal-sdxl. ModelsLab (NSFW): ml-realistic-vision, ml-juggernaut-xl, ml-epicrealism, ml-deliberate. Fireworks: flux-schnell/dev/pro. OpenRouter: flux-schnell-or, flux-dev-or, sd-turbo, sdxl. Default: fal-flux-schnell'
			},
			seed: {
				type: 'number',
				description:
					'Seed for reproducible generations. Use the same seed to get consistent results when iterating on a prompt.'
			},
			width: {
				type: 'number',
				description: 'Image width in pixels (256-1440). Default: 256 (draft mode)'
			},
			height: {
				type: 'number',
				description: 'Image height in pixels (256-1440). Default: 256 (draft mode)'
			},
			role: {
				type: 'string',
				description:
					'Purpose of this image in the character profile: hero (main portrait), card (thumbnail), gallery (additional shots), expression (emotion variants)'
			},
			parent_id: {
				type: 'string',
				description:
					'ID of parent image to branch from. Creates a variant/iteration. Omit for root images.'
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

export const CAPTION_IMAGE_TOOL: Anthropic.Tool = {
	name: 'caption_image',
	description:
		'Describe an image in detail using AI vision. Use this to "see" generated images or external reference images. Returns a detailed text description of the image contents including subjects, poses, expressions, clothing, lighting, composition, and style. This is your eyes - use it to understand what was generated or what the user is showing you.',
	input_schema: {
		type: 'object',
		properties: {
			image_url: {
				type: 'string',
				description: 'URL of the image to caption. Can be a Supabase storage URL or external URL.'
			},
			prompt: {
				type: 'string',
				description:
					'Optional prompt to guide the description. Default: detailed description of subject, pose, expression, clothing, lighting, and style.'
			}
		},
		required: ['image_url']
	}
};

export const EDIT_IMAGE_TOOL: Anthropic.Tool = {
	name: 'edit_image',
	description:
		'Edit an existing image using natural language instructions. Uses FLUX Kontext which automatically preserves identity - same person, same pose, same background - while changing what you specify. No mask needed. Use this when Boss wants to change clothing color, hair style, expression, accessories, or other specific elements. Say exactly what to change and what to keep.',
	input_schema: {
		type: 'object',
		properties: {
			image_url: {
				type: 'string',
				description: 'URL of the image to edit'
			},
			prompt: {
				type: 'string',
				description: 'Natural language edit instruction. Be specific about what to change AND what to preserve. Example: "Change her lingerie from red to white silk. Keep her facial features, pose, and expression exactly the same. Keep the same background and lighting."'
			},
			seed: {
				type: 'number',
				description: 'Seed for reproducible results'
			}
		},
		required: ['image_url', 'prompt']
	}
};

/**
 * All sakura tools
 */
export const SAKURA_TOOLS: Anthropic.Tool[] = [GENERATE_IMAGE_TOOL, EXPORT_CHARACTER_TOOL, CAPTION_IMAGE_TOOL, EDIT_IMAGE_TOOL];

/**
 * Context for tool execution
 */
export interface SakuraToolContext {
	userId: string;
	supabase?: SupabaseClient; // For export_character (reading whiteboard state) and caption_image (model lookup)
	defaultImageModel?: string; // User's preferred image gen model from Settings (image_gen override)
	defaultImageEditModel?: string; // User's preferred image edit model from Settings (image_edit override)
	defaultCaptioningModel?: string; // User's preferred captioning model from Settings (captioning override)
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
 * Call Fal.ai API to generate image
 * Docs: https://fal.ai/models/fal-ai/flux/dev/api
 * Key feature: enable_safety_checker: false for unrestricted NSFW content
 */
async function generateWithFal(params: {
	prompt: string;
	negative_prompt?: string;
	model: FalModel;
	seed?: number;
	width?: number;
	height?: number;
}): Promise<{ imageBase64: string; seed: number }> {
	const modelId = FAL_MODELS[params.model];

	// Generate seed if not provided
	const seed = params.seed ?? Math.floor(Math.random() * 2147483647);

	// Fal.ai REST API: https://fal.run/{model_id}
	const url = `https://fal.run/${modelId}`;

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Key ${FAL_API_KEY}`
		},
		body: JSON.stringify({
			prompt: params.prompt,
			negative_prompt: params.negative_prompt || 'bad hands, deformed, blurry, watermark, text',
			image_size: {
				width: params.width || 1024,
				height: params.height || 1024
			},
			num_inference_steps: params.model === 'fal-flux-schnell' ? 4 : 28,
			seed,
			guidance_scale: 3.5,
			num_images: 1,
			enable_safety_checker: false // NSFW capable
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Fal.ai API error: ${response.status} - ${error}`);
	}

	const data = await response.json();

	// Fal.ai returns images array with url
	if (!data.images || !data.images[0] || !data.images[0].url) {
		throw new Error('Invalid response from Fal.ai API - no image URL');
	}

	// Download image and convert to base64
	const imageResponse = await fetch(data.images[0].url);
	if (!imageResponse.ok) {
		throw new Error('Failed to fetch generated image from Fal.ai URL');
	}
	const imageBuffer = await imageResponse.arrayBuffer();
	const imageBase64 = Buffer.from(imageBuffer).toString('base64');

	return {
		imageBase64,
		seed: data.seed || seed
	};
}

/**
 * Call ModelsLab API to generate image
 * Docs: https://docs.modelslab.com/image-generation/text-to-image
 * NSFW-focused provider with uncensored generation
 */
async function generateWithModelsLab(params: {
	prompt: string;
	negative_prompt?: string;
	model: ModelsLabModel;
	seed?: number;
	width?: number;
	height?: number;
}): Promise<{ imageBase64: string; seed: number }> {
	const modelId = MODELSLAB_MODELS[params.model];

	// Generate seed if not provided
	const seed = params.seed ?? Math.floor(Math.random() * 2147483647);

	// ModelsLab text2img API
	const response = await fetch('https://modelslab.com/api/v6/images/text2img', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			key: MODELSLAB_API_KEY,
			model_id: modelId,
			prompt: params.prompt,
			negative_prompt: params.negative_prompt || 'bad hands, deformed, blurry, watermark, text',
			width: String(params.width || 512),
			height: String(params.height || 512),
			samples: '1',
			num_inference_steps: '30',
			seed: seed,
			guidance_scale: 7.5,
			safety_checker: 'no', // NSFW capable
			enhance_prompt: 'no',
			webhook: null,
			track_id: null
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`ModelsLab API error: ${response.status} - ${error}`);
	}

	const data = await response.json();

	// ModelsLab returns status and output array
	if (data.status === 'error') {
		throw new Error(`ModelsLab API error: ${data.message || 'Unknown error'}`);
	}

	// Handle processing status (async generation)
	if (data.status === 'processing') {
		// Poll for completion
		const fetchResult = data.fetch_result;
		if (!fetchResult) {
			throw new Error('ModelsLab returned processing status but no fetch_result URL');
		}

		// Wait and poll
		let attempts = 0;
		const maxAttempts = 30; // 30 seconds max wait
		while (attempts < maxAttempts) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
			const pollResponse = await fetch(fetchResult, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ key: MODELSLAB_API_KEY })
			});
			const pollData = await pollResponse.json();
			if (pollData.status === 'success' && pollData.output && pollData.output[0]) {
				const imageUrl = pollData.output[0];
				const imageResponse = await fetch(imageUrl);
				if (!imageResponse.ok) {
					throw new Error('Failed to fetch generated image from ModelsLab URL');
				}
				const imageBuffer = await imageResponse.arrayBuffer();
				const imageBase64 = Buffer.from(imageBuffer).toString('base64');
				return { imageBase64, seed };
			}
			if (pollData.status === 'error') {
				throw new Error(`ModelsLab generation failed: ${pollData.message || 'Unknown error'}`);
			}
			attempts++;
		}
		throw new Error('ModelsLab generation timed out');
	}

	// Handle immediate success
	if (!data.output || !data.output[0]) {
		throw new Error('Invalid response from ModelsLab API - no output URL');
	}

	// Download image and convert to base64
	const imageResponse = await fetch(data.output[0]);
	if (!imageResponse.ok) {
		throw new Error('Failed to fetch generated image from ModelsLab URL');
	}
	const imageBuffer = await imageResponse.arrayBuffer();
	const imageBase64 = Buffer.from(imageBuffer).toString('base64');

	return {
		imageBase64,
		seed
	};
}

/**
 * Call Venice AI API to generate image
 * Docs: https://docs.venice.ai/api-reference/endpoint/image/generate
 * Privacy-first, uncensored generation with FLUX models
 */
async function generateWithVenice(params: {
	prompt: string;
	negative_prompt?: string;
	model: VeniceModel;
	seed?: number;
	width?: number;
	height?: number;
}): Promise<{ imageBase64: string; seed: number }> {
	const modelId = VENICE_MODELS[params.model];

	// Generate seed if not provided
	const seed = params.seed ?? Math.floor(Math.random() * 2147483647);

	// Venice image generation API
	const response = await fetch('https://api.venice.ai/api/v1/image/generate', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${VENICE_API_KEY}`
		},
		body: JSON.stringify({
			model: modelId,
			prompt: params.prompt,
			negative_prompt: params.negative_prompt || 'bad hands, deformed, blurry, watermark, text',
			width: params.width || 512,
			height: params.height || 512,
			steps: 25,
			seed,
			cfg_scale: 7.5
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Venice API error: ${response.status} - ${error}`);
	}

	const data = await response.json();

	// Venice returns images array with url or base64
	if (!data.images || !data.images[0]) {
		throw new Error('Invalid response from Venice API - no images');
	}

	const imageData = data.images[0];

	// Handle base64 response
	if (imageData.base64) {
		return {
			imageBase64: imageData.base64,
			seed: data.seed || seed
		};
	}

	// Handle URL response - fetch and convert to base64
	if (imageData.url) {
		const imageResponse = await fetch(imageData.url);
		if (!imageResponse.ok) {
			throw new Error('Failed to fetch generated image from Venice URL');
		}
		const imageBuffer = await imageResponse.arrayBuffer();
		const imageBase64 = Buffer.from(imageBuffer).toString('base64');
		return {
			imageBase64,
			seed: data.seed || seed
		};
	}

	throw new Error('Invalid response from Venice API - no image URL or base64');
}

/**
 * Upload image to Supabase storage with thumbnail
 * Uses unified storage pattern: images/ for full size, thumbnails/ for thumbnails
 */
async function uploadToStorage(
	imageBase64: string,
	userId: string,
	filename: string
): Promise<{ fullUrl: string; thumbnailUrl: string }> {
	const imageBuffer = Buffer.from(imageBase64, 'base64');
	const bucket = 'content';

	// Use unified folder structure (same as uploaded images)
	const imageId = filename.replace('.png', '');
	const imagePath = `images/${userId}/generated/${imageId}.png`;
	const thumbnailPath = `thumbnails/${userId}/generated/${imageId}.jpg`;

	// Upload full image
	await uploadImageToStorage(imageBuffer, bucket, imagePath);

	// Generate and upload thumbnail
	let finalThumbnailPath = thumbnailPath;
	try {
		const thumbnailBuffer = await generateThumbnail(imageBuffer);
		await uploadThumbnailToStorage(thumbnailBuffer, bucket, thumbnailPath);
	} catch (thumbErr) {
		console.warn('[SakuraTools] Thumbnail generation failed, using original:', thumbErr);
		finalThumbnailPath = imagePath;
	}

	return {
		fullUrl: `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${imagePath}`,
		thumbnailUrl: `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${finalThumbnailPath}`
	};
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

		case 'caption_image':
			return executeCaptionImage(input, context);

		case 'edit_image':
			return executeEditImage(input, context);

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
		const { userId, defaultImageModel } = context;
		const prompt = input.prompt as string;
		const negative_prompt = input.negative_prompt as string | undefined;
		// Use tool input if specified, otherwise fall back to user's preferred model from Settings
		const modelInput = (input.model as string) || defaultImageModel || 'fal-flux-schnell';
		const model = normalizeModelKey(modelInput);
		const seed = input.seed as number | undefined;
		const width = (input.width as number) || 256;
		const height = (input.height as number) || 256;
		const role = input.role as string | undefined;
		const parent_id = input.parent_id as string | undefined;
		const created_at = new Date().toISOString(); // Auto-populate timestamp

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
		} else if (isFalModel(model)) {
			if (!FAL_API_KEY) {
				return {
					success: false,
					message: 'FAL_API_KEY not configured. Cannot generate images with Fal.ai models.'
				};
			}
			const result = await generateWithFal({
				prompt,
				negative_prompt,
				model,
				seed,
				width,
				height
			});
			imageBase64 = result.imageBase64;
			usedSeed = result.seed;
		} else if (isModelsLabModel(model)) {
			if (!MODELSLAB_API_KEY) {
				return {
					success: false,
					message: 'MODELSLAB_API_KEY not configured. Cannot generate images with ModelsLab models.'
				};
			}
			const result = await generateWithModelsLab({
				prompt,
				negative_prompt,
				model,
				seed,
				width,
				height
			});
			imageBase64 = result.imageBase64;
			usedSeed = result.seed;
		} else if (isVeniceModel(model)) {
			if (!VENICE_API_KEY) {
				return {
					success: false,
					message: 'VENICE_API_KEY not configured. Cannot generate images with Venice models.'
				};
			}
			const result = await generateWithVenice({
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
				message: `Unknown model: ${model}. Valid models: ${[...Object.keys(FIREWORKS_MODELS), ...Object.keys(OPENROUTER_MODELS), ...Object.keys(FAL_MODELS), ...Object.keys(MODELSLAB_MODELS), ...Object.keys(VENICE_MODELS)].join(', ')}`
			};
		}

		// Upload to storage (full image + thumbnail)
		const timestamp = Date.now();
		const filename = `${model}-${usedSeed}-${timestamp}.png`;
		const { fullUrl, thumbnailUrl } = await uploadToStorage(imageBase64, userId, filename);

		return {
			success: true,
			message: `Generated image with ${model} (seed: ${usedSeed}). URL: ${fullUrl}`,
			data: {
				url: fullUrl,
				thumbnail_url: thumbnailUrl,
				seed: usedSeed,
				model,
				prompt,
				width,
				height,
				role,
				parent_id,
				created_at
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
 * Caption Image Executor
 * Uses JoyCaption via Replicate to describe images - Eva's "eyes" for NSFW content
 */
async function executeCaptionImage(
	input: Record<string, unknown>,
	context: SakuraToolContext
): Promise<ToolExecutionResult> {
	try {
		const { supabase, defaultCaptioningModel } = context;
		const imageUrl = input.image_url as string;
		const prompt = input.prompt as string | undefined;

		if (!imageUrl) {
			return {
				success: false,
				message: 'image_url is required'
			};
		}

		if (!supabase) {
			return {
				success: false,
				message: 'Database access not available for captioning (needed for model lookup)'
			};
		}

		// Default prompt for character design workflow
		const captionPrompt = prompt ||
			'Describe this image in detail. Include: the subject (appearance, age, ethnicity), pose and expression, clothing and accessories, lighting and mood, background and setting, composition and style. Be specific and vivid.';

		// Use model from settings, defaulting to JoyCaption (NSFW-capable)
		const captionModel = defaultCaptioningModel || 'nsfw-api/joycaption-beta-one';

		const result = await captionImageCall(supabase, {
			imageUrl,
			prompt: captionPrompt,
			model: captionModel,
			maxTokens: 512,
			temperature: 0.6
		});

		return {
			success: true,
			message: `Image description (${result.caption.length} chars):\n\n${result.caption}`,
			data: {
				caption: result.caption,
				model: result.model,
				latencyMs: result.latencyMs
			}
		};
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : 'Unknown error';
		console.error('[SakuraTools] Image captioning failed:', errorMsg);
		return {
			success: false,
			message: `Image captioning failed: ${errorMsg}`
		};
	}
}

/**
 * Edit Image Executor
 * Uses FLUX Kontext for instruction-based editing with automatic identity preservation
 */
async function executeEditImage(
	input: Record<string, unknown>,
	context: SakuraToolContext
): Promise<ToolExecutionResult> {
	try {
		const { userId, defaultImageEditModel } = context;
		const imageUrl = input.image_url as string;
		const prompt = input.prompt as string;
		const seed = (input.seed as number) ?? Math.floor(Math.random() * 2147483647);

		// Use model from settings, defaulting to kontext-pro (high quality)
		const modelIdentifier = defaultImageEditModel || 'fal-ai/flux-pro/kontext';

		if (!imageUrl || !prompt) {
			return {
				success: false,
				message: 'image_url and prompt are required'
			};
		}

		if (!FAL_API_KEY) {
			return {
				success: false,
				message: 'FAL_API_KEY not configured. Cannot edit images.'
			};
		}

		// Call FLUX Kontext endpoint using model identifier from settings
		const url = `https://fal.run/${modelIdentifier}`;

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Key ${FAL_API_KEY}`
			},
			body: JSON.stringify({
				image_url: imageUrl,
				prompt,
				seed,
				num_inference_steps: 28,
				guidance_scale: 2.5,
				enable_safety_checker: false // NSFW capable
			})
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Kontext error: ${response.status} - ${error}`);
		}

		const data = await response.json();

		if (!data.images || !data.images[0] || !data.images[0].url) {
			throw new Error('Invalid response from Kontext - no image URL');
		}

		// Download the edited image
		const imageResponse = await fetch(data.images[0].url);
		if (!imageResponse.ok) {
			throw new Error('Failed to fetch edited image from Kontext URL');
		}
		const imageBuffer = await imageResponse.arrayBuffer();
		const imageBase64 = Buffer.from(imageBuffer).toString('base64');

		// Upload to storage
		const timestamp = Date.now();
		const usedSeed = data.seed || seed;
		const modelShortName = modelIdentifier.split('/').pop() || 'kontext';
		const filename = `edit-${modelShortName}-${usedSeed}-${timestamp}.png`;
		const { fullUrl, thumbnailUrl } = await uploadToStorage(imageBase64, userId, filename);

		return {
			success: true,
			message: `Edited image with ${modelIdentifier} (seed: ${usedSeed}). URL: ${fullUrl}`,
			data: {
				url: fullUrl,
				thumbnail_url: thumbnailUrl,
				seed: usedSeed,
				model: modelIdentifier,
				prompt,
				original_image: imageUrl
			}
		};
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : 'Unknown error';
		console.error('[SakuraTools] Image editing failed:', errorMsg);
		return {
			success: false,
			message: `Image editing failed: ${errorMsg}`
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
	return ['generate_image', 'export_character', 'caption_image', 'edit_image'].includes(toolName);
}
