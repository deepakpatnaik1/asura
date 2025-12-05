/**
 * Canvas Layout Configuration
 *
 * Re-exports layout values from the centralized layout.ts config.
 * All canvases use CanvasFrame which reads from this config.
 *
 * @see src/lib/config/layout.ts - Single source of truth for all layout values
 */

import { CANVAS } from './layout';

// Re-export for backwards compatibility with existing canvas components
export const CANVAS_CONFIG = {
	framePadding: CANVAS.framePadding,
	footer: {
		height: CANVAS.footer.height,
		leftPadding: CANVAS.footer.leftPadding,
		rightPadding: CANVAS.footer.rightPadding,
		get contentHeight() {
			return CANVAS.footer.contentHeight;
		},
		get padding() {
			return CANVAS.footer.topPadding;
		}
	},
	debug: CANVAS.debug
} as const;

export type CanvasConfig = typeof CANVAS_CONFIG;

// Also re-export everything from layout for direct access
export { LAYOUT, DERIVED, CANVAS } from './layout';
