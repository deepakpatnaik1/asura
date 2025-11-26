/**
 * Auto-Scroll Module
 *
 * Shared auto-scroll behavior for chat mode and e-reader mode.
 * Uses CSS transforms for buttery smooth sub-pixel scrolling.
 */

import { type ScrollConfig, getContainer } from './scroll';

/** Scroll speed in pixels per millisecond (0.01 = ~10 px/second) */
const SCROLL_SPEED_PX_PER_MS = 0.01;

export interface AutoScrollController {
	/** Whether auto-scroll is active */
	readonly isActive: boolean;

	/** Start auto-scroll */
	start: () => void;

	/** Stop auto-scroll */
	stop: () => void;

	/** Toggle auto-scroll on/off */
	toggle: () => void;
}

/**
 * Create an auto-scroll controller for a container.
 * Uses CSS transforms for smooth sub-pixel scrolling.
 */
export function createAutoScroll(config: ScrollConfig): AutoScrollController {
	// Reactive state
	let isActive = $state(false);

	// Internal state (non-reactive)
	let lastFrameTime: number | null = null;
	let animationFrameId: number | null = null;
	let transformOffset = 0; // Sub-pixel precise scroll position
	let startScrollTop = 0; // Native scroll position when auto-scroll started

	function getContentContainer(container: HTMLElement): HTMLElement | null {
		return container.querySelector(config.contentSelector) as HTMLElement | null;
	}

	function stop() {
		const wasActive = isActive;
		isActive = false;
		lastFrameTime = null;

		if (animationFrameId !== null && typeof cancelAnimationFrame !== 'undefined') {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}

		// Sync transform back to native scroll
		if (wasActive) {
			const container = getContainer(config);
			const content = container ? getContentContainer(container) : null;
			if (container && content) {
				// Set final scroll position
				container.scrollTop = startScrollTop + transformOffset;
				// Remove transform
				content.style.transform = '';
				content.style.willChange = '';
			}
		}

		transformOffset = 0;
	}

	function start() {
		const container = getContainer(config);
		if (!container) return;

		const content = getContentContainer(container);
		if (!content) return;

		// Store starting scroll position
		startScrollTop = container.scrollTop;
		transformOffset = 0;

		// Prepare for GPU-accelerated transform
		content.style.willChange = 'transform';

		isActive = true;
		lastFrameTime = null;

		function tick(timestamp: DOMHighResTimeStamp) {
			if (!isActive) return;

			const container = getContainer(config);
			const content = container ? getContentContainer(container) : null;
			if (!container || !content) {
				stop();
				return;
			}

			// Calculate delta time
			if (lastFrameTime === null) {
				lastFrameTime = timestamp;
			}
			const deltaMs = timestamp - lastFrameTime;
			lastFrameTime = timestamp;

			// Check stop condition: at bottom (article ended)
			const maxScroll = container.scrollHeight - container.clientHeight;
			const effectiveScroll = startScrollTop + transformOffset;

			if (effectiveScroll >= maxScroll - 1) {
				stop();
				return;
			}

			// Update transform offset (sub-pixel precision)
			transformOffset += SCROLL_SPEED_PX_PER_MS * deltaMs;

			// Apply transform (GPU-accelerated, sub-pixel smooth)
			content.style.transform = `translateY(${-transformOffset}px)`;

			// Continue animation
			if (typeof requestAnimationFrame !== 'undefined') {
				animationFrameId = requestAnimationFrame(tick);
			}
		}

		if (typeof requestAnimationFrame !== 'undefined') {
			animationFrameId = requestAnimationFrame(tick);
		}
	}

	function toggle() {
		if (isActive) {
			stop();
		} else {
			start();
		}
	}

	return {
		get isActive() {
			return isActive;
		},
		start,
		stop,
		toggle
	};
}
