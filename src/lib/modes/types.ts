/**
 * Mode configuration types.
 * Each mode (chat, reader, future modes) implements this interface.
 */

import type { ScrollConfig } from '$lib/ui/scroll';

export interface ModeCapabilities {
	/** Enable web search tool */
	webSearch: boolean;
	/** Context injection level: 'rich' = vector + superjournal, 'basic' = article only, 'none' = disabled */
	contextInjection: 'rich' | 'basic' | 'none';
	/** Enable artisan cut compression */
	compression: boolean;
	/** Enable file/article reading */
	fileReading: boolean;
}

export interface ModeConfig {
	/** Unique identifier */
	id: string;
	/** Display name */
	name: string;
	/** Route path (e.g., '/chat', '/reader') */
	route: string;
	/** Available persona IDs for this mode */
	personas: string[];
	/** Default persona when none selected */
	defaultPersona: string;
	/** Accent color CSS variable name */
	accentColor: string;
	/** Background color CSS variable name for boss cards */
	bgColor: string;
	/** Enabled capabilities */
	capabilities: ModeCapabilities;
	/** Primary API call identifier */
	primaryCall: string;
	/** Secondary API call identifier (optional) */
	secondaryCall?: string;
	/** Scroll configuration */
	scrollConfig: ScrollConfig;
}
