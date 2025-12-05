/**
 * Canvas Type Configuration
 *
 * Defines available canvas types for the multi-canvas workspace.
 * Each canvas type has a "soul" (core functionality) that persists
 * across modes, but takes on mode-specific styling and data sources.
 */

export const CANVAS_TYPES = ['carousel', 'calendar', 'notes'] as const;
export type CanvasType = (typeof CANVAS_TYPES)[number];

export const DEFAULT_CANVAS: CanvasType = 'carousel';

/**
 * Canvas metadata for UI rendering
 */
export const CANVAS_META: Record<CanvasType, { icon: string; label: string; description: string }> = {
	carousel: {
		icon: 'LuLayoutGrid',
		label: 'Gallery',
		description: 'Images and tables from content'
	},
	calendar: {
		icon: 'LuCalendar',
		label: 'Planner',
		description: 'Calendar, Todo, Done'
	},
	notes: {
		icon: 'LuStickyNote',
		label: 'Scratch',
		description: 'Markdown scratch pad'
	}
};
