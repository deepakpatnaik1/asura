/**
 * System Prompts Index
 *
 * Central export file for all system prompts used in Aether.
 */

import { nowBerlinISO, toBerlinLocale } from '$lib/utils/timezone';

// Personas
export { PERSONA_GUNNAR } from './personas/gunnar';
export { PERSONA_KIRBY } from './personas/kirby';
export { PERSONA_SAMARA } from './personas/samara';
export { PERSONA_ALICJA } from './personas/alicja';
export { PERSONA_EVA } from './personas/eva';
export { PERSONA_ANANYA } from './personas/ananya';
export { PERSONA_FELIX } from './personas/felix';

import { PERSONA_GUNNAR } from './personas/gunnar';
import { PERSONA_KIRBY } from './personas/kirby';
import { PERSONA_SAMARA } from './personas/samara';
import { PERSONA_ALICJA } from './personas/alicja';
import { PERSONA_EVA } from './personas/eva';
import { PERSONA_ANANYA } from './personas/ananya';
import { PERSONA_FELIX } from './personas/felix';

/** Lookup map for persona prompts by name */
const PERSONA_PROMPTS: Record<string, string> = {
	gunnar: PERSONA_GUNNAR,
	kirby: PERSONA_KIRBY,
	samara: PERSONA_SAMARA,
	alicja: PERSONA_ALICJA,
	eva: PERSONA_EVA,
	ananya: PERSONA_ANANYA,
	felix: PERSONA_FELIX
};

/**
 * Format current time for Alicja/Felix's prompt
 * Human-readable with ISO for precision: "Sunday, December 7, 2025 at 3:45 PM (2025-12-07T15:45:00+01:00)"
 * IMPORTANT: Both parts must be Berlin time, not UTC!
 */
function formatCurrentTime(): string {
	const now = new Date();
	const human = toBerlinLocale(now, {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
	const iso = nowBerlinISO();
	return `${human} (${iso})`;
}

/** Get persona prompt by name, falls back to Gunnar if not found */
export function getPersonaPrompt(personaName: string): string {
	let prompt = PERSONA_PROMPTS[personaName] || PERSONA_GUNNAR;

	// Inject current time for productivity personas (Alicja, Felix)
	if (personaName === 'alicja' || personaName === 'felix') {
		prompt = prompt.replace('{{CURRENT_TIME}}', formatCurrentTime());
	}

	return prompt;
}

// Chat prompts
export { CONVERSE_PROMPT } from './converse';
export { COMPRESS_PROMPT } from './compress';
