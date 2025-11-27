import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createMessage, isAnthropicFileExpired } from '$lib/api/anthropic-client';
import { DEFAULT_READER_MODEL } from '$lib/config/models';
import { requireAuth } from '$lib/api/require-auth';
import { parseRequestJson } from '$lib/api/parse-json';
import { filterChartsSchema, validateSchema } from '$lib/schemas';

/**
 * Programmatic filter - identifies obvious ads/irrelevant images using alt text patterns
 * Returns true if image should be marked as irrelevant (filtered out)
 */
function isProgrammaticallyIrrelevant(altText: string): boolean {
	const lowerAlt = altText.toLowerCase().trim();

	// Pattern 1: Explicit ad/promotional keywords
	const adKeywords = [
		'ad',
		'advertisement',
		'banner',
		'sponsor',
		'promoted',
		'promo',
		'affiliate',
		'discount',
		'offer',
		'deal',
		'sale'
	];

	if (adKeywords.some((keyword) => lowerAlt.includes(keyword))) {
		return true;
	}

	// Pattern 2: Social media/sharing icons
	const socialKeywords = ['facebook', 'twitter', 'linkedin', 'instagram', 'share', 'follow'];
	if (socialKeywords.some((keyword) => lowerAlt.includes(keyword))) {
		return true;
	}

	// Pattern 3: Navigation/UI elements
	const uiKeywords = ['logo', 'icon', 'button', 'menu', 'arrow', 'close', 'search'];
	if (uiKeywords.some((keyword) => lowerAlt.includes(keyword))) {
		return true;
	}

	return false;
}

/**
 * Programmatic filter - identifies likely data visualizations using alt text patterns
 * Returns true if image is likely a chart/graph (keep it)
 */
function isProgrammaticallyRelevant(altText: string): boolean {
	const lowerAlt = altText.toLowerCase().trim();

	// Pattern 1: Explicit data visualization keywords
	const dataVizKeywords = [
		'chart',
		'graph',
		'figure',
		'table',
		'diagram',
		'plot',
		'visualization',
		'data',
		'metric',
		'trend',
		'statistic'
	];

	if (dataVizKeywords.some((keyword) => lowerAlt.includes(keyword))) {
		return true;
	}

	// Pattern 2: Common chart type keywords
	const chartTypes = [
		'bar chart',
		'line graph',
		'pie chart',
		'scatter plot',
		'histogram',
		'heatmap',
		'timeline'
	];

	if (chartTypes.some((type) => lowerAlt.includes(type))) {
		return true;
	}

	return false;
}

/**
 * AI filter - uses Claude to analyze ambiguous images
 */
