/**
 * Fal.ai Video Generation
 *
 * Handles video generation via Fal.ai API.
 * Supports models like fast-svd, kling-video, runway-gen3, etc.
 *
 * Docs: https://fal.ai/docs
 */

import { FAL_API_KEY } from '$env/static/private';
import type { VideoGenParams, VideoJobStatus } from './index';

/** Fal request response */
interface FalQueueResponse {
	request_id: string;
	status: string;
}

/** Fal status response */
interface FalStatusResponse {
	status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
	logs?: Array<{ message: string; timestamp: string }>;
}

/** Fal result response */
interface FalResultResponse {
	video?: {
		url: string;
	};
	images?: Array<{
		url: string;
	}>;
	seed?: number;
}

/** Model endpoint mapping */
const VIDEO_MODEL_ENDPOINTS: Record<string, string> = {
	'fal-ai/fast-svd': 'fal-ai/fast-svd',
	'fal-ai/kling-video': 'fal-ai/kling-video',
	'fal-ai/runway-gen3': 'fal-ai/runway-gen3/turbo',
	'fal-ai/minimax-video': 'fal-ai/minimax-video'
};

/**
 * Start video generation on Fal.ai
 */
export async function generateWithFal(params: VideoGenParams): Promise<{ requestId: string }> {
	if (!FAL_API_KEY) {
		throw new Error('FAL_API_KEY not configured');
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

	// Get endpoint for model
	const endpoint = VIDEO_MODEL_ENDPOINTS[model] || model;

	// Build input based on model requirements
	const input: Record<string, unknown> = {
		prompt
	};

	// Handle image input
	if (imageBase64) {
		input.image_url = `data:image/png;base64,${imageBase64}`;
	} else if (imageUrl) {
		input.image_url = imageUrl;
	}

	// Add optional parameters
	if (durationSeconds !== undefined) input.duration = durationSeconds;
	if (width !== undefined) input.width = width;
	if (height !== undefined) input.height = height;
	if (fps !== undefined) input.fps = fps;
	if (seed !== undefined) input.seed = seed;

	// Submit to queue
	const response = await fetch(`https://queue.fal.run/${endpoint}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Key ${FAL_API_KEY}`
		},
		body: JSON.stringify(input)
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Fal API error: ${response.status} - ${error}`);
	}

	const result = (await response.json()) as FalQueueResponse;
	return { requestId: result.request_id };
}

/**
 * Poll Fal request status
 */
export async function pollFalRequest(requestId: string): Promise<VideoJobStatus> {
	if (!FAL_API_KEY) {
		throw new Error('FAL_API_KEY not configured');
	}

	// Extract app ID from request ID (format: app-id:request-uuid)
	const [appId] = requestId.split(':');
	if (!appId) {
		throw new Error(`Invalid request ID format: ${requestId}`);
	}

	const response = await fetch(`https://queue.fal.run/${appId}/requests/${requestId}/status`, {
		headers: {
			Authorization: `Key ${FAL_API_KEY}`
		}
	});

	if (!response.ok) {
		throw new Error(`Failed to poll request: ${response.status}`);
	}

	const status = (await response.json()) as FalStatusResponse;

	// Map Fal status to our status
	const statusMap: Record<string, VideoJobStatus['status']> = {
		IN_QUEUE: 'queued',
		IN_PROGRESS: 'processing',
		COMPLETED: 'succeeded',
		FAILED: 'failed'
	};

	return {
		jobId: requestId,
		status: statusMap[status.status] || 'processing'
	};
}

/**
 * Get completed Fal request result
 */
export async function getFalResult(requestId: string): Promise<{
	videoUrl: string;
	thumbnailUrl?: string;
	durationSeconds?: number;
	seed?: number;
}> {
	if (!FAL_API_KEY) {
		throw new Error('FAL_API_KEY not configured');
	}

	// Extract app ID from request ID
	const [appId] = requestId.split(':');
	if (!appId) {
		throw new Error(`Invalid request ID format: ${requestId}`);
	}

	const response = await fetch(`https://queue.fal.run/${appId}/requests/${requestId}`, {
		headers: {
			Authorization: `Key ${FAL_API_KEY}`
		}
	});

	if (!response.ok) {
		throw new Error(`Failed to get result: ${response.status}`);
	}

	const result = (await response.json()) as FalResultResponse;

	// Get video URL from result
	let videoUrl: string | undefined;

	if (result.video?.url) {
		videoUrl = result.video.url;
	} else if (result.images && result.images.length > 0) {
		// Some models return as images array
		videoUrl = result.images[0].url;
	}

	if (!videoUrl) {
		throw new Error('No video URL in result');
	}

	return {
		videoUrl,
		seed: result.seed
	};
}
