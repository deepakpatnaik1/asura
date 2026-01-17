/**
 * Persona Configuration
 *
 * Centralized config for all personas. Each persona defines:
 * - Visual identity (color from active palette)
 * - Model preference (null = use default)
 * - System prompt reference
 * - Context chunks to inject
 * - Compression behavior
 * - Available tools
 */

import { getPaletteColor } from './palettes';

// Context chunk types available for injection
export type ContextChunk =
	| 'working' // Last N turns for THIS persona (superjournal, persona-filtered)
	| 'recent' // Compressed summaries (journal)
	| 'starred' // User's standing instructions (all personas should get this)
	| 'semantic' // Vector search results
	| 'everyone' // owner = 'everyone' files (shared across all personas)
	| 'active' // Currently selected library items (content, whiteboards, canvases)
	| 'todos' // Open + completed todos
	| 'diary' // Founder diary entries
	| 'tags' // Canonical tag list
	| 'calendar' // Google Calendar events (future)
	| 'fitness' // Fitness/health log entries
	| 'subreddit_registry' // Top 5 lowest-score subreddits for rotation (Ananya)
	| 'time'; // Current timestamp (always injected, not toggleable)


// Tool names available to personas
export type ToolName =
	// Todo tools
	| 'create_todo'
	| 'complete_todo'
	| 'reopen_todo'
	| 'update_todo'
	| 'delete_todo'
	// Fitness tools
	| 'log_fitness'
	// Calendar tools
	| 'list_calendar_events'
	| 'create_calendar_event'
	| 'update_calendar_event'
	| 'delete_calendar_event'
	| 'check_calendar_availability'
	// Whiteboard tools (Gunnar)
	| 'create_whiteboard'
	| 'rename_whiteboard'
	| 'delete_whiteboard'
	| 'open_whiteboard'
	| 'list_whiteboards'
	| 'update_whiteboard'
	// Canvas tools (Eva)
	| 'create_canvas'
	| 'rename_canvas'
	| 'delete_canvas'
	| 'open_canvas'
	| 'close_canvas'
	| 'list_canvases'
	| 'update_canvas'
	| 'delete_element'
	// Character tools (Eva)
	| 'plan_character'
	| 'draw_character'
	// Image generation (Eva)
	| 'generate_image'
	| 'edit_image'
	// Reddit tools (Ananya)
	| 'fetch_reddit_thread'
	| 'fetch_subreddit_posts'
	| 'log_engagement'
	// Temporal tools (all personas)
	| 'temporal_calc'
	// Block tools (Felix) - presentation layer for todos
	| 'create_section'
	| 'create_note'
	| 'create_divider'
	| 'move_todo_to_section'
	| 'reorder_block'
	| 'update_section'
	| 'delete_block'
	| 'collapse_section'
	| 'expand_section'
	| 'list_todo_blocks'
	// Gmail tools (Felix) - email monitoring
	| 'scan_starred_emails'
	| 'list_gmail_accounts'
	| 'read_gmail_message'
	| 'list_pending_emails'
	| 'mark_email_addressed'
	// Scan tools (Felix) - paper mail scanning
	| 'scan_paper_folder'
	| 'list_pending_scans'
	| 'mark_scan_addressed'
	// Browser tools (Felix) - portal automation
	| 'browse_url'
	| 'browser_click'
	| 'browser_type'
	| 'browser_snapshot'
	| 'browser_close'
	| 'browser_login';

/**
 * Persona configuration interface
 */
export interface Persona {
	name: string;
	displayName: string;
	accentColor: string;
	model: string | null; // null = use default_model from user_settings
	systemPrompt: string; // import path reference, resolved at runtime
	contextChunks: ContextChunk[];
	compression: boolean;
	tools: ToolName[];
}

/**
 * Gunnar: Full memory pyramid (no productivity data - that's Felix's domain)
 */
const GUNNAR_CHUNKS: ContextChunk[] = [
	'working',
	'recent',
	'starred',
	'semantic',
	'everyone',
	'active'
];

