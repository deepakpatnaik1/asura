/**
 * Captioning Module
 *
 * Provides image captioning across providers.
 * Routes to the correct implementation based on provider from database.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getModelProvider, type ProviderType } from '../chat/provider';
import { captionReplicate } from './caption-replicate';

/**
 * Parameters for captioning an image
 */
export interface CaptionParams {
	/** Image URL to caption */
	imageUrl?: string;
	/** Base64-encoded image data (alternative to URL) */
	imageBase64?: string;
	/** Prompt to guide the captioning style */
	prompt?: string;
	/** Model identifier (looked up in database) */
	model: string;
	/** Maximum tokens to generate */
	maxTokens?: number;
	/** Sampling temperature */
	temperature?: number;
}

/**
 * Result from captioning
 */
export interface CaptionResult {
	/** The generated caption/description */
	caption: string;
	/** Model used */
	model: string;
	/** Processing time in milliseconds */
	latencyMs?: number;
}

/**
 * Caption an image using the appropriate provider.
 *
 * Routes to the correct implementation based on the model's provider in the database.
 *
 * @param supabase - Supabase client for provider lookup
 * @param params - Caption parameters
 * @returns Caption result
 */
export async function captionImage(
	supabase: SupabaseClient,
	params: CaptionParams
): Promise<CaptionResult> {
	const provider = await getModelProvider(supabase, params.model);

	switch (provider) {
		case 'replicate':
			return captionReplicate(params);

		// Future providers can be added here:
		// case 'openai':
		//   return captionOpenAI(params);
		// case 'google':
		//   return captionGoogle(params);

		default:
			throw new Error(`Captioning not supported for provider: ${provider}`);
	}
}

// Re-export types
export type { ProviderType };
