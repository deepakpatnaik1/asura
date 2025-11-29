/**
 * Extract Tables from AI Summary
 *
 * Extracts markdown tables from Samara's initial article summary,
 * renders to SVG, and saves to article_charts alongside source tables.
 *
 * Reuses shared utilities from table-extraction.ts
 */

import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '$lib/api/logger';
import {
	extractMarkdownTables,
	renderTableToSvg,
	svgToPng
} from '$lib/capabilities/table-extraction';
import sharp from 'sharp';

let supabaseServiceRole: SupabaseClient | null = null;

function getSupabaseServiceRole(): SupabaseClient {
	if (!supabaseServiceRole) {
		supabaseServiceRole = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
	}
	return supabaseServiceRole;
}

export interface ExtractSummaryTablesParams {
	articleId: string;
	userId: string;
	aiResponse: string;
}

/**
 * Generate 150x150 thumbnail from image buffer
 */
async function generateThumbnail(imageBuffer: Buffer): Promise<Buffer> {
	return await sharp(imageBuffer)
		.resize(150, 150, {
			fit: 'contain',
			background: { r: 20, g: 20, b: 20, alpha: 1 }
		})
		.jpeg({ quality: 80 })
		.toBuffer();
}

/**
 * Extract tables from AI summary and save to article_charts
 */
export async function extractTablesFromSummary(params: ExtractSummaryTablesParams): Promise<void> {
	const { articleId, userId, aiResponse } = params;
	const log = createLogger('ExtractSummaryTables', userId);
	const supabase = getSupabaseServiceRole();

	try {
		// 1. Extract markdown tables from response
		const tables = extractMarkdownTables(aiResponse);

		if (tables.length === 0) {
			log.info('No tables found in summary', { articleId });
			return;
		}

		log.info('Found tables in summary', { articleId, count: tables.length });

		// 2. Get max chart_index for this article (to continue numbering)
		const { data: existingCharts } = await supabase
			.from('article_charts')
			.select('chart_index')
			.eq('article_id', articleId)
			.order('chart_index', { ascending: false })
			.limit(1);

		const startIndex = (existingCharts?.[0]?.chart_index ?? 0) + 1;

		// 3. Process each table
		const chartRecords: Array<{
			article_id: string;
			user_id: string;
			chart_index: number;
			storage_path: string;
			thumbnail_path: string;
			alt_text: string;
			is_relevant: boolean;
		}> = [];

		for (let i = 0; i < tables.length; i++) {
			const table = tables[i];
			const chartIndex = startIndex + i;

			try {
				// Render table to SVG
				const { svg, width } = await renderTableToSvg(table.headers, table.rows);
				const svgBuffer = Buffer.from(svg, 'utf-8');

				// Convert to PNG for thumbnail
				const pngBuffer = svgToPng(svg, width);
				const thumbnailBuffer = await generateThumbnail(pngBuffer);

				// Upload SVG to storage (same bucket as source tables)
				const storagePath = `article-images/${userId}/${articleId}/summary-table-${chartIndex}.svg`;
				const { error: svgUploadError } = await supabase.storage
					.from('articles')
					.upload(storagePath, svgBuffer, {
						contentType: 'image/svg+xml',
						upsert: true
					});

				if (svgUploadError) {
					log.error('SVG upload failed', { table: chartIndex, error: svgUploadError.message });
					continue;
				}

				// Upload thumbnail to storage
				const thumbnailPath = `article-thumbnails/${userId}/${articleId}/summary-chart-${chartIndex}.jpg`;
				const { error: thumbUploadError } = await supabase.storage
					.from('articles')
					.upload(thumbnailPath, thumbnailBuffer, {
						contentType: 'image/jpeg',
						upsert: true
					});

				if (thumbUploadError) {
					log.error('Thumbnail upload failed', { table: chartIndex, error: thumbUploadError.message });
					continue;
				}

				chartRecords.push({
					article_id: articleId,
					user_id: userId,
					chart_index: chartIndex,
					storage_path: storagePath,
					thumbnail_path: thumbnailPath,
					alt_text: table.caption || `Table with ${table.headers.length} columns and ${table.rows.length} rows`,
					is_relevant: true
				});
			} catch (error) {
				log.error('Failed to process table', {
					table: chartIndex,
					error: error instanceof Error ? error.message : 'Unknown'
				});
			}
		}

		// 4. Insert records into article_charts
		if (chartRecords.length > 0) {
			const { error: insertError } = await supabase
				.from('article_charts')
				.insert(chartRecords);

			if (insertError) {
				log.error('Failed to insert chart records', { error: insertError.message });
			} else {
				log.info('Saved summary table charts', { articleId, count: chartRecords.length });
			}
		}
	} catch (error) {
		log.error('Summary table extraction failed', {
			articleId,
			error: error instanceof Error ? error.message : 'Unknown'
		});
	}
}
