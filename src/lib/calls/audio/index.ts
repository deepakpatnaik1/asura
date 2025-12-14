/**
 * Audio Module
 *
 * Provides audio transcription and generation across providers.
 * Routes to the correct implementation based on provider from database.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getModelProvider } from '../chat/provider';
import { transcribeWithOpenAI } from './transcribe-openai';
import { transcribeWithGroq } from './transcribe-groq';
import { transcribeWithReplicate } from './transcribe-replicate';
import { generateWithOpenAI } from './generate-openai';

/**
 * Parameters for audio transcription
 */
export interface TranscribeParams {
	/** Audio file as base64 */
	audioBase64?: string;
	/** Audio file URL */
	audioUrl?: string;
	/** Audio MIME type (e.g., 'audio/mp3', 'audio/wav') */
	mimeType?: string;
	/** Model identifier (looked up in database) */
	model: string;
	/** Language code (ISO 639-1) for improved accuracy */
	language?: string;
	/** Optional prompt to guide transcription */
	prompt?: string;
	/** Response format: 'text', 'json', 'verbose_json', 'srt', 'vtt' */
	responseFormat?: 'text' | 'json' | 'verbose_json' | 'srt' | 'vtt';
}

/**
 * Result from transcription
 */
export interface TranscribeResult {
	/** Transcribed text */
	text: string;
	/** Model used */
	model: string;
	/** Duration in seconds (if available) */
	durationSeconds?: number;
	/** Language detected (if available) */
	language?: string;
	/** Word-level timestamps (if verbose_json format) */
	words?: Array<{
		word: string;
		start: number;
		end: number;
	}>;
}

/**
 * Parameters for audio generation (TTS)
 */
export interface AudioGenParams {
	/** Text to convert to speech */
	text: string;
	/** Model identifier (looked up in database) */
	model: string;
	/** Voice ID or name */
	voice?: string;
	/** Speaking speed (0.25 to 4.0 for OpenAI) */
	speed?: number;
	/** Output format: 'mp3', 'opus', 'aac', 'flac', 'wav', 'pcm' */
	outputFormat?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
}

/**
 * Result from audio generation
 */
export interface AudioGenResult {
	/** Base64-encoded audio data */
	audioBase64: string;
	/** MIME type of the audio */
	mimeType: string;
	/** Model used */
	model: string;
	/** Duration in seconds (if available) */
	durationSeconds?: number;
}

/**
 * Transcribe audio to text using the appropriate provider.
 *
 * @param supabase - Supabase client for provider lookup
 * @param params - Transcription parameters
 * @returns Transcription result
 */
export async function transcribeAudio(
	supabase: SupabaseClient,
	params: TranscribeParams
): Promise<TranscribeResult> {
	const provider = await getModelProvider(supabase, params.model);

	switch (provider) {
		case 'openai':
			return transcribeWithOpenAI(params);

		case 'groq':
			return transcribeWithGroq(params);

		case 'replicate':
			return transcribeWithReplicate(params);

		default:
			throw new Error(`Audio transcription not supported for provider: ${provider}`);
	}
}

/**
 * Generate audio from text using the appropriate provider.
 *
 * @param supabase - Supabase client for provider lookup
 * @param params - Audio generation parameters
 * @returns Audio generation result
 */
export async function generateAudio(
	supabase: SupabaseClient,
	params: AudioGenParams
): Promise<AudioGenResult> {
	const provider = await getModelProvider(supabase, params.model);

	switch (provider) {
		case 'openai':
			return generateWithOpenAI(params);

		default:
			throw new Error(`Audio generation not supported for provider: ${provider}`);
	}
}

// Re-export individual implementations
export { transcribeWithOpenAI } from './transcribe-openai';
export { transcribeWithGroq } from './transcribe-groq';
export { transcribeWithReplicate } from './transcribe-replicate';
export { generateWithOpenAI } from './generate-openai';
