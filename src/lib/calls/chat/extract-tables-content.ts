/**
 * Extract Tables from Content (Live-Linked Files)
 *
 * Extracts markdown tables from linked Obsidian files,
 * renders them to SVG, uploads to storage, and saves to charts table.
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
import { generateThumbnail } from '$lib/capabilities/image-extraction';

let supabaseServiceRole: SupabaseClient | null = null;

function getSupabaseServiceRole(): SupabaseClient {
	if (!supabaseServiceRole) {
		supabaseServiceRole = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
	}
	return supabaseServiceRole;
}

export interface ExtractTablesContentParams {
	contentId: string;
	userId: string;
	content: string;
}

/**
 * Extract tables from content and save to storage + database
 * Clears existing tables for this content before inserting new ones
 */
export async function runExtractTablesContentJob(params: ExtractTablesContentParams): Promise<void> {
	const { contentId, userId, content } = params;
	const log = createLogger('ExtractTablesContent', userId);
	const supabase = getSupabaseServiceRole();

	try {
		// 1. Delete existing table charts for this content (in case file changed)
		const { data: existingCharts } = await supabase
			.from('article_charts')
			.select('storage_path, thumbnail_path')
			.eq('content_id', contentId)
			.eq('user_id', userId);

		if (existingCharts && existingCharts.length > 0) {
			// Delete storage files
			const pathsToDelete = existingCharts.flatMap(c => [c.storage_path, c.thumbnail_path].filter(Boolean));
			if (pathsToDelete.length > 0) {
				await supabase.storage.from('content').remove(pathsToDelete);
			}

			// Delete database records
			await supabase
				.from('article_charts')
				.delete()
				.eq('content_id', contentId)
				.eq('user_id', userId);

			log.info('Cleared existing table charts', { contentId, count: existingCharts.length });
		}

		// 2. Extract markdown tables from content
		const tables = extractMarkdownTables(content);

		if (tables.length === 0) {
			log.info('No tables found in content', { contentId });
			return;
		}

		log.info('Found tables in content', { contentId, count: tables.length });

		// 3. Process each table
		const chartRecords: Array<{
			content_id: string;
			user_id: string;
			chart_index: number;
			storage_path: string;
			thumbnail_path: string;
			alt_text: string;
		}> = [];

		for (const table of tables) {
			try {
				// Render table to SVG
				const { svg, width } = await renderTableToSvg(table.headers, table.rows);
				const svgBuffer = Buffer.from(svg, 'utf-8');

				// Convert to PNG for thumbnail
				const pngBuffer = svgToPng(svg, width);
				const thumbnailBuffer = await generateThumbnail(pngBuffer);

				// Upload SVG to storage
				const storagePath = `content-charts/${userId}/${contentId}/table-${table.index}.svg`;
				const { error: svgUploadError } = await supabase.storage
					.from('content')
					.upload(storagePath, svgBuffer, {
						contentType: 'image/svg+xml',
						upsert: true
					});

				if (svgUploadError) {
					log.error('SVG upload failed', { table: table.index, error: svgUploadError.message });
					continue;
				}

				// Upload thumbnail to storage
				const thumbnailPath = `content-thumbnails/${userId}/${contentId}/table-${table.index}.jpg`;
				const { error: thumbUploadError } = await supabase.storage
					.from('content')
					.upload(thumbnailPath, thumbnailBuffer, {
						contentType: 'image/jpeg',
						upsert: true
					});

				if (thumbUploadError) {
					log.error('Thumbnail upload failed', { table: table.index, error: thumbUploadError.message });
					continue;
				}

				chartRecords.push({
					content_id: contentId,
					user_id: userId,
					chart_index: table.index,
					storage_path: storagePath,
					thumbnail_path: thumbnailPath,
					alt_text: table.caption || `Table with ${table.headers.length} columns and ${table.rows.length} rows`
				});
			} catch (error) {
				log.error('Failed to process table', {
					table: table.index,
					error: error instanceof Error ? error.message : 'Unknown'
				});
			}
		}

		// 4. Insert records into database
		if (chartRecords.length > 0) {
			const { error: insertError } = await supabase
				.from('article_charts')
				.insert(chartRecords);

			if (insertError) {
				log.error('Failed to insert chart records', { error: insertError.message });
			} else {
				log.info('Saved table charts', { contentId, count: chartRecords.length });
			}
		}
	} catch (error) {
		log.error('Table extraction failed', {
			contentId,
			error: error instanceof Error ? error.message : 'Unknown'
		});
	}
}