/**
 * Kirby: Full memory pyramid
 */
const KIRBY_CHUNKS: ContextChunk[] = [
	'working',
	'recent',
	'starred',
	'semantic',
	'everyone',
	'active'
];

/**
 * Samara: Article-focused reader with conversation memory
 */
const SAMARA_CHUNKS: ContextChunk[] = ['working', 'recent', 'starred', 'semantic', 'everyone', 'active'];


/**
 * Gunnar whiteboard tools
 */
const GUNNAR_TOOLS: ToolName[] = [
	'create_whiteboard',
	'rename_whiteboard',
	'delete_whiteboard',
	'open_whiteboard',
	'list_whiteboards',
	'update_whiteboard',
	'temporal_calc'
];

/**
 * Eva: Character designer - minimal but not stateless
 */
const EVA_CHUNKS: ContextChunk[] = ['working', 'recent', 'starred', 'semantic', 'everyone', 'active'];

/**
 * Eva canvas tools (parallel to Gunnar's whiteboard tools)
 */
const EVA_TOOLS: ToolName[] = [
	'create_canvas',
	'rename_canvas',
	'delete_canvas',
	'open_canvas',
	'list_canvases',
	'update_canvas',
	'delete_element',
	'generate_image',
	'edit_image'
];

/**
 * Ananya: Reddit engagement
 * Includes 'everyone' content - she knows the product, trusts her not to leak
 * subreddit_registry - top 5 lowest-score subreddits for rotation
 */
const ANANYA_CHUNKS: ContextChunk[] = ['working', 'recent', 'starred', 'semantic', 'everyone', 'active', 'subreddit_registry'];

/**
 * Ananya tools: Reddit engagement + logging
 */
const ANANYA_TOOLS: ToolName[] = ['fetch_reddit_thread', 'fetch_subreddit_posts', 'log_engagement', 'temporal_calc'];


/**
 * Felix: Money to-dos persona - financial, bureaucratic, business admin
 */
const FELIX_CHUNKS: ContextChunk[] = ['working', 'recent', 'starred', 'semantic', 'everyone', 'active', 'todos', 'calendar'];

/**
 * Felix tools: Full productivity suite + Gmail, scans, browser
 */
const FELIX_TOOLS: ToolName[] = [
	// Todo data tools
	'create_todo',
	'complete_todo',
	'reopen_todo',
	'update_todo',
	'delete_todo',
	// Block presentation tools
	'create_section',
	'create_note',
	'create_divider',
	'move_todo_to_section',
	'reorder_block',
	'update_section',
	'delete_block',
	'collapse_section',
	'expand_section',
	'list_todo_blocks',
	// Gmail tools
	'scan_starred_emails',
	'list_gmail_accounts',
	'read_gmail_message',
	'list_pending_emails',
	'mark_email_addressed',
	// Scan tools (paper mail)
	'scan_paper_folder',
	'list_pending_scans',
	'mark_scan_addressed',
	// Browser tools
	'browse_url',
	'browser_click',
	'browser_type',
	'browser_snapshot',
	'browser_close',
	'browser_login',
	// Other tools
	'log_fitness',
	'list_calendar_events',
	'create_calendar_event',
	'update_calendar_event',
	'delete_calendar_event',
	'check_calendar_availability',
	'temporal_calc'
];

/**
 * Persona configurations
 */
