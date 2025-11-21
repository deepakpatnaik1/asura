/**
 * Persona Configuration
 *
 * Centralized constants for AI persona defaults and type definitions.
 */

/** Default persona for new users */
export const DEFAULT_PERSONA = 'gunnar' as const;

/** Available personas */
export const PERSONAS = ['gunnar', 'kirby'] as const;

/** TypeScript type for persona names */
export type PersonaName = (typeof PERSONAS)[number];
