/**
 * Layout Configuration - Single Source of Truth
 *
 * All layout values for the entire app are defined here.
 * CSS variables, canvas config, and component styles all derive from this.
 *
 * Structure:
 * ┌──────────────────────────────────────────────────────────┐
 * │ sidebar │              main content area                 │
 * │  48px   │  ┌──────────────────────────────────────────┐  │
 * │         │  │         24px padding (top/left/right)    │  │
 * │         │  │  ┌────────────────────────────────────┐  │  │
 * │         │  │  │                                    │  │  │
 * │         │  │  │         content area               │  │  │
 * │         │  │  │                                    │  │  │
 * │         │  │  └────────────────────────────────────┘  │  │
 * │         │  │  ┌────────────────────────────────────┐  │  │
 * │         │  │  │     input bar / footer (100px)     │  │  │
 * │         │  │  └────────────────────────────────────┘  │  │
 * │         │  └──────────────────────────────────────────┘  │
 * └──────────────────────────────────────────────────────────┘
 */

// =============================================================================
// SOURCE VALUES - These are the fundamental measurements
// =============================================================================

export const LAYOUT = {
	/** Sidebar width (navigation icons) */
	sidebar: {
		width: 48
	},

	/** Base padding used throughout the app */
	padding: {
		base: 24
	},

	/** Input bar dimensions */
	inputBar: {
		/** Total height of the input bar */
		height: 100,
		/** Height of the icons row (send, attach, etc.) */
		iconsHeight: 19,
		/** Gap between icons and textarea */
		gap: 8,
		/** Min-height of the textarea */
		textareaHeight: 44
	},

	/** Border styling */
	border: {
		/** Opacity for subtle borders (dividers, panes) */
		opacity: 0.3
	}
} as const;

// =============================================================================
// DERIVED VALUES - Calculated from source values
// =============================================================================

export const DERIVED = {
	/** Content area height within input bar (icons + gap + textarea) */
	get inputBarContentHeight(): number {
		return LAYOUT.inputBar.iconsHeight + LAYOUT.inputBar.gap + LAYOUT.inputBar.textareaHeight; // 71
	},

	/** Vertical padding in input bar (top and bottom) */
	get inputBarVerticalPadding(): number {
		return (LAYOUT.inputBar.height - this.inputBarContentHeight) / 2; // 14.5
	}
} as const;

// =============================================================================
// CANVAS CONFIG - Uses layout values for canvas areas
// =============================================================================

export const CANVAS = {
	/** Frame padding (matches messages-area padding) */
	framePadding: LAYOUT.padding.base,

	/** Footer layout - mirrors input bar exactly */
	footer: {
		height: LAYOUT.inputBar.height,
		leftPadding: LAYOUT.padding.base,
		rightPadding: LAYOUT.padding.base,
		get topPadding(): number {
			return DERIVED.inputBarVerticalPadding;
		},
		get bottomPadding(): number {
			return DERIVED.inputBarVerticalPadding;
		},
		get contentHeight(): number {
			return DERIVED.inputBarContentHeight;
		}
	},

	/** Debug mode - colored backgrounds for layout verification */
	debug: {
		enabled: false,
		frameColor: 'red',
		footerColor: 'blue'
	}
} as const;

// =============================================================================
// CSS VARIABLE GENERATOR - For use in app.css or inline styles
// =============================================================================

export function getCSSVariables(): Record<string, string> {
	return {
		'--sidebar-width': `${LAYOUT.sidebar.width}px`,
		'--layout-padding': `${LAYOUT.padding.base}px`,
		'--input-bar-height': `${LAYOUT.inputBar.height}px`,
		'--input-bar-icons-height': `${LAYOUT.inputBar.iconsHeight}px`,
		'--input-bar-gap': `${LAYOUT.inputBar.gap}px`,
		'--input-bar-textarea-height': `${LAYOUT.inputBar.textareaHeight}px`,
		'--input-bar-content-height': `${DERIVED.inputBarContentHeight}px`,
		'--input-bar-vertical-padding': `${DERIVED.inputBarVerticalPadding}px`,
		'--border-opacity': `${LAYOUT.border.opacity}`
	};
}

// Type exports
export type Layout = typeof LAYOUT;
export type Derived = typeof DERIVED;
export type Canvas = typeof CANVAS;
