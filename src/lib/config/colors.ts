/**
 * Centralized color definitions for Asura
 *
 * Persona-driven colors are the source of truth.
 * Mode-based functions are deprecated but kept for backward compatibility.
 */

import type { Mode } from '$lib/config/modes';
import { getPersonaColor as getPersonaColorFromConfig } from '$lib/config/personas';

// Persona colors (source of truth)
export const GUNNAR_ACCENT = 'rgb(217, 133, 107)';  // warm orange
export const KIRBY_ACCENT = 'rgb(236, 72, 153)';   // hot magenta
export const SAMARA_ACCENT = 'rgb(16, 185, 129)';  // emerald green
export const ALICJA_ACCENT = 'rgb(59, 130, 246)';  // electric blue

// Shared colors
export const DIVIDER_COLOR = 'rgb(156, 163, 175)';

/**
 * Get accent color for a persona
 */
export function getPersonaAccentColor(persona: string): string {
	return getPersonaColorFromConfig(persona);
}

/**
 * Get accent background color for a persona (8% opacity)
 */
export function getPersonaAccentBg(persona: string): string {
	const color = getPersonaColorFromConfig(persona);
	// Convert rgb(r, g, b) to rgba(r, g, b, 0.08)
	return color.replace('rgb(', 'rgba(').replace(')', ', 0.08)');
}

// ============================================================================
// DEPRECATED - Mode-based colors (remove after Chunk 3 cleanup)
// ============================================================================

/** @deprecated Use getPersonaAccentColor instead */
export const CHAT_ACCENT = GUNNAR_ACCENT;
/** @deprecated Use getPersonaAccentColor instead */
export const CHAT_ACCENT_BG = 'rgba(217, 133, 107, 0.08)';
/** @deprecated Use getPersonaAccentColor instead */
export const READER_ACCENT = SAMARA_ACCENT;
/** @deprecated Use getPersonaAccentColor instead */
export const READER_ACCENT_BG = 'rgba(16, 185, 129, 0.08)';
/** @deprecated Use getPersonaAccentColor instead */
export const TODO_ACCENT = ALICJA_ACCENT;
/** @deprecated Use getPersonaAccentColor instead */
export const TODO_ACCENT_BG = 'rgba(59, 130, 246, 0.08)';

/** @deprecated Use getPersonaAccentColor instead */
export function getAccentColor(mode: Mode): string {
	if (mode === 'chat') return CHAT_ACCENT;
	if (mode === 'reader') return READER_ACCENT;
	return TODO_ACCENT;
}

/** @deprecated Use getPersonaAccentBg instead */
export function getAccentBgColor(mode: Mode): string {
	if (mode === 'chat') return CHAT_ACCENT_BG;
	if (mode === 'reader') return READER_ACCENT_BG;
	return TODO_ACCENT_BG;
}
