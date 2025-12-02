/**
 * Capabilities Index
 *
 * Central export for all pluggable capabilities.
 * Capabilities are features that can be enabled/disabled per mode.
 */

// Web Search
export {
	BRAVE_SEARCH_TOOL,
	executeBraveSearch,
	DEFAULT_WEB_SEARCH_CONFIG,
	type WebSearchConfig
} from './web-search';

// Context Injection
export {
	buildContext,
	DEFAULT_CONTEXT_INJECTION_CONFIG,
	BASIC_CONTEXT_INJECTION_CONFIG,
	type StructuredContext,
	type ContextInjectionLevel,
	type ContextInjectionConfig
} from './context-injection';

// File Reader
export {
	extractTitleFromHtml,
	validateHtmlSize,
	parseHtml,
	DEFAULT_FILE_READER_CONFIG,
	type FileReaderConfig,
	type ParsedHtmlResult
} from './file-reader';

/**
 * Capability registry type
 * Maps capability names to their enabled state
 */
export interface CapabilityRegistry {
	webSearch: boolean;
	contextInjection: 'rich' | 'basic' | 'none';
	compression: boolean;
	fileReading: boolean;
}
