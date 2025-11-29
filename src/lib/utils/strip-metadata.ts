/**
 * Strip internal metadata from AI responses before display
 * Client-safe utilities (no server-only dependencies)
 */

/**
 * Strip figure_captions block from text (internal metadata, not for display)
 */
export function stripFigureCaptions(text: string): string {
	return text.replace(/<figure_captions>[\s\S]*?<\/figure_captions>/g, '').trim();
}
