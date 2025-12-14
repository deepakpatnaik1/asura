/**
 * Replicate Audio Transcription (Parakeet)
 *
 * Handles audio transcription via Nvidia Parakeet on Replicate.
 * Industry-best accuracy (6.05% WER), 3386x realtime speed.
 *
 * Model: nvidia/parakeet-rnnt-1.1b
 * Docs: https://replicate.com/nvidia/parakeet-rnnt-1.1b
 */

import { REPLICATE_API_KEY } from '$env/static/private';
import type { TranscribeParams, TranscribeResult } from './index';

/** Replicate prediction response */
interface ReplicatePrediction {
	id: string;
	status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
	// Output is a plain string for Parakeet (not an object)
	output?: string;
	error?: string;
	urls?: {
		get: string;
	};
	metrics?: {
		predict_time?: number;
	};
}

/** Model version mapping */
const PARAKEET_VERSIONS: Record<string, string> = {
	'nvidia/parakeet-rnnt-1.1b': '73ddbebaef172a47c8dfdd79381f110bfdc7691bcc7a4edde82f0a39e380ce50'
};

/**
 * Transcribe audio using Nvidia Parakeet on Replicate
 */
export async function transcribeWithReplicate(params: TranscribeParams): Promise<TranscribeResult> {
	if (!REPLICATE_API_KEY) {
		throw new Error('REPLICATE_API_KEY not configured');
	}

	const {
		audioBase64,
		audioUrl,
		model
	} = params;

	// Get audio URL - Replicate needs a URL
	let inputUrl: string;

	if (audioUrl) {
		inputUrl = audioUrl;
	} else if (audioBase64) {
		// Upload to Replicate's file endpoint
		const blob = new Blob(
			[Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))],
			{ type: 'audio/mp3' }
		);
		const formData = new FormData();
		formData.append('content', blob, 'audio.mp3');

		const uploadResponse = await fetch('https://api.replicate.com/v1/files', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${REPLICATE_API_KEY}`
			},
			body: formData
		});

		if (!uploadResponse.ok) {
			throw new Error(`Failed to upload audio: ${uploadResponse.status}`);
		}

		const uploadResult = await uploadResponse.json() as { urls: { get: string } };
		inputUrl = uploadResult.urls.get;
	} else {
		throw new Error('Either audioBase64 or audioUrl must be provided');
	}

	// Get version ID
	const version = PARAKEET_VERSIONS[model];
	if (!version) {
		throw new Error(`Unknown Parakeet model: ${model}`);
	}

	// Create prediction
	const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${REPLICATE_API_KEY}`
		},
		body: JSON.stringify({
			version,
			input: {
				audio_file: inputUrl  // Parakeet uses 'audio_file' not 'audio'
			}
		})
	});

	if (!createResponse.ok) {
		const error = await createResponse.text();
		throw new Error(`Replicate API error: ${createResponse.status} - ${error}`);
	}

	let prediction: ReplicatePrediction = await createResponse.json();

	// Poll for completion
	while (prediction.status === 'starting' || prediction.status === 'processing') {
		await new Promise(resolve => setTimeout(resolve, 500));

		const pollResponse = await fetch(prediction.urls!.get, {
			headers: {
				Authorization: `Bearer ${REPLICATE_API_KEY}`
			}
		});

		if (!pollResponse.ok) {
			throw new Error(`Failed to poll prediction: ${pollResponse.status}`);
		}

		prediction = await pollResponse.json();
	}

	if (prediction.status === 'failed') {
		throw new Error(`Transcription failed: ${prediction.error}`);
	}

	if (prediction.status === 'canceled') {
		throw new Error('Transcription was canceled');
	}

	// Extract text from output (Parakeet returns plain string)
	const text = prediction.output || '';

	return {
		text,
		model
	};
}
