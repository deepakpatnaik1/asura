/**
 * Extract Tables from AI Response
 *
 * Background job that extracts markdown tables from AI responses,
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

export interface ExtractTablesParams {
	superjournalId: string;
	userId: string;
	aiResponse: string;
}

/**
 * Extract tables from AI response and save to storage + database
 */
export async function runExtractTablesJob(params: ExtractTablesParams): Promise<void> {
	const { superjournalId, userId, aiResponse } = params;
	const log = createLogger('ExtractTables', userId);
	const supabase = getSupabaseServiceRole();

	try {
		// 1. Extract markdown tables from response
		const tables = extractMarkdownTables(aiResponse);

		if (tables.length === 0) {
			log.info('No tables found in response', { superjournalId });
			return;
		}

		log.info('Found tables in response', { superjournalId, count: tables.length });

		// 2. Process each table
		const chartRecords: Array<{
			superjournal_id: string;
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
				const storagePath = `superjournal-charts/${userId}/${superjournalId}/table-${table.index}.svg`;
				const { error: svgUploadError } = await supabase.storage
					.from('canvas_gallery_content')
					.upload(storagePath, svgBuffer, {
						contentType: 'image/svg+xml',
						upsert: true
					});

				if (svgUploadError) {
					log.error('SVG upload failed', { table: table.index, error: svgUploadError.message });
					continue;
				}

				// Upload thumbnail to storage
				const thumbnailPath = `superjournal-thumbnails/${userId}/${superjournalId}/table-${table.index}.jpg`;
				const { error: thumbUploadError } = await supabase.storage
					.from('canvas_gallery_content')
					.upload(thumbnailPath, thumbnailBuffer, {
						contentType: 'image/jpeg',
						upsert: true
					});

				if (thumbUploadError) {
					log.error('Thumbnail upload failed', { table: table.index, error: thumbUploadError.message });
					continue;
				}

				chartRecords.push({
					superjournal_id: superjournalId,
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

		// 3. Insert records into database
		if (chartRecords.length > 0) {
			const { error: insertError } = await supabase
				.from('canvas_gallery_charts')
				.insert(chartRecords);

			if (insertError) {
				log.error('Failed to insert chart records', { error: insertError.message });
			} else {
				log.info('Saved table charts', { superjournalId, count: chartRecords.length });
			}
		}
	} catch (error) {
		log.error('Table extraction failed', {
			superjournalId,
			error: error instanceof Error ? error.message : 'Unknown'
		});
	}
}
