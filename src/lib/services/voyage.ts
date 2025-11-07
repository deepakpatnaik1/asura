import { VOYAGE_API_KEY } from '$env/static/private';

const VOYAGE_BASE_URL = 'https://api.voyageai.com/v1';
const EMBEDDING_MODEL = 'voyage-3'; // Gemini-based embeddings

export interface VoyageEmbeddingResponse {
	object: string;
	data: Array<{
		object: string;
		embedding: number[];
		index: number;
	}>;
	model: string;
	usage: {
		total_tokens: number;
	};
}

/**
 * Generate embeddings for text using Voyage AI (Gemini)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
	const response = await fetch(`${VOYAGE_BASE_URL}/embeddings`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${VOYAGE_API_KEY}`
		},
		body: JSON.stringify({
			input: text,
			model: EMBEDDING_MODEL
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Voyage API error: ${response.status} - ${error}`);
	}

	const data: VoyageEmbeddingResponse = await response.json();
	return data.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
	const response = await fetch(`${VOYAGE_BASE_URL}/embeddings`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${VOYAGE_API_KEY}`
		},
		body: JSON.stringify({
			input: texts,
			model: EMBEDDING_MODEL
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Voyage API error: ${response.status} - ${error}`);
	}

	const data: VoyageEmbeddingResponse = await response.json();
	return data.data.map(d => d.embedding);
}
