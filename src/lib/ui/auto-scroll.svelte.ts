/**
 * Auto-Scroll Module
 *
 * Shared auto-scroll behavior for chat mode and e-reader mode.
 * Uses CSS transforms for buttery smooth sub-pixel scrolling.
 */

import { type ScrollConfig, getContainer } from './scroll';

/** Scroll speed in pixels per millisecond (0.01 = ~10 px/second) */
const SCROLL_SPEED_PX_PER_MS = 0.01;

/** Default timer duration in minutes */
const DEFAULT_TIMER_MINUTES = 20;

export interface AutoScrollOptions {
	/** Function to get timer duration in minutes (for time-budget mode) */
	getTimerMinutes?: () => number;
}

export interface AutoScrollController {
	/** Whether auto-scroll is active */
	readonly isActive: boolean;

	/** Remaining time in seconds */
	readonly remainingSeconds: number;

	/** Formatted remaining time (H:MM:SS) */
	readonly remainingFormatted: string;

	/** Start auto-scroll */
	start: () => void;

	/** Stop auto-scroll (pauses timer, preserves remaining time) */
	stop: () => void;

	/** Toggle auto-scroll on/off */
	toggle: () => void;
}

/**
 * Create an auto-scroll controller for a container.
 * Uses CSS transforms for smooth sub-pixel scrolling.
 */
export function createAutoScroll(
	config: ScrollConfig,
	options: AutoScrollOptions = {}
): AutoScrollController {
	const { getTimerMinutes } = options;

	// Reactive state
	let isActive = $state(false);
	let remainingSeconds = $state(0);

	// Internal state (non-reactive)
	let lastFrameTime: number | null = null;
	let animationFrameId: number | null = null;
	let transformOffset = 0; // Sub-pixel precise scroll position
	let startScrollTop = 0; // Native scroll position when auto-scroll started

	// Format time as H:MM:SS
	function formatTime(totalSeconds: number): string {
		const hours = Math.floor(totalSeconds / 3600);
		const mins = Math.floor((totalSeconds % 3600) / 60);
		const secs = Math.floor(totalSeconds % 60);

		return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	}

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
		// Note: remainingSeconds is preserved for resume
	}

	function start() {
		const container = getContainer(config);
		if (!container) return;

		const content = getContentContainer(container);
		if (!content) return;

		// If no remaining time, initialize from settings
		if (remainingSeconds <= 0) {
			const minutes = getTimerMinutes?.() ?? DEFAULT_TIMER_MINUTES;
			remainingSeconds = minutes * 60;
		}

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
				remainingSeconds = 0;
				return;
			}

			// Calculate delta time
			if (lastFrameTime === null) {
				lastFrameTime = timestamp;
			}
			const deltaMs = timestamp - lastFrameTime;
			lastFrameTime = timestamp;

			// Update remaining time
			remainingSeconds = Math.max(0, remainingSeconds - deltaMs / 1000);

			// Check stop conditions
			const maxScroll = container.scrollHeight - container.clientHeight;
			const effectiveScroll = startScrollTop + transformOffset;

			// Stop if timer reached 0
			if (remainingSeconds <= 0) {
				stop();
				remainingSeconds = 0;
				return;
			}

			// Stop if at bottom (article ended)
			if (effectiveScroll >= maxScroll - 1) {
				stop();
				remainingSeconds = 0;
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
		get remainingSeconds() {
			return remainingSeconds;
		},
		get remainingFormatted() {
			return formatTime(remainingSeconds);
		},
		start,
		stop,
		toggle
	};
}
