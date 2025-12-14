/**
 * OpenAI Audio Generation (TTS)
 *
 * Handles text-to-speech via OpenAI's TTS API.
 * Supports multiple voices and output formats.
 *
 * Docs: https://platform.openai.com/docs/api-reference/audio/createSpeech
 */

import { OPENAI_API_KEY } from '$env/static/private';
import type { AudioGenParams, AudioGenResult } from './index';

/** Available OpenAI TTS voices */
export type OpenAIVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

/** Map output format to MIME type */
const formatToMime: Record<string, string> = {
	mp3: 'audio/mpeg',
	opus: 'audio/opus',
	aac: 'audio/aac',
	flac: 'audio/flac',
	wav: 'audio/wav',
	pcm: 'audio/pcm'
};

/**
 * Generate audio using OpenAI TTS
 */
export async function generateWithOpenAI(params: AudioGenParams): Promise<AudioGenResult> {
	if (!OPENAI_API_KEY) {
		throw new Error('OPENAI_API_KEY not configured');
	}

	const { text, model, voice = 'alloy', speed = 1.0, outputFormat = 'mp3' } = params;

	// Validate speed
	if (speed < 0.25 || speed > 4.0) {
		throw new Error('Speed must be between 0.25 and 4.0');
	}

	// Call OpenAI API
	const response = await fetch('https://api.openai.com/v1/audio/speech', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${OPENAI_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			model,
			input: text,
			voice,
			speed,
			response_format: outputFormat
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`OpenAI API error: ${response.status} - ${error}`);
	}

	// Get audio data
	const audioBuffer = await response.arrayBuffer();
	const audioBase64 = Buffer.from(audioBuffer).toString('base64');

	return {
		audioBase64,
		mimeType: formatToMime[outputFormat] || 'audio/mpeg',
		model
	};
}
