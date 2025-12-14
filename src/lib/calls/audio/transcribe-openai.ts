/**
 * OpenAI Audio Transcription (Whisper)
 *
 * Handles audio transcription via OpenAI's Whisper API.
 * Supports multiple audio formats and response formats.
 *
 * Docs: https://platform.openai.com/docs/api-reference/audio/createTranscription
 */

import { OPENAI_API_KEY } from '$env/static/private';
import type { TranscribeParams, TranscribeResult } from './index';

/** OpenAI transcription response (json format) */
interface OpenAITranscriptionResponse {
	text: string;
}

/** OpenAI transcription response (verbose_json format) */
interface OpenAIVerboseTranscriptionResponse {
	task: string;
	language: string;
	duration: number;
	text: string;
	words?: Array<{
		word: string;
		start: number;
		end: number;
	}>;
	segments?: Array<{
		id: number;
		seek: number;
		start: number;
		end: number;
		text: string;
		tokens: number[];
		temperature: number;
		avg_logprob: number;
		compression_ratio: number;
		no_speech_prob: number;
	}>;
}

/**
 * Map MIME type to file extension for OpenAI
 */
function getExtensionFromMimeType(mimeType?: string): string {
	const mimeToExt: Record<string, string> = {
		'audio/mpeg': 'mp3',
		'audio/mp3': 'mp3',
		'audio/mp4': 'mp4',
		'audio/m4a': 'm4a',
		'audio/wav': 'wav',
		'audio/wave': 'wav',
		'audio/webm': 'webm',
		'audio/ogg': 'ogg',
		'audio/flac': 'flac'
	};
	return mimeToExt[mimeType || ''] || 'mp3';
}

/**
 * Transcribe audio using OpenAI Whisper
 */
export async function transcribeWithOpenAI(params: TranscribeParams): Promise<TranscribeResult> {
	if (!OPENAI_API_KEY) {
		throw new Error('OPENAI_API_KEY not configured');
	}

	const {
		audioBase64,
		audioUrl,
		mimeType = 'audio/mp3',
		model,
		language,
		prompt,
		responseFormat = 'verbose_json'
	} = params;

	// Get audio data
	let audioData: Uint8Array;

	if (audioBase64) {
		const binaryString = atob(audioBase64);
		audioData = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			audioData[i] = binaryString.charCodeAt(i);
		}
	} else if (audioUrl) {
		const response = await fetch(audioUrl);
		if (!response.ok) {
			throw new Error(`Failed to fetch audio: ${response.status}`);
		}
		audioData = new Uint8Array(await response.arrayBuffer());
	} else {
		throw new Error('Either audioBase64 or audioUrl must be provided');
	}

	// Create form data
	const ext = getExtensionFromMimeType(mimeType);
	const audioBlob = new Blob([audioData as BlobPart], { type: mimeType });
	const formData = new FormData();
	formData.append('file', audioBlob, `audio.${ext}`);
	formData.append('model', model);

	if (language) {
		formData.append('language', language);
	}
	if (prompt) {
		formData.append('prompt', prompt);
	}
	formData.append('response_format', responseFormat);

	// Call OpenAI API
	const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${OPENAI_API_KEY}`
		},
		body: formData
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`OpenAI API error: ${response.status} - ${error}`);
	}

	// Handle different response formats
	if (responseFormat === 'text' || responseFormat === 'srt' || responseFormat === 'vtt') {
		const text = await response.text();
		return {
			text,
			model
		};
	}

	if (responseFormat === 'verbose_json') {
		const data = (await response.json()) as OpenAIVerboseTranscriptionResponse;
		return {
			text: data.text,
			model,
			durationSeconds: data.duration,
			language: data.language,
			words: data.words
		};
	}

	// JSON format
	const data = (await response.json()) as OpenAITranscriptionResponse;
	return {
		text: data.text,
		model
	};
}
