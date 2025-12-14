/**
 * Embedding Module
 *
 * Provides text embedding across providers.
 * Routes to the correct implementation based on provider from database.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getModelProvider, type ProviderType } from '../chat/provider';
import { embedWithVoyage } from './embed-voyage';

/**
 * Parameters for generating embeddings
 */
export interface EmbedParams {
	/** Text to embed */
	text: string;
	/** Model identifier (looked up in database) */
	model: string;
	/** Input type hint (for Voyage) */
	inputType?: 'query' | 'document';
}

/**
 * Parameters for batch embedding
 */
export interface BatchEmbedParams {
	/** Array of texts to embed */
	texts: string[];
	/** Model identifier */
	model: string;
	/** Input type hint */
	inputType?: 'query' | 'document';
}

/**
 * Result from embedding
 */
export interface EmbedResult {
	/** The embedding vector */
	embedding: number[];
	/** Model used */
	model: string;
	/** Token count (if available) */
	tokens?: number;
}

/**
 * Result from batch embedding
 */
export interface BatchEmbedResult {
	/** Array of embedding vectors */
	embeddings: number[][];
	/** Model used */
	model: string;
	/** Total token count (if available) */
	tokens?: number;
}

/**
 * Generate an embedding for a single text.
 *
 * @param supabase - Supabase client for provider lookup
 * @param params - Embedding parameters
 * @returns Embedding result
 */
export async function embed(
	supabase: SupabaseClient,
	params: EmbedParams
): Promise<EmbedResult> {
	const provider = await getModelProvider(supabase, params.model);

	switch (provider) {
		case 'voyage':
			const result = await embedWithVoyage({
				texts: [params.text],
				model: params.model,
				inputType: params.inputType
			});
			return {
				embedding: result.embeddings[0],
				model: params.model,
				tokens: result.tokens
			};

		// Future providers:
		// case 'openai':
		//   return embedWithOpenAI(params);
		// case 'fireworks':
		//   return embedWithFireworks(params);

		default:
			throw new Error(`Embeddings not supported for provider: ${provider}`);
	}
}

/**
 * Generate embeddings for multiple texts in batch.
 *
 * @param supabase - Supabase client for provider lookup
 * @param params - Batch embedding parameters
 * @returns Batch embedding result
 */
export async function embedBatch(
	supabase: SupabaseClient,
	params: BatchEmbedParams
): Promise<BatchEmbedResult> {
	const provider = await getModelProvider(supabase, params.model);

	switch (provider) {
		case 'voyage':
			return embedWithVoyage(params);

		default:
			throw new Error(`Batch embeddings not supported for provider: ${provider}`);
	}
}

// Re-export individual embedders for direct use
export { embedWithVoyage } from './embed-voyage';
