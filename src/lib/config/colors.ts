/**
 * Centralized color definitions for Asura
 *
 * Persona-driven colors are the source of truth.
 */

import { getPersonaColor as getPersonaColorFromConfig } from '$lib/config/personas';

// Shared colors
export const DIVIDER_COLOR = 'rgb(156, 163, 175)';
export const CODE_BLOCK_BG = 'rgba(0, 0, 0, 0.3)';
export const TABLE_BORDER = 'rgba(255, 255, 255, 0.1)';

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
