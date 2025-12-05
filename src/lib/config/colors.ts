/**
 * Centralized color definitions for Asura
 *
 * These colors are the source of truth for accent colors across modes.
 * CSS variables in app.css should match these values.
 */

import type { Mode } from '$lib/config/modes';

// Chat mode (warm orange)
export const CHAT_ACCENT = 'rgb(217, 133, 107)';
export const CHAT_ACCENT_BG = 'rgba(217, 133, 107, 0.08)';

// Reader mode (emerald green)
export const READER_ACCENT = 'rgb(16, 185, 129)';
export const READER_ACCENT_BG = 'rgba(16, 185, 129, 0.08)';

// Work mode (electric blue)
export const TODO_ACCENT = 'rgb(59, 130, 246)';
export const TODO_ACCENT_BG = 'rgba(59, 130, 246, 0.08)';

// Shared colors
export const DIVIDER_COLOR = 'rgb(156, 163, 175)';

/**
 * Get accent color based on mode
 */
export function getAccentColor(mode: Mode): string {
	if (mode === 'chat') return CHAT_ACCENT;
	if (mode === 'reader') return READER_ACCENT;
	return TODO_ACCENT;
}

/**
 * Get accent background color based on mode
 */
export function getAccentBgColor(mode: Mode): string {
	if (mode === 'chat') return CHAT_ACCENT_BG;
	if (mode === 'reader') return READER_ACCENT_BG;
	return TODO_ACCENT_BG;
}
