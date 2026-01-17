/**
 * Canvas Type Configuration
 *
 * Defines available canvas types for the multi-canvas workspace.
 * Each canvas type has a "soul" (core functionality) that persists
 * across modes, but takes on mode-specific styling and data sources.
 */

export const CANVAS_TYPES = ['carousel', 'notes', 'designer', 'calendar'] as const;
export type CanvasType = (typeof CANVAS_TYPES)[number];

export const DEFAULT_CANVAS: CanvasType = 'carousel';

/**
 * Default canvas for each persona
 */
export const PERSONA_DEFAULT_CANVAS: Record<string, CanvasType> = {
	gunnar: 'notes',
	kirby: 'notes',
	samara: 'carousel',
	eva: 'designer',
	ananya: 'carousel',
	felix: 'calendar'
};

/**
 * Get default canvas for a persona
 */
export function getDefaultCanvasForPersona(persona: string): CanvasType {
	return PERSONA_DEFAULT_CANVAS[persona] ?? DEFAULT_CANVAS;
}

/**
 * Canvas metadata for UI rendering
 */
export const CANVAS_META: Record<CanvasType, { icon: string; label: string; description: string }> = {
	carousel: {
		icon: 'LuLayoutGrid',
		label: 'Articles',
		description: 'Images and tables from articles'
	},
	calendar: {
		icon: 'LuCalendar',
		label: 'Calendar',
		description: 'Calendar, Todo, Done'
	},
	notes: {
		icon: 'LuStickyNote',
		label: 'Whiteboards',
		description: 'Visual whiteboard canvas'
	},
	designer: {
		icon: 'LuPalette',
		label: 'Designer',
		description: 'Character design canvas'
	}
};
