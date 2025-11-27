/**
 * Web Search Capability
 *
 * Provides web search functionality via Brave Search API.
 * Re-exports from the underlying brave-search API client.
 */

export { BRAVE_SEARCH_TOOL, executeBraveSearch } from '$lib/api/brave-search';

/**
 * Web search capability configuration
 */
export interface WebSearchConfig {
	/** Maximum web results to return */
	maxWebResults: number;
	/** Maximum news results to return */
	maxNewsResults: number;
}

export const DEFAULT_WEB_SEARCH_CONFIG: WebSearchConfig = {
	maxWebResults: 5,
	maxNewsResults: 3
};
