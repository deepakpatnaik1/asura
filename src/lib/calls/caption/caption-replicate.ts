/**
 * Replicate Captioning - JoyCaption Pre-Alpha
 *
 * Simple image captioning via Replicate's JoyCaption pre-alpha model.
 * Uncensored captioning suitable for NSFW content.
 *
 * Model: lucataco/joy-caption-pre-alpha
 * Input: Direct image URL
 * Output: Text caption
 */

import { REPLICATE_API_KEY } from '$env/static/private';
import type { CaptionParams, CaptionResult } from './index';

// JoyCaption Pre-Alpha version ID
const JOYCAPTION_VERSION = '31665fdccd897d20cbda1fa305e64f1b94a181e0350409ed2a40df7a243830a5';

/** Replicate prediction response */
interface ReplicatePrediction {
	id: string;
	status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
	output?: string;
	error?: string;
	urls?: {
		get: string;
		cancel: string;
	};
	metrics?: {
		predict_time?: number;
	};
}

/**
 * Convert localhost URL to base64 data URI (Replicate can't access localhost)
 */
async function toAccessibleUrl(imageUrl: string): Promise<string> {
	const isLocalUrl = imageUrl.includes('localhost') || imageUrl.includes('127.0.0.1');

	if (!isLocalUrl) {
		return imageUrl;
	}

	// Fetch locally and convert to data URI
	const response = await fetch(imageUrl);
	if (!response.ok) {
		throw new Error(`Failed to fetch image: ${response.status}`);
	}

	const buffer = await response.arrayBuffer();
	const base64 = Buffer.from(buffer).toString('base64');

	// Determine mime type
	const ext = imageUrl.split('.').pop()?.toLowerCase() || 'webp';
	const mimeTypes: Record<string, string> = {
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		png: 'image/png',
		webp: 'image/webp',
		gif: 'image/gif'
	};
	const mimeType = mimeTypes[ext] || 'image/webp';

	return `data:${mimeType};base64,${base64}`;
}

/**
 * Caption an image using Replicate JoyCaption Pre-Alpha.
 *
 * @param params - Caption parameters
 * @returns Caption result with description text
 */
export async function captionReplicate(params: CaptionParams): Promise<CaptionResult> {
	const { imageUrl, imageBase64 } = params;

	if (!REPLICATE_API_KEY) {
		throw new Error('REPLICATE_API_KEY not configured');
	}

	// Prepare image input
	let imageInput: string;

	if (imageBase64) {
		// Use base64 as data URI
		imageInput = `data:image/webp;base64,${imageBase64}`;
	} else if (imageUrl) {
		// Convert localhost URLs to data URIs
		imageInput = await toAccessibleUrl(imageUrl);
	} else {
		throw new Error('Either imageUrl or imageBase64 must be provided');
	}

	console.log(`[Caption-Replicate] Starting caption request`);

	// Create prediction
	const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${REPLICATE_API_KEY}`
		},
		body: JSON.stringify({
			version: JOYCAPTION_VERSION,
			input: {
				image: imageInput
			}
		})
	});

	if (!createResponse.ok) {
		const error = await createResponse.text();
		throw new Error(`Replicate API error: ${createResponse.status} - ${error}`);
	}

	let prediction: ReplicatePrediction = await createResponse.json();
	console.log(`[Caption-Replicate] Prediction created: ${prediction.id}`);

	// Poll for completion (5 minute timeout - L40S can have cold starts, and this runs in background anyway)
	const startTime = Date.now();
	const TIMEOUT_MS = 300_000;

	while (prediction.status === 'starting' || prediction.status === 'processing') {
		if (Date.now() - startTime > TIMEOUT_MS) {
			throw new Error('Caption request timed out');
		}

		await new Promise(resolve => setTimeout(resolve, 1000));

		const pollResponse = await fetch(prediction.urls!.get, {
			headers: {
				'Authorization': `Bearer ${REPLICATE_API_KEY}`
			}
		});

		if (!pollResponse.ok) {
			throw new Error(`Failed to poll prediction: ${pollResponse.status}`);
		}

		prediction = await pollResponse.json();
	}

	if (prediction.status === 'failed') {
		throw new Error(`Captioning failed: ${prediction.error}`);
	}

	if (prediction.status === 'canceled') {
		throw new Error('Captioning was canceled');
	}

	const caption = prediction.output || '';
	const latencyMs = prediction.metrics?.predict_time ? prediction.metrics.predict_time * 1000 : undefined;

	console.log(`[Caption-Replicate] Caption complete (${latencyMs?.toFixed(0)}ms)`);

	return {
		caption,
		model: 'joycaption-pre-alpha',
		latencyMs
	};
}
