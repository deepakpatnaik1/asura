/**
 * Video Generation Module
 *
 * Provides video generation across providers.
 * Routes to the correct implementation based on provider from database.
 *
 * Video generation is async - these functions return immediately with a job ID
 * and provide polling functions to check status and get results.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getModelProvider } from '../chat/provider';
import { generateWithReplicate, pollReplicatePrediction } from './generate-replicate';
import { generateWithFal, pollFalRequest } from './generate-fal';

/**
 * Parameters for video generation
 */
export interface VideoGenParams {
	/** Text prompt describing the video */
	prompt: string;
	/** Starting image URL (for img2vid models) */
	imageUrl?: string;
	/** Starting image as base64 (for img2vid models) */
	imageBase64?: string;
	/** Model identifier (looked up in database) */
	model: string;
	/** Video duration in seconds */
	durationSeconds?: number;
	/** Output width in pixels */
	width?: number;
	/** Output height in pixels */
	height?: number;
	/** Frames per second */
	fps?: number;
	/** Seed for reproducible generations */
	seed?: number;
}

/**
 * Job status for async video generation
 */
export interface VideoJobStatus {
	/** Job ID */
	jobId: string;
	/** Current status */
	status: 'queued' | 'processing' | 'succeeded' | 'failed' | 'canceled';
	/** Progress (0-100) if available */
	progress?: number;
	/** Estimated time remaining in seconds */
	estimatedTimeRemaining?: number;
	/** Error message if failed */
	error?: string;
}

/**
 * Result from completed video generation
 */
export interface VideoGenResult {
	/** Video URL (expires after some time) */
	videoUrl: string;
	/** Thumbnail URL if available */
	thumbnailUrl?: string;
	/** Model used */
	model: string;
	/** Duration in seconds */
	durationSeconds?: number;
	/** Seed used (for reproducibility) */
	seed?: number;
}

/**
 * Start video generation using the appropriate provider.
 *
 * Video generation is async - this returns immediately with a job ID.
 * Use `pollVideoJob` to check status and get results when complete.
 *
 * @param supabase - Supabase client for provider lookup
 * @param params - Video generation parameters
 * @returns Job ID for polling
 */
export async function startVideoGeneration(
	supabase: SupabaseClient,
	params: VideoGenParams
): Promise<{ jobId: string; provider: string }> {
	const provider = await getModelProvider(supabase, params.model);

	switch (provider) {
		case 'replicate':
			const replicateJob = await generateWithReplicate(params);
			return { jobId: replicateJob.predictionId, provider: 'replicate' };

		case 'fal':
			const falJob = await generateWithFal(params);
			return { jobId: falJob.requestId, provider: 'fal' };

		default:
			throw new Error(`Video generation not supported for provider: ${provider}`);
	}
}

/**
 * Poll for video generation job status.
 *
 * @param provider - Provider that started the job ('replicate' or 'fal')
 * @param jobId - Job ID returned from startVideoGeneration
 * @returns Current job status
 */
export async function pollVideoJob(
	provider: string,
	jobId: string
): Promise<VideoJobStatus> {
	switch (provider) {
		case 'replicate':
			return pollReplicatePrediction(jobId);

		case 'fal':
			return pollFalRequest(jobId);

		default:
			throw new Error(`Unknown provider for polling: ${provider}`);
	}
}

/**
 * Wait for video generation to complete.
 *
 * Polls until the job succeeds, fails, or times out.
 *
 * @param provider - Provider that started the job
 * @param jobId - Job ID returned from startVideoGeneration
 * @param model - Model identifier for result
 * @param timeoutMs - Maximum time to wait (default 10 minutes)
 * @param pollIntervalMs - Time between polls (default 2 seconds)
 * @returns Video generation result
 */
export async function waitForVideo(
	provider: string,
	jobId: string,
	model: string,
	timeoutMs = 600000,
	pollIntervalMs = 2000
): Promise<VideoGenResult> {
	const startTime = Date.now();

	while (Date.now() - startTime < timeoutMs) {
		const status = await pollVideoJob(provider, jobId);

		if (status.status === 'succeeded') {
			// Get the result - this depends on provider
			if (provider === 'replicate') {
				const { getReplicateResult } = await import('./generate-replicate');
				const result = await getReplicateResult(jobId);
				return { ...result, model };
			} else if (provider === 'fal') {
				const { getFalResult } = await import('./generate-fal');
				const result = await getFalResult(jobId);
				return { ...result, model };
			}
			throw new Error('Unknown provider for result fetch');
		}

		if (status.status === 'failed') {
			throw new Error(`Video generation failed: ${status.error}`);
		}

		if (status.status === 'canceled') {
			throw new Error('Video generation was canceled');
		}

		await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
	}

	throw new Error(`Video generation timed out after ${timeoutMs}ms`);
}

// Re-export individual implementations
export { generateWithReplicate, pollReplicatePrediction, getReplicateResult } from './generate-replicate';
export { generateWithFal, pollFalRequest, getFalResult } from './generate-fal';
