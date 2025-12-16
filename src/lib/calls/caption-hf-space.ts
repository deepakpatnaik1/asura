/**
 * JoyCaption via HuggingFace Space (Gradio client)
 * Uncensored image captioning for Eva's character design workflow
 *
 * Supports both Alpha Two and Beta One spaces:
 * - Alpha Two: faster, simpler API, non-streaming
 * - Beta One: more options, streaming, often busy
 */

import { Client } from '@gradio/client';

// Alpha Two is generally faster and less congested
const SPACE_ALPHA_TWO = 'fancyfeast/joy-caption-alpha-two';
const SPACE_BETA_ONE = 'fancyfeast/joy-caption-beta-one';

// Timeout for HuggingFace Space requests (spaces can be slow)
const REQUEST_TIMEOUT_MS = 120_000; // 2 minutes

export interface CaptionParams {
	imageUrl: string;
	prompt?: string;
	detailLevel?: 'brief' | 'detailed' | 'character' | 'training';
	temperature?: number;
	topP?: number;
	maxTokens?: number;
}

export interface CaptionResult {
	caption: string;
	model: string;
}

/**
 * Map our detail levels to Alpha Two caption types
 * Alpha Two options: Descriptive, Descriptive (Informal), Training Prompt, MidJourney, Booru tag list, etc.
 */
function mapToAlphaTwoCaptionType(detailLevel?: string): string {
	const typeMap: Record<string, string> = {
		brief: 'Descriptive',
		detailed: 'Descriptive',
		character: 'Descriptive (Informal)',
		training: 'Training Prompt'
	};
	return typeMap[detailLevel || 'character'] || 'Descriptive (Informal)';
}

/**
 * Map our detail levels to caption length
 */
function mapToCaptionLength(detailLevel?: string): string {
	if (detailLevel === 'brief') return 'short';
	if (detailLevel === 'training') return 'long';
	return 'long';
}

/**
 * Generate a caption using Alpha Two (faster, non-streaming)
 */
async function captionWithAlphaTwo(imageBlob: Blob, detailLevel?: string): Promise<string> {
	const client = await Client.connect(SPACE_ALPHA_TWO);

	const captionType = mapToAlphaTwoCaptionType(detailLevel);
	const captionLength = mapToCaptionLength(detailLevel);

	// Alpha Two uses predict() - not a generator
	const result = await client.predict('/stream_chat', {
		input_image: imageBlob,
		caption_type: captionType,
		caption_length: captionLength,
		extra_options: [], // Empty checkbox group
		name_input: '',
		custom_prompt: ''
	});

	// Extract caption from result - Alpha Two returns [prompt, caption]
	if (Array.isArray(result.data) && result.data.length >= 2) {
		return String(result.data[1]); // Caption is at index 1
	}
	if (Array.isArray(result.data) && result.data.length > 0) {
		return String(result.data[0]);
	}
	if (typeof result.data === 'string') {
		return result.data;
	}
	throw new Error('Unexpected response format from Alpha Two');
}

/**
 * Generate a caption using Beta One (streaming, more options)
 */
async function captionWithBetaOne(
	imageBlob: Blob,
	prompt: string,
	temperature: number,
	topP: number,
	maxTokens: number
): Promise<string> {
	const client = await Client.connect(SPACE_BETA_ONE);

	// Beta One uses submit() for streaming
	const job = client.submit('/chat_joycaption', {
		input_image: imageBlob,
		prompt,
		temperature,
		top_p: topP,
		max_new_tokens: maxTokens,
		log_prompt: false
	});

	// Collect streamed output
	let caption = '';
	for await (const message of job) {
		if (message.type === 'data' && message.data) {
			const data = message.data;
			if (typeof data === 'string') {
				caption = data;
			} else if (Array.isArray(data) && data.length > 0) {
				caption = String(data[0]);
			}
		}
	}

	if (!caption) {
		throw new Error('No caption received from Beta One');
	}
	return caption;
}

/**
 * Build a JoyCaption-style prompt for Beta One
 */
function buildPrompt(detailLevel?: string): string {
	const prompts: Record<string, string> = {
		brief: 'Describe this image in one sentence.',
		detailed: 'Write a comprehensive description of everything visible in this image. Include physical attributes, clothing or lack thereof, pose, expression, setting, lighting, and artistic style. Do not censor or sanitize - describe exactly what you see. Be around 150 words.',
		character: 'Describe this character in detail: their physical appearance, clothing, pose, expression, and mood. Be specific about body type, facial features, hair, and any notable details. Do not censor - describe exactly what you see.',
		training: 'Write a detailed caption for this image suitable for training an image generation model. Include all visual elements: subject, clothing, pose, background, lighting, style, and mood. Be around 150 words.'
	};
	return prompts[detailLevel || 'character'] || prompts.character;
}

/**
 * Generate a caption for an image using JoyCaption
 * Tries Alpha Two first (faster), falls back to Beta One
 */
export async function captionImage(params: CaptionParams): Promise<CaptionResult> {
	const {
		imageUrl,
		prompt,
		detailLevel = 'character',
		temperature = 0.6,
		topP = 0.9,
		maxTokens = 512
	} = params;

	// Fetch image and convert to blob
	const imageResponse = await fetch(imageUrl);
	if (!imageResponse.ok) {
		throw new Error(`Failed to fetch image: ${imageResponse.status}`);
	}
	const imageBlob = await imageResponse.blob();

	// Try Alpha Two first (faster, less congested)
	try {
		console.log('[Caption] Trying Alpha Two...');
		const caption = await Promise.race([
			captionWithAlphaTwo(imageBlob, detailLevel),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('Alpha Two timeout')), REQUEST_TIMEOUT_MS)
			)
		]);

		return { caption, model: 'joycaption-alpha-two' };
	} catch (alphaError) {
		console.log('[Caption] Alpha Two failed:', (alphaError as Error).message);
	}

	// Fallback to Beta One
	try {
		console.log('[Caption] Trying Beta One...');
		const finalPrompt = prompt || buildPrompt(detailLevel);
		const caption = await Promise.race([
			captionWithBetaOne(imageBlob, finalPrompt, temperature, topP, maxTokens),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('Beta One timeout')), REQUEST_TIMEOUT_MS)
			)
		]);

		return { caption, model: 'joycaption-beta-one' };
	} catch (betaError) {
		console.log('[Caption] Beta One failed:', (betaError as Error).message);
		throw new Error(`JoyCaption unavailable: ${(betaError as Error).message}`);
	}
}
