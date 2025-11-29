/**
 * Extract Tables from Samara AI Response
 *
 * Background job that extracts markdown tables from reader Q&A responses,
 * renders them to SVG, uploads to storage, and saves to article_chat_charts.
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

export interface ExtractReaderTablesParams {
	articleChatId: string;
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
 * Extract tables from Samara response and save to storage + database
 */
export async function runExtractReaderTablesJob(params: ExtractReaderTablesParams): Promise<void> {
	const { articleChatId, userId, aiResponse } = params;
	const log = createLogger('ExtractReaderTables', userId);
	const supabase = getSupabaseServiceRole();

	try {
		// 1. Extract markdown tables from response
		const tables = extractMarkdownTables(aiResponse);

		if (tables.length === 0) {
			log.info('No tables found in response', { articleChatId });
			return;
		}

		log.info('Found tables in response', { articleChatId, count: tables.length });

		// 2. Process each table
		const chartRecords: Array<{
			article_chat_id: string;
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
				const storagePath = `article-chat-charts/${userId}/${articleChatId}/table-${table.index}.svg`;
				const { error: svgUploadError } = await supabase.storage
					.from('articles')
					.upload(storagePath, svgBuffer, {
						contentType: 'image/svg+xml',
						upsert: true
					});

				if (svgUploadError) {
					log.error('SVG upload failed', { table: table.index, error: svgUploadError.message });
					continue;
				}

				// Upload thumbnail to storage
				const thumbnailPath = `article-chat-thumbnails/${userId}/${articleChatId}/table-${table.index}.jpg`;
				const { error: thumbUploadError } = await supabase.storage
					.from('articles')
					.upload(thumbnailPath, thumbnailBuffer, {
						contentType: 'image/jpeg',
						upsert: true
					});

				if (thumbUploadError) {
					log.error('Thumbnail upload failed', { table: table.index, error: thumbUploadError.message });
					continue;
				}

				chartRecords.push({
					article_chat_id: articleChatId,
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
				.from('article_chat_charts')
				.insert(chartRecords);

			if (insertError) {
				log.error('Failed to insert chart records', { error: insertError.message });
			} else {
				log.info('Saved table charts', { articleChatId, count: chartRecords.length });
			}
		}
	} catch (error) {
		log.error('Table extraction failed', {
			articleChatId,
			error: error instanceof Error ? error.message : 'Unknown'
		});
	}
}
