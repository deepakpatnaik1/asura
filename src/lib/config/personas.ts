/**
 * Persona Configuration
 *
 * Centralized constants for AI persona defaults and type definitions.
 */

/** Default persona for chat mode */
export const DEFAULT_PERSONA = 'gunnar' as const;

/** Default persona for reader mode */
export const DEFAULT_READER_PERSONA = 'samara' as const;

/** Default persona for todo mode */
export const DEFAULT_TODO_PERSONA = 'alicja' as const;

/** All available personas */
export const PERSONAS = ['gunnar', 'kirby', 'samara', 'alicja'] as const;

/** Personas available in chat mode */
export const CHAT_PERSONAS = ['gunnar', 'kirby'] as const;

/** Personas available in reader mode */
export const READER_PERSONAS = ['samara'] as const;

/** Personas available in todo mode */
export const TODO_PERSONAS = ['alicja'] as const;

/** TypeScript type for persona names */
export type PersonaName = (typeof PERSONAS)[number];
