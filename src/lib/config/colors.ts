/**
 * Centralized color definitions for Asura
 *
 * These colors are the source of truth for accent colors across modes.
 * CSS variables in app.css should match these values.
 */

// Chat mode (warm orange)
export const CHAT_ACCENT = 'rgb(217, 133, 107)';
export const CHAT_ACCENT_BG = 'rgba(217, 133, 107, 0.08)';

// Reader mode (emerald green)
export const READER_ACCENT = 'rgb(16, 185, 129)';
export const READER_ACCENT_BG = 'rgba(16, 185, 129, 0.08)';

// Shared colors
export const DIVIDER_COLOR = 'rgb(156, 163, 175)';

/**
 * Get accent color based on mode
 */
export function getAccentColor(mode: 'chat' | 'reader'): string {
	return mode === 'chat' ? CHAT_ACCENT : READER_ACCENT;
}

/**
 * Get accent background color based on mode
 */
export function getAccentBgColor(mode: 'chat' | 'reader'): string {
	return mode === 'chat' ? CHAT_ACCENT_BG : READER_ACCENT_BG;
}
