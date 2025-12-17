/**
 * Content Extraction
 *
 * Shared function for extracting images and tables from pasted content.
 * Used by both chat files and reader upload endpoints.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
	extractImages,
	extractHtmlTables,
	htmlToPlainText,
	downloadImage,
	generateThumbnail,
	getImageExtension,
	uploadImageToStorage,
	uploadThumbnailToStorage,
	uploadSvgToStorage
} from './image-extraction';
import {
	extractMarkdownTables,
	renderTableToSvg,
	svgToPng
} from './table-extraction';

export interface ExtractContentOptions {
	content: string;
	userId: string;
	contentId: string;
	supabase: SupabaseClient;
	log: {
		info: (msg: string, data?: Record<string, unknown>) => void;
		warn: (msg: string, data?: Record<string, unknown>) => void;
	};
}

export interface ExtractContentResult {
	chartCount: number;
}

/**
 * Extract images and tables from HTML content, upload to storage, and create chart records.
 */
export async function extractAndSaveCharts(options: ExtractContentOptions): Promise<ExtractContentResult> {
	const { content, userId, contentId, supabase, log } = options;

	const chartResults: Array<{
		index: number;
		storage_path: string;
		thumbnail_path: string;
		alt_text: string;
	}> = [];

	const bucket = 'content';

	// 1. Extract <img> tags
	const images = await extractImages(content);
	for (const image of images) {
		try {
			const imageBuffer = await downloadImage(image.src);
			const imageExt = getImageExtension(imageBuffer);
			const thumbnailBuffer = await generateThumbnail(imageBuffer);

			const imagePath = `images/${userId}/${contentId}/chart-${image.index}.${imageExt}`;
			const thumbnailPath = `thumbnails/${userId}/${contentId}/chart-${image.index}.jpg`;

			await uploadImageToStorage(imageBuffer, bucket, imagePath);
			await uploadThumbnailToStorage(thumbnailBuffer, bucket, thumbnailPath);

			chartResults.push({
				index: image.index,
				storage_path: imagePath,
				thumbnail_path: thumbnailPath,
				alt_text: image.alt || `Image ${image.index}`
			});
		} catch (err) {
			log.warn('Failed to process image', { index: image.index, error: err instanceof Error ? err.message : 'Unknown' });
		}
	}

	// 2. Extract HTML tables
	const htmlTables = await extractHtmlTables(content, images.length);
	for (const table of htmlTables) {
		try {
			const { svg, width } = await renderTableToSvg(table.headers, table.rows);
			const svgBuffer = Buffer.from(svg, 'utf-8');
			const pngBuffer = svgToPng(svg, width);
			const thumbnailBuffer = await generateThumbnail(pngBuffer);

			const storagePath = `images/${userId}/${contentId}/table-${table.index}.svg`;
			const thumbnailPath = `thumbnails/${userId}/${contentId}/chart-${table.index}.jpg`;

			await uploadSvgToStorage(svgBuffer, bucket, storagePath);
			await uploadThumbnailToStorage(thumbnailBuffer, bucket, thumbnailPath);

			chartResults.push({
				index: table.index,
				storage_path: storagePath,
				thumbnail_path: thumbnailPath,
				alt_text: `Table with ${table.headers.length} columns and ${table.rows.length} rows`
			});
		} catch (err) {
			log.warn('Failed to process HTML table', { index: table.index, error: err instanceof Error ? err.message : 'Unknown' });
		}
	}

	// 3. Extract markdown tables
	const plainText = await htmlToPlainText(content);
	const mdTables = extractMarkdownTables(plainText, images.length + htmlTables.length);
	for (const table of mdTables) {
		try {
			const { svg, width } = await renderTableToSvg(table.headers, table.rows);
			const svgBuffer = Buffer.from(svg, 'utf-8');
			const pngBuffer = svgToPng(svg, width);
			const thumbnailBuffer = await generateThumbnail(pngBuffer);

			const storagePath = `images/${userId}/${contentId}/table-${table.index}.svg`;
			const thumbnailPath = `thumbnails/${userId}/${contentId}/chart-${table.index}.jpg`;

			await uploadSvgToStorage(svgBuffer, bucket, storagePath);
			await uploadThumbnailToStorage(thumbnailBuffer, bucket, thumbnailPath);

			chartResults.push({
				index: table.index,
				storage_path: storagePath,
				thumbnail_path: thumbnailPath,
				alt_text: table.caption || `Table with ${table.headers.length} columns and ${table.rows.length} rows`
			});
		} catch (err) {
			log.warn('Failed to process markdown table', { index: table.index, error: err instanceof Error ? err.message : 'Unknown' });
		}
	}

	// 4. Insert chart records into database
	if (chartResults.length > 0) {
		const chartRecords = chartResults.map((chart) => ({
			content_id: contentId,
			user_id: userId,
			chart_index: chart.index,
			storage_path: chart.storage_path,
			thumbnail_path: chart.thumbnail_path,
			alt_text: chart.alt_text
		}));

		const { error: chartInsertError } = await supabase
			.from('article_charts')
			.insert(chartRecords);

		if (chartInsertError) {
			log.warn('Failed to save chart records', { error: chartInsertError.message });
		}
	}

	return { chartCount: chartResults.length };
}