export const PERSONAS: Record<string, Persona> = {
	gunnar: {
		name: 'gunnar',
		displayName: 'Gunnar',
		accentColor: getPaletteColor('gunnar'),
		model: null, // uses default, can be overridden in user_settings.model_gunnar
		systemPrompt: 'gunnar', // resolved via getSystemPrompt()
		contextChunks: GUNNAR_CHUNKS,
		compression: true,
		tools: GUNNAR_TOOLS
	},
	kirby: {
		name: 'kirby',
		displayName: 'Kirby',
		accentColor: getPaletteColor('kirby'),
		model: null,
		systemPrompt: 'kirby',
		contextChunks: KIRBY_CHUNKS,
		compression: true,
		tools: ['temporal_calc']
	},
	samara: {
		name: 'samara',
		displayName: 'Samara',
		accentColor: getPaletteColor('samara'),
		model: null,
		systemPrompt: 'samara',
		contextChunks: SAMARA_CHUNKS,
		compression: true, // All personas use compression
		tools: ['temporal_calc']
	},
	eva: {
		name: 'eva',
		displayName: 'Eva',
		accentColor: getPaletteColor('eva'),
		model: null,
		systemPrompt: 'eva',
		contextChunks: EVA_CHUNKS,
		compression: true,
		tools: ['create_canvas', 'rename_canvas', 'delete_canvas', 'open_canvas', 'close_canvas', 'list_canvases', 'update_canvas', 'delete_element', 'plan_character', 'draw_character', 'generate_image', 'edit_image', 'temporal_calc']
	},
	ananya: {
		name: 'ananya',
		displayName: 'Ananya',
		accentColor: getPaletteColor('ananya'),
		model: null,
		systemPrompt: 'ananya', // Reddit engagement manager
		contextChunks: ANANYA_CHUNKS,
		compression: true,
		tools: ANANYA_TOOLS
	},
	felix: {
		name: 'felix',
		displayName: 'Felix',
		accentColor: getPaletteColor('felix'),
		model: null, // Will use Grok 4.1 Fast once configured
		systemPrompt: 'felix', // Money to-dos persona
		contextChunks: FELIX_CHUNKS,
		compression: true,
		tools: FELIX_TOOLS
	},
	system: {
		name: 'system',
		displayName: 'System',
		accentColor: getPaletteColor('samara'), // Same color as Samara
		model: null,
		systemPrompt: 'samara', // Uses Samara's prompt for article handling
		contextChunks: [],
		compression: false,
		tools: []
	}
};

/**
 * Persona names as const array for type safety
 */
export const PERSONA_NAMES = ['gunnar', 'kirby', 'samara', 'eva', 'ananya', 'felix'] as const;
export type PersonaName = (typeof PERSONA_NAMES)[number];

/**
 * Default persona for new users
 */
export const DEFAULT_PERSONA: PersonaName = 'gunnar';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get persona config by name
 */
export function getPersona(name: string): Persona | undefined {
	return PERSONAS[name];
}

/**
 * Get persona config, throws if not found
 */
export function getPersonaOrThrow(name: string): Persona {
	const persona = PERSONAS[name];
	if (!persona) {
		throw new Error(`Unknown persona: ${name}`);
	}
	return persona;
}

/**
 * Get accent color for persona
 */
export function getPersonaColor(name: string): string {
	return PERSONAS[name]?.accentColor ?? PERSONAS.gunnar.accentColor;
}

/**
 * Get tools for persona
 */
export function getPersonaTools(name: string): ToolName[] {
	return PERSONAS[name]?.tools ?? [];
}

/**
 * Get context chunks for persona
 */
export function getPersonaContextChunks(name: string): ContextChunk[] {
	return PERSONAS[name]?.contextChunks ?? [];
}

/**
 * Check if persona uses compression
 */
export function personaUsesCompression(name: string): boolean {
	return PERSONAS[name]?.compression ?? true;
}

/**
 * Check if persona has a specific tool
 */
export function personaHasTool(personaName: string, toolName: ToolName): boolean {
	return PERSONAS[personaName]?.tools.includes(toolName) ?? false;
}

/**
 * Check if persona has a specific context chunk
 */
export function personaHasContextChunk(personaName: string, chunk: ContextChunk): boolean {
	return PERSONAS[personaName]?.contextChunks.includes(chunk) ?? false;
}

/**
 * Validate persona name
 */
export function isValidPersona(name: string): name is PersonaName {
	return name in PERSONAS;
}

