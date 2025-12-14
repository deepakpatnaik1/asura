/**
 * Voyage AI Embeddings
 *
 * Handles text embeddings via Voyage AI.
 * Used for semantic search in the memory system.
 */

import { VOYAGE_API_KEY } from '$env/static/private';
import { VoyageAIClient } from 'voyageai';
import type { BatchEmbedParams, BatchEmbedResult } from './index';

// Lazy-initialized client
let voyage: VoyageAIClient | null = null;

function getVoyage(): VoyageAIClient {
	if (!voyage) {
		if (!VOYAGE_API_KEY) {
			throw new Error('VOYAGE_API_KEY not configured');
		}
		voyage = new VoyageAIClient({ apiKey: VOYAGE_API_KEY });
	}
	return voyage;
}

/**
 * Generate embeddings using Voyage AI
 */
export async function embedWithVoyage(params: BatchEmbedParams): Promise<BatchEmbedResult> {
	const { texts, model, inputType = 'document' } = params;

	const client = getVoyage();

	const response = await client.embed({
		input: texts,
		model,
		inputType
	});

	// Extract embeddings from response
	const embeddings = response.data?.map((d) => d.embedding ?? []) ?? [];

	return {
		embeddings,
		model,
		tokens: response.usage?.totalTokens
	};
}
