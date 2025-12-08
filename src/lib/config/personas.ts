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
 */

// Context chunk types available for injection
export type ContextChunk =
	| 'working' // Last N turns for THIS persona (superjournal, persona-filtered)
	| 'recent' // Compressed summaries (journal)
	| 'starred' // User's standing instructions (all personas should get this)
	| 'semantic' // Vector search results
	| 'canon' // is_canon = true files
	| 'active' // Currently selected file
	| 'todos' // Open + completed todos
	| 'diary' // Founder diary entries
	| 'tags' // Canonical tag list
	| 'calendar' // Google Calendar events (future)
	| 'time'; // Current timestamp (always injected, not toggleable)


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
}

/**
 * Gunnar: Full memory pyramid + productivity (no tags)
 */
const GUNNAR_CHUNKS: ContextChunk[] = [
	'working',
	'recent',
	'starred',
	'semantic',
	'canon',
	'active',
	'todos',
	'diary'
];

/**
 * Kirby: Full memory pyramid + diary for emotional context (no todos/tags)
 */
const KIRBY_CHUNKS: ContextChunk[] = [
	'working',
	'recent',
	'starred',
	'semantic',
	'canon',
	'active',
	'diary'
];

/**
 * Samara: Article-focused, no conversation memory (Wikipedia mode)
 */
const SAMARA_CHUNKS: ContextChunk[] = ['starred', 'canon', 'active'];

/**
 * Alicja: Scribe - productivity data + her own conversation memory
 */
const ALICJA_CHUNKS: ContextChunk[] = ['working', 'recent', 'starred', 'canon', 'todos', 'diary', 'tags', 'calendar'];

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
		contextChunks: GUNNAR_CHUNKS,
		compression: true,
		tools: []
	},
	kirby: {
		name: 'kirby',
		displayName: 'Kirby',
		accentColor: 'rgb(236, 72, 153)', // hot magenta
		model: null,
		systemPrompt: 'kirby',
		contextChunks: KIRBY_CHUNKS,
		compression: true,
		tools: []
	},
	samara: {
		name: 'samara',
		displayName: 'Samara',
		accentColor: 'rgb(16, 185, 129)', // emerald green
		model: null,
		systemPrompt: 'samara',
		contextChunks: SAMARA_CHUNKS,
		compression: false, // Tactical persona - no long-term memory needed
		tools: []
	},
	alicja: {
		name: 'alicja',
		displayName: 'Alicja',
		accentColor: 'rgb(59, 130, 246)', // electric blue
		model: null,
		systemPrompt: 'alicja',
		contextChunks: ALICJA_CHUNKS,
		compression: true, // Full memory of Alicja conversations
		tools: ALICJA_TOOLS
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
