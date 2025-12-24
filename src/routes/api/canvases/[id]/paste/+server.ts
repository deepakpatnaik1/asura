/**
 * Paste Image to Canvas API
 *
 * POST /api/canvases/[id]/paste
 * Accepts base64 image data from clipboard, stores it, and adds to canvas
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { validationError, internalError } from '$lib/api/errors';
import { storeImageToCanvas } from '$lib/roles/design-lead';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import sharp from 'sharp';

// Service role client for storage operations
const supabaseStorage = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * POST /api/canvases/[id]/paste
 * Paste an image from clipboard into the canvas
 */
export const POST: RequestHandler = async ({ params, request, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const { id: canvasId } = params;
	if (!canvasId) {
		return validationError('Canvas ID is required', 'id');
	}

	// Verify canvas exists and belongs to user
	const { data: canvas, error: fetchError } = await supabase
		.from('canvas_designer')
		.select('id')
		.eq('id', canvasId)
		.eq('user_id', userId)
		.single();

	if (fetchError || !canvas) {
		return validationError('Canvas not found', 'id');
	}

	// Parse request body - expects base64 image data
	const parseResult = await parseRequestJson<{ imageData: string }>(request);
	if (!parseResult.success) return parseResult.error;

	const { imageData } = parseResult.data;
	if (!imageData) {
		return validationError('imageData is required', 'imageData');
	}

	try {
		// Extract base64 content (remove data URL prefix if present)
		let base64Content = imageData;
		if (imageData.includes('base64,')) {
			base64Content = imageData.split('base64,')[1];
		}

		// Convert to buffer
		const inputBuffer = Buffer.from(base64Content, 'base64');

		// Use sharp to get dimensions and convert to webp
		const image = sharp(inputBuffer);
		const metadata = await image.metadata();

		if (!metadata.width || !metadata.height) {
			return validationError('Could not determine image dimensions', 'imageData');
		}

		// Convert to webp for consistent storage
		const webpBuffer = await image.webp({ quality: 90 }).toBuffer();
		const webpBase64 = webpBuffer.toString('base64');

		// Store image and update canvas
		const result = await storeImageToCanvas(
			supabaseStorage,
			webpBase64,
			canvasId,
			{ width: metadata.width, height: metadata.height }
		);

		if (!result.success) {
			return internalError(result.error || 'Failed to store image');
		}

		return json({
			success: true,
			imageCode: result.imageCode,
			imageUrl: result.imageUrl,
			newState: result.newState
		});
	} catch (error) {
		console.error('[Paste] Error processing image:', error);
		return internalError(error instanceof Error ? error.message : 'Failed to process image');
	}
};
