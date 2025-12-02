/**
 * Context Injection Capability
 *
 * Builds rich context for AI calls using:
 * - Superjournal (recent full turns)
 * - Journal (compressed memories)
 * - Vector search (semantic retrieval)
 * - Starred messages
 * - Behavioral instructions
 *
 * Re-exports from the underlying context-builder module.
 */

export {
	buildContext,
	type StructuredContext
} from '$lib/context-builder';

/**
 * Context injection levels
 */
export type ContextInjectionLevel = 'rich' | 'basic' | 'none';

/**
 * Context injection configuration
 */
export interface ContextInjectionConfig {
	/** Injection level */
	level: ContextInjectionLevel;
	/** Enable vector search for semantic retrieval */
	enableVectorSearch: boolean;
	/** Include starred messages */
	includeStarred: boolean;
	/** Include behavioral instructions */
	includeInstructions: boolean;
}

export const DEFAULT_CONTEXT_INJECTION_CONFIG: ContextInjectionConfig = {
	level: 'rich',
	enableVectorSearch: true,
	includeStarred: true,
	includeInstructions: true
};

/**
 * Basic context injection (article only, no memory)
 */
export const BASIC_CONTEXT_INJECTION_CONFIG: ContextInjectionConfig = {
	level: 'basic',
	enableVectorSearch: false,
	includeStarred: false,
	includeInstructions: false
};
