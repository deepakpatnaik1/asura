/**
 * Centralized color definitions for Aether
 *
 * Persona-driven colors are the source of truth.
 */

import { getPersonaColor as getPersonaColorFromConfig } from '$lib/config/personas';

// Shared colors
export const DIVIDER_COLOR = 'rgb(156, 163, 175)';
export const CODE_BLOCK_BG = 'rgba(0, 0, 0, 0.3)';
export const TABLE_BORDER = 'rgba(255, 255, 255, 0.1)';

// Boss color - used for feedback callouts ([!review] or :::boss)
// Amber #F59E0B - distinct from all persona colors
export const BOSS_ACCENT = 'rgb(245, 158, 11)';
export const BOSS_ACCENT_BG = 'rgba(245, 158, 11, 0.08)';

// Red Claude color - used for :::red fenced containers
// Rose #F43F5E
export const RED_CLAUDE_ACCENT = 'rgb(244, 63, 94)';
export const RED_CLAUDE_ACCENT_BG = 'rgba(244, 63, 94, 0.08)';

// Blue Claude color - used for :::blue fenced containers
// Sky #0EA5E9
export const BLUE_CLAUDE_ACCENT = 'rgb(14, 165, 233)';
export const BLUE_CLAUDE_ACCENT_BG = 'rgba(14, 165, 233, 0.08)';

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
