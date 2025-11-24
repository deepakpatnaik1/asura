import { BRAVE_SEARCH_API_KEY } from '$env/static/private';
import type Anthropic from '@anthropic-ai/sdk';

/**
 * Brave Search API Client
 * Provides web search capabilities for Claude via Anthropic's tool use feature
 */

/**
 * Brave Search tool definition for Anthropic Messages API
 * This is the tool schema that Claude will see and can choose to use
 */
export const BRAVE_SEARCH_TOOL: Anthropic.Tool = {
	name: 'brave_search',
	description:
		'Search the web using Brave Search API. Use this when you need current information beyond your knowledge cutoff (January 2025) or when the article references recent events, data, companies, or technologies. Returns web results and news articles.',
	input_schema: {
		type: 'object',
		properties: {
			query: {
				type: 'string',
				description:
					'The search query. Be specific and use relevant keywords. Examples: "quantum computing advances 2025", "Tesla stock price", "latest AI regulations"'
			}
		},
		required: ['query']
	}
};

/**
 * Brave Search API response types
 */
interface BraveWebResult {
	title: string;
	url: string;
	description: string;
	age?: string; // e.g., "2 days ago"
}

interface BraveNewsResult {
	title: string;
	url: string;
	description: string;
	age?: string;
	source?: string; // e.g., "TechCrunch"
}

interface BraveSearchResponse {
	web?: {
		results: BraveWebResult[];
	};
	news?: {
		results: BraveNewsResult[];
	};
}

/**
 * Execute a Brave Search query
 * Returns top 5 web results + top 3 news results formatted for Claude
 *
 * @param query - Search query string
 * @returns Formatted search results as plain text, or null if search fails
 *
 * @example
 * const results = await executeBraveSearch("quantum computing 2025");
 * // Returns formatted text with web and news results
 */
export async function executeBraveSearch(query: string): Promise<string | null> {
	try {
		console.log(`[Brave Search] Executing search: "${query}"`);

		// Call Brave Search API
		const response = await fetch(
			`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`,
			{
				headers: {
					'X-Subscription-Token': BRAVE_SEARCH_API_KEY,
					Accept: 'application/json'
				}
			}
		);

		if (!response.ok) {
			console.error(`[Brave Search] API error: ${response.status} ${response.statusText}`);
			return null;
		}

		const data: BraveSearchResponse = await response.json();

		// Format results for Claude
		let formattedResults = `Search results for "${query}":\n\n`;

		// Add web results (top 5)
		if (data.web?.results && data.web.results.length > 0) {
			formattedResults += '## Web Results\n\n';
			const webResults = data.web.results.slice(0, 5);

			webResults.forEach((result, index) => {
				formattedResults += `${index + 1}. **${result.title}**\n`;
				formattedResults += `   URL: ${result.url}\n`;
				formattedResults += `   ${result.description}\n`;
				if (result.age) {
					formattedResults += `   Published: ${result.age}\n`;
				}
				formattedResults += '\n';
			});
		}

		// Add news results (top 3)
		if (data.news?.results && data.news.results.length > 0) {
			formattedResults += '## News Results\n\n';
			const newsResults = data.news.results.slice(0, 3);

			newsResults.forEach((result, index) => {
				formattedResults += `${index + 1}. **${result.title}**\n`;
				if (result.source) {
					formattedResults += `   Source: ${result.source}\n`;
				}
				formattedResults += `   URL: ${result.url}\n`;
				formattedResults += `   ${result.description}\n`;
				if (result.age) {
					formattedResults += `   Published: ${result.age}\n`;
				}
				formattedResults += '\n';
			});
		}

		// If no results found
		if (!data.web?.results?.length && !data.news?.results?.length) {
			formattedResults += 'No results found for this query.\n';
		}

		console.log(
			`[Brave Search] Found ${data.web?.results?.length || 0} web results, ${data.news?.results?.length || 0} news results`
		);

		return formattedResults;
	} catch (error) {
		console.error('[Brave Search] Error:', error);
		return null; // Graceful degradation - return null instead of throwing
	}
}
