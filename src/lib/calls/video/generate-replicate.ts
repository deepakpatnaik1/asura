/**
 * Replicate Video Generation
 *
 * Handles video generation via Replicate API.
 * Supports models like runway-ml/gen3a-turbo, minimax/video-01, etc.
 *
 * Docs: https://replicate.com/docs/reference/http
 */

import { REPLICATE_API_KEY } from '$env/static/private';
import type { VideoGenParams, VideoJobStatus } from './index';

/** Replicate prediction response */
interface ReplicatePrediction {
	id: string;
	status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
	output?: string | string[];
	error?: string;
	urls?: {
		get: string;
		cancel: string;
	};
	metrics?: {
		predict_time?: number;
	};
}

/** Model version mapping for video models */
const VIDEO_MODEL_VERSIONS: Record<string, string> = {
	// Add video model versions as they're configured
	'minimax/video-01': 'TODO_VERSION_ID',
	'runway-ml/gen3a-turbo': 'TODO_VERSION_ID',
	'stability-ai/stable-video-diffusion': 'TODO_VERSION_ID'
};

/**
 * Start video generation on Replicate
 */
export async function generateWithReplicate(params: VideoGenParams): Promise<{ predictionId: string }> {
	if (!REPLICATE_API_KEY) {
		throw new Error('REPLICATE_API_KEY not configured');
	}

	const {
		prompt,
		imageUrl,
		imageBase64,
		model,
		durationSeconds,
		width,
		height,
		fps,
		seed
	} = params;

	// Get version ID for model
	const version = VIDEO_MODEL_VERSIONS[model];
	if (!version || version === 'TODO_VERSION_ID') {
		throw new Error(`Video model version not configured: ${model}`);
	}

	// Build input based on model requirements
	const input: Record<string, unknown> = {
		prompt
	};

	// Handle image input for img2vid models
	if (imageBase64) {
		input.image = `data:image/png;base64,${imageBase64}`;
	} else if (imageUrl) {
		input.image = imageUrl;
	}

	// Add optional parameters
	if (durationSeconds !== undefined) input.duration = durationSeconds;
	if (width !== undefined) input.width = width;
	if (height !== undefined) input.height = height;
	if (fps !== undefined) input.fps = fps;
	if (seed !== undefined) input.seed = seed;

	// Create prediction
	const response = await fetch('https://api.replicate.com/v1/predictions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${REPLICATE_API_KEY}`
		},
		body: JSON.stringify({
			version,
			input
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Replicate API error: ${response.status} - ${error}`);
	}

	const prediction = (await response.json()) as ReplicatePrediction;
	return { predictionId: prediction.id };
}

/**
 * Poll Replicate prediction status
 */
export async function pollReplicatePrediction(predictionId: string): Promise<VideoJobStatus> {
	if (!REPLICATE_API_KEY) {
		throw new Error('REPLICATE_API_KEY not configured');
	}

	const response = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
		headers: {
			Authorization: `Bearer ${REPLICATE_API_KEY}`
		}
	});

	if (!response.ok) {
		throw new Error(`Failed to poll prediction: ${response.status}`);
	}

	const prediction = (await response.json()) as ReplicatePrediction;

	// Map Replicate status to our status
	const statusMap: Record<string, VideoJobStatus['status']> = {
		starting: 'queued',
		processing: 'processing',
		succeeded: 'succeeded',
		failed: 'failed',
		canceled: 'canceled'
	};

	return {
		jobId: predictionId,
		status: statusMap[prediction.status] || 'processing',
		error: prediction.error
	};
}

/**
 * Get completed Replicate prediction result
 */
export async function getReplicateResult(predictionId: string): Promise<{
	videoUrl: string;
	thumbnailUrl?: string;
	durationSeconds?: number;
	seed?: number;
}> {
	if (!REPLICATE_API_KEY) {
		throw new Error('REPLICATE_API_KEY not configured');
	}

	const response = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
		headers: {
			Authorization: `Bearer ${REPLICATE_API_KEY}`
		}
	});

	if (!response.ok) {
		throw new Error(`Failed to get prediction: ${response.status}`);
	}

	const prediction = (await response.json()) as ReplicatePrediction;

	if (prediction.status !== 'succeeded') {
		throw new Error(`Prediction not complete: ${prediction.status}`);
	}

	// Output can be a string URL or array of URLs
	const output = prediction.output;
	let videoUrl: string;

	if (typeof output === 'string') {
		videoUrl = output;
	} else if (Array.isArray(output) && output.length > 0) {
		videoUrl = output[0];
	} else {
		throw new Error('No video URL in prediction output');
	}

	return {
		videoUrl
	};
}
