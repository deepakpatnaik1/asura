/**
 * Update Chart Captions from AI Response
 *
 * Parses figure_captions from Samara's response and updates
 * charts records with meaningful captions.
 */

import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '$lib/api/logger';

let supabaseServiceRole: SupabaseClient | null = null;

function getSupabaseServiceRole(): SupabaseClient {
	if (!supabaseServiceRole) {
		supabaseServiceRole = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
	}
	return supabaseServiceRole;
}

export interface UpdateChartCaptionsParams {
	articleId: string;
	userId: string;
	aiResponse: string;
	chartCount: number;
}

/**
 * Parse figure captions from AI response
 * Expects format:
 * <figure_captions>
 * 1: Caption for figure 1
 * 2: Caption for figure 2
 * </figure_captions>
 */
function parseFigureCaptions(text: string): Map<number, string> {
	const captions = new Map<number, string>();

	// Extract content between <figure_captions> tags
	const match = text.match(/<figure_captions>([\s\S]*?)<\/figure_captions>/);
	if (!match) return captions;

	const captionBlock = match[1];
	const lines = captionBlock.split('\n');

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		// Match "N: caption text" format
		const captionMatch = trimmed.match(/^(\d+):\s*(.+)$/);
		if (captionMatch) {
			const index = parseInt(captionMatch[1], 10);
			const caption = captionMatch[2].trim();
			if (caption && caption.length > 0) {
				captions.set(index, caption);
			}
		}
	}

	return captions;
}

/**
 * Update charts with captions from AI response
 */
export async function updateChartCaptions(params: UpdateChartCaptionsParams): Promise<void> {
	const { articleId, userId, aiResponse, chartCount } = params;
	const log = createLogger('UpdateChartCaptions', userId);
	const supabase = getSupabaseServiceRole();

	try {
		// 1. Parse captions from response
		const captions = parseFigureCaptions(aiResponse);

		if (captions.size === 0) {
			log.info('No figure captions found in response', { articleId });
			console.log('[UpdateChartCaptions] No captions found. Response preview:', aiResponse.slice(-500));
			return;
		}

		log.info('Found figure captions', { articleId, count: captions.size, expected: chartCount });
		console.log('[UpdateChartCaptions] Parsed captions:', Object.fromEntries(captions));

		// 2. Fetch existing charts (only source charts, not summary-table-*)
		const { data: charts, error: fetchError } = await supabase
			.from('charts')
			.select('id, chart_index, storage_path')
			.eq('content_id', articleId)
			.eq('user_id', userId)
			.not('storage_path', 'like', '%summary-table%')
			.order('chart_index', { ascending: true });

		if (fetchError || !charts) {
			log.error('Failed to fetch charts', { error: fetchError?.message });
			return;
		}

		console.log('[UpdateChartCaptions] Found charts:', charts.map(c => ({ index: c.chart_index, path: c.storage_path })));

		// 3. Update each chart with its caption
		let updatedCount = 0;
		for (const chart of charts) {
			const caption = captions.get(chart.chart_index);
			console.log(`[UpdateChartCaptions] Chart ${chart.chart_index}: caption = ${caption ? 'found' : 'NOT FOUND'}`);
			if (caption) {
				const { error: updateError, data: updateResult } = await supabase
					.from('charts')
					.update({ alt_text: caption })
					.eq('id', chart.id)
					.select('id, chart_index, alt_text');

				if (updateError) {
					log.error('Failed to update chart caption', {
						chartIndex: chart.chart_index,
						error: updateError.message
					});
				} else {
					updatedCount++;
					console.log(`[UpdateChartCaptions] Updated chart ${chart.chart_index} (id=${chart.id})`);
					console.log(`[UpdateChartCaptions] Returned data:`, updateResult);
				}
			}
		}

		log.info('Updated chart captions', { articleId, updatedCount, totalCharts: charts.length });
	} catch (error) {
		log.error('Chart caption update failed', {
			articleId,
			error: error instanceof Error ? error.message : 'Unknown'
		});
	}
}