async function filterChartsWithAI(
	charts: Array<{ chart_index: number; alt: string; anthropic_file_id: string }>,
	model: string
): Promise<{ relevant: number[]; irrelevant: number[] }> {
	// Build the content blocks with file attachments
	// Note: Files API file source type is in beta, SDK types don't include it yet
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const contentBlocks: any[] = [];

	// Add each chart PDF as a document block
	for (const chart of charts) {
		contentBlocks.push({
			type: 'document',
			source: {
				type: 'file',
				file_id: chart.anthropic_file_id
			}
		});
	}

	// Add the filtering instruction
	const chartList = charts
		.map((c) => `Chart ${c.chart_index}: alt="${c.alt || '(empty)'}"`)
		.join('\n');

	contentBlocks.push({
		type: 'text',
		text: `You are analyzing images from an article to identify which ones are data visualizations (charts, graphs, tables) vs. irrelevant/promotional content (ads, banners, decorative images).

Here are the charts to analyze:

${chartList}

For each chart, determine if it contains meaningful data visualization that would be useful for understanding the article content.

Respond with JSON only (no other text):
{
  "relevant": [list of chart_index numbers that are data visualizations],
  "irrelevant": [list of chart_index numbers that are ads/decorative/irrelevant]
}

Example:
{
  "relevant": [1, 3, 5],
  "irrelevant": [2, 4]
}`
	});

	// Call Claude with content blocks (including document attachments)
	const response = await createMessage({
		model,
		max_tokens: 1024,
		temperature: 0,
		system: 'You are a precise image classifier. Respond only with valid JSON.',
		messages: [
			{
				role: 'user',
				content: contentBlocks
			}
		]
	});

	// Parse JSON response (strip markdown code blocks if present)
	const textContent = response.content.find((block) => block.type === 'text');
	if (!textContent || textContent.type !== 'text') {
		throw new Error('No text content in AI response');
	}

	let jsonText = textContent.text.trim();
	// Strip markdown code blocks: ```json\n{...}\n```
	if (jsonText.startsWith('```')) {
		jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
	}

	const result = JSON.parse(jsonText);
	return {
		relevant: result.relevant || [],
		irrelevant: result.irrelevant || []
	};
}

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	// 2. PARSE AND VALIDATE REQUEST BODY
	const parseResult = await parseRequestJson<unknown>(request);
	if (!parseResult.success) return parseResult.error;

	const validation = validateSchema(filterChartsSchema, parseResult.data);
	if (!validation.success) return validation.error;

	const { article_id } = validation.data;

	try {
		// 3. READ SELECTED READER MODEL FROM USER_SETTINGS
		const { data: settings } = await supabase
			.from('user_settings')
			.select('selected_reader_model')
			.eq('user_id', userId)
			.single();

		const readerModel = settings?.selected_reader_model || DEFAULT_READER_MODEL;

		// 4. VERIFY ARTICLE OWNERSHIP
		const { data: article, error: fetchError } = await supabase
			.from('articles')
			.select('id, user_id, title')
			.eq('id', article_id)
			.single();

		if (fetchError || !article) {
			return json(
				{
					error: {
						message: 'Article not found or access denied',
						code: 'NOT_FOUND'
					}
				},
				{ status: 404 }
			);
		}

		// 4. FETCH ALL CHARTS FOR THIS ARTICLE (with user_id filter for defense-in-depth)
		const { data: charts, error: chartsError } = await supabase
			.from('article_charts')
			.select('id, chart_index, storage_path, alt_text, anthropic_file_id, anthropic_file_created_at')
			.eq('article_id', article_id)
			.eq('user_id', userId)
			.order('chart_index', { ascending: true });

		if (chartsError) {
			throw new Error(`Failed to fetch charts: ${chartsError.message}`);
		}

		if (!charts || charts.length === 0) {
			return json({
				success: true,
				article_id: article_id,
				total_charts: 0,
				programmatic_filtered: 0,
				ai_filtered: 0,
				relevant_charts: [],
				irrelevant_charts: []
			});
		}

		// 5. PROGRAMMATIC FILTER (FIRST PASS)
		const programmaticResults: Array<{
			chart_index: number;
			id: string;
			is_relevant: boolean;
			filter_reason: string;
		}> = [];

		const ambiguousCharts: Array<{
			chart_index: number;
			id: string;
			alt: string;
			anthropic_file_id: string;
		}> = [];

		for (const chart of charts) {
			const altText = chart.alt_text || '';

			if (isProgrammaticallyIrrelevant(altText)) {
				programmaticResults.push({
					chart_index: chart.chart_index,
					id: chart.id,
					is_relevant: false,
					filter_reason: 'programmatic_irrelevant'
				});
			} else if (isProgrammaticallyRelevant(altText)) {
				programmaticResults.push({
					chart_index: chart.chart_index,
					id: chart.id,
					is_relevant: true,
					filter_reason: 'programmatic_relevant'
				});
			} else {
				// Ambiguous - needs AI filter
				if (chart.anthropic_file_id && chart.anthropic_file_created_at) {
					// Check if file ID is expired
					const isExpired = isAnthropicFileExpired(chart.anthropic_file_created_at);

					if (isExpired) {
						programmaticResults.push({
							chart_index: chart.chart_index,
							id: chart.id,
							is_relevant: false,
							filter_reason: 'file_expired'
						});
					} else {
						ambiguousCharts.push({
							chart_index: chart.chart_index,
							id: chart.id,
							alt: altText,
							anthropic_file_id: chart.anthropic_file_id
						});
					}
				} else {
					// No file ID or no created_at timestamp - mark as irrelevant (can't analyze without PDF)
					programmaticResults.push({
						chart_index: chart.chart_index,
						id: chart.id,
						is_relevant: false,
						filter_reason: 'no_file_id'
					});
				}
			}
		}

		// 6. AI FILTER (SECOND PASS) - only on ambiguous charts with valid file IDs
		let aiResults: Array<{
			chart_index: number;
			id: string;
			is_relevant: boolean;
			filter_reason: string;
		}> = [];

		if (ambiguousCharts.length > 0) {
			try {
				const aiClassification = await filterChartsWithAI(ambiguousCharts, readerModel);

				// Map AI results back to chart IDs
				for (const chart of ambiguousCharts) {
					const isRelevant = aiClassification.relevant.includes(chart.chart_index);
					aiResults.push({
						chart_index: chart.chart_index,
						id: chart.id,
						is_relevant: isRelevant,
						filter_reason: isRelevant ? 'ai_relevant' : 'ai_irrelevant'
					});
				}
			} catch (error) {
				// Graceful degradation - mark ambiguous charts as relevant (show them to user)
				for (const chart of ambiguousCharts) {
					aiResults.push({
						chart_index: chart.chart_index,
						id: chart.id,
						is_relevant: true,
						filter_reason: 'ai_error_default_relevant'
					});
				}
			}
		}

		// 7. COMBINE RESULTS AND UPDATE DATABASE
		const allResults = [...programmaticResults, ...aiResults];

		for (const result of allResults) {
			const { error: updateError } = await supabase
				.from('article_charts')
				.update({
					is_relevant: result.is_relevant
				})
				.eq('id', result.id)
				.eq('user_id', userId); // Defense-in-depth: ensure user owns this chart

			if (updateError) {
				// Continue with other charts
			}
		}

		// 8. RETURN RESULTS
		const relevantCharts = allResults.filter((r) => r.is_relevant);
		const irrelevantCharts = allResults.filter((r) => !r.is_relevant);

		return json({
			success: true,
			article_id: article_id,
			total_charts: charts.length,
			programmatic_filtered: programmaticResults.length,
			ai_filtered: aiResults.length,
			relevant_charts: relevantCharts.map((r) => ({
				chart_index: r.chart_index,
				filter_reason: r.filter_reason
			})),
			irrelevant_charts: irrelevantCharts.map((r) => ({
				chart_index: r.chart_index,
				filter_reason: r.filter_reason
			}))
		});
	} catch (error) {
		return json(
			{
				error: {
					message: 'Chart filtering failed',
					code: 'FILTER_ERROR',
					details: error instanceof Error ? error.message : 'Unknown error'
				}
			},
			{ status: 500 }
		);
	}
};
