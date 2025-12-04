/**
 * System Prompts Index
 *
 * Central export file for all system prompts used in Asura.
 */

// Personas
export { PERSONA_GUNNAR } from './personas/gunnar';
export { PERSONA_KIRBY } from './personas/kirby';
export { PERSONA_SAMARA } from './personas/samara';
export { PERSONA_ALICJA } from './personas/alicja';

import { PERSONA_GUNNAR } from './personas/gunnar';
import { PERSONA_KIRBY } from './personas/kirby';
import { PERSONA_SAMARA } from './personas/samara';
import { PERSONA_ALICJA } from './personas/alicja';

/** Lookup map for persona prompts by name */
const PERSONA_PROMPTS: Record<string, string> = {
	gunnar: PERSONA_GUNNAR,
	kirby: PERSONA_KIRBY,
	samara: PERSONA_SAMARA,
	alicja: PERSONA_ALICJA
};

/** Get persona prompt by name, falls back to Gunnar if not found */
export function getPersonaPrompt(personaName: string): string {
	return PERSONA_PROMPTS[personaName] || PERSONA_GUNNAR;
}

// Chat prompts
export { CONVERSE_PROMPT } from './converse';
export { COMPRESS_PROMPT } from './compress';
