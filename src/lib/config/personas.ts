/**
 * Persona Configuration
 *
 * Centralized config for all personas. Each persona defines:
 * - Visual identity (color)
 * - Model preference (null = use default)
 * - System prompt reference
 * - Context chunks to inject
 * - Compression behavior
 * - Available tools
 * - Default canvas
 */

// Context chunk types available for injection
export type ContextChunk =
	| 'working' // Last N turns (superjournal)
	| 'recent' // Compressed summaries (journal)
	| 'semantic' // Vector search results
	| 'canon' // is_canon = true files
	| 'active' // Currently selected file
	| 'todos' // Open + completed todos
	| 'diary' // Founder diary entries
	| 'tags' // Canonical tag list
	| 'calendar' // Google Calendar events
	| 'time'; // Current timestamp

// Canvas types
export type CanvasType = 'gallery' | 'calendar' | 'notes';

// Tool names available to personas
export type ToolName =
	// Todo tools
	| 'create_todo'
	| 'complete_todo'
	| 'update_todo'
	| 'push_todo'
	| 'delete_todo'
	| 'create_tag'
	// Diary tools
	| 'log_diary'
	| 'update_diary'
	| 'delete_diary'
	// Calendar tools
	| 'list_calendar_events'
	| 'create_calendar_event'
	| 'update_calendar_event'
	| 'delete_calendar_event'
	| 'check_calendar_availability';

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
	defaultCanvas: CanvasType;
}

/**
 * All context chunks - full access
 */
const ALL_CHUNKS: ContextChunk[] = [
	'working',
	'recent',
	'semantic',
	'canon',
	'active',
	'todos',
	'diary',
	'tags',
	'calendar',
	'time'
];

/**
 * All chunks except calendar
 */
const ALL_EXCEPT_CALENDAR: ContextChunk[] = ALL_CHUNKS.filter((c) => c !== 'calendar');

/**
 * Minimal chunks for stateless-ish personas
 */
const MINIMAL_CHUNKS: ContextChunk[] = ['working', 'canon', 'active'];

/**
 * All Alicja tools
 */
const ALICJA_TOOLS: ToolName[] = [
	'create_todo',
	'complete_todo',
	'update_todo',
	'push_todo',
	'delete_todo',
	'create_tag',
	'log_diary',
	'update_diary',
	'delete_diary',
	'list_calendar_events',
	'create_calendar_event',
	'update_calendar_event',
	'delete_calendar_event',
	'check_calendar_availability'
];

/**
 * Persona configurations
 */
export const PERSONAS: Record<string, Persona> = {
	gunnar: {
		name: 'gunnar',
		displayName: 'Gunnar',
		accentColor: 'rgb(217, 133, 107)', // warm orange
		model: null, // uses default, can be overridden in model_overrides
		systemPrompt: 'gunnar', // resolved via getSystemPrompt()
		contextChunks: ALL_CHUNKS,
		compression: true,
		tools: [],
		defaultCanvas: 'gallery'
	},
	kirby: {
		name: 'kirby',
		displayName: 'Kirby',
		accentColor: 'rgb(236, 72, 153)', // hot magenta
		model: null,
		systemPrompt: 'kirby',
		contextChunks: ALL_EXCEPT_CALENDAR,
		compression: true,
		tools: [],
		defaultCanvas: 'gallery'
	},
	samara: {
		name: 'samara',
		displayName: 'Samara',
		accentColor: 'rgb(16, 185, 129)', // emerald green
		model: null,
		systemPrompt: 'samara',
		contextChunks: MINIMAL_CHUNKS,
		compression: false, // Full article retention
		tools: [],
		defaultCanvas: 'gallery'
	},
	alicja: {
		name: 'alicja',
		displayName: 'Alicja',
		accentColor: 'rgb(59, 130, 246)', // electric blue
		model: null,
		systemPrompt: 'alicja',
		contextChunks: ALL_CHUNKS,
		compression: true,
		tools: ALICJA_TOOLS,
		defaultCanvas: 'calendar'
	}
};

/**
 * Persona names as const array for type safety
 */
export const PERSONA_NAMES = ['gunnar', 'kirby', 'samara', 'alicja'] as const;
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
 * Get default canvas for persona
 */
export function getPersonaDefaultCanvas(name: string): CanvasType {
	return PERSONAS[name]?.defaultCanvas ?? 'gallery';
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

// ============================================================================
// DEPRECATED - Backward compatibility for old mode-based code
// Remove after Chunk 3 (Single Route) deletes /chat, /reader, /todo routes
// ============================================================================

/** @deprecated Use DEFAULT_PERSONA instead */
export const DEFAULT_READER_PERSONA = 'samara' as const;

/** @deprecated Use DEFAULT_PERSONA instead */
export const DEFAULT_TODO_PERSONA = 'alicja' as const;

/** @deprecated Modes are being removed - use persona directly */
export const CHAT_PERSONAS = ['gunnar', 'kirby'] as const;

/** @deprecated Modes are being removed - use persona directly */
export const READER_PERSONAS = ['samara'] as const;

/** @deprecated Modes are being removed - use persona directly */
export const TODO_PERSONAS = ['alicja'] as const;
