/**
 * Image Upload API
 *
 * POST: Accept drag & drop image uploads, store in Supabase and create chart entry.
 * Images appear in the carousel and can be sent to AI for analysis.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/api/require-auth';
import { databaseError, validationError } from '$lib/api/errors';
import {
	generateThumbnail,
	uploadImageToStorage,
	uploadThumbnailToStorage,
	uploadSvgToStorage,
	optimizeImage
} from '$lib/capabilities/image-extraction';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_SIZE = 50 * 1024 * 1024; // 50MB (will be optimized down)

/**
 * POST /api/chat/files/upload
 *
 * Accepts FormData with 'image' file.
 * Creates a content entry + chart record for the uploaded image.
 */
export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// Parse FormData
	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		return validationError('Invalid form data');
	}

	const imageFile = formData.get('image') as File | null;
	const owner = (formData.get('owner') as string) || 'no-one';

	if (!imageFile) {
		return validationError('No image file provided');
	}

	// Validate file type
	if (!ALLOWED_TYPES.includes(imageFile.type)) {
		return validationError('Unsupported image type. Use JPEG, PNG, GIF, WebP, or SVG.');
	}

	// Validate file size
	if (imageFile.size > MAX_SIZE) {
		return validationError('Image too large. Maximum size is 50MB.');
	}

	try {
		// Read file buffer
		const arrayBuffer = await imageFile.arrayBuffer();
		const rawBuffer = Buffer.from(arrayBuffer);

		// SVGs are already tiny - skip optimization
		const isSvg = imageFile.type === 'image/svg+xml';

		// Optimize raster images (resize to 1568px max, compress to JPEG/PNG)
		let imageBuffer: Buffer;
		let ext: string;

		if (isSvg) {
			imageBuffer = rawBuffer;
			ext = 'svg';
		} else {
			const optimized = await optimizeImage(rawBuffer);
			imageBuffer = optimized.buffer;
			ext = optimized.isPng ? 'png' : 'jpg';
		}

		// Extract filename for alt text (without extension)
		const originalName = imageFile.name || 'Uploaded image';
		const altText = originalName.replace(/\.[^/.]+$/, '');

		// 1. Create a minimal content entry (required for the charts FK)
		const { data: contentData, error: contentError } = await supabase
			.from('articles')
			.insert({
				user_id: userId,
				title: altText,
				raw_content: `[Uploaded image: ${originalName}]`,
				artisan_cut: `[Image: ${altText}]`,
				is_enabled: true, // Enabled so image appears in carousel
				owner,
				source_type: 'image'
			})
			.select('id')
			.single();

		if (contentError || !contentData) {
			console.error('Content insert error:', contentError);
			return databaseError('Failed to create content entry');
		}

		const contentId = contentData.id;
		const bucket = 'content';

		// 2. Upload image to storage
		const imagePath = `images/${userId}/${contentId}/upload-1.${ext}`;
		if (isSvg) {
			await uploadSvgToStorage(imageBuffer, bucket, imagePath);
		} else {
			await uploadImageToStorage(imageBuffer, bucket, imagePath);
		}

		// 3. Generate and upload thumbnail
		let thumbnailPath = `thumbnails/${userId}/${contentId}/upload-1.jpg`;
		try {
			const thumbnailBuffer = await generateThumbnail(imageBuffer);
			await uploadThumbnailToStorage(thumbnailBuffer, bucket, thumbnailPath);
		} catch (thumbErr) {
			// SVGs may fail thumbnail generation, use original as fallback
			console.warn('Thumbnail generation failed, using original:', thumbErr);
			thumbnailPath = imagePath;
		}

		// 4. Create chart record (return ID for vision API)
		const { data: chartData, error: chartError } = await supabase.from('article_charts').insert({
			content_id: contentId,
			user_id: userId,
			chart_index: 1,
			storage_path: imagePath,
			thumbnail_path: thumbnailPath,
			alt_text: altText
		}).select('id').single();

		if (chartError || !chartData) {
			console.error('Chart insert error:', chartError);
			// Clean up - delete the content entry
			await supabase.from('articles').delete().eq('id', contentId);
			return databaseError('Failed to create chart entry');
		}

		const chartId = chartData.id;

		// 5. Create superjournal entry (consistent with PDF/scan workflow)
		const { data: sjData, error: sjError } = await supabase
			.from('superjournal')
			.insert({
				user_id: userId,
				persona_name: 'system',
				user_message: `Boss uploaded image: ${altText}`,
				ai_response: `Image uploaded: **${altText}**. View in canvas →`,
				content_id: contentId
			})
			.select('id')
			.single();

		if (sjError) {
			console.error('Superjournal insert error:', sjError);
			// Don't fail - content is already created, just log the error
		}

		return json({
			success: true,
			id: contentId,
			file_id: contentId,
			chart_id: chartId,
			is_image: true,
			title: altText,
			content: `Image uploaded: **${altText}**. View in canvas →`,
			superjournal_id: sjData?.id
		});
	} catch (error) {
		console.error('Upload error:', error);
		return databaseError('Failed to upload image');
	}
};
