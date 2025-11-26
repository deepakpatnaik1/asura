/**
 * Auto-Scroll Module
 *
 * Shared auto-scroll behavior for chat mode and e-reader mode.
 * Supports two modes:
 * - Time-budget mode: countdown from fixed duration (e.g., 20 minutes)
 * - Distance mode: scroll until bottom reached (legacy behavior)
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
 *
 * Usage in Svelte 5:
 * ```
 * // Time-budget mode (reader)
 * const autoScroll = createAutoScroll(READER_CONFIG, {
 *   getTimerMinutes: () => readingTimerMinutes
 * });
 *
 * // In template:
 * <button onclick={autoScroll.toggle}>
 *   {autoScroll.isActive ? autoScroll.remainingFormatted : 'Play'}
 * </button>
 * ```
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
	let accumulatedScroll = 0; // Track sub-pixel scroll to avoid rounding issues

	// Format time as H:MM:SS
	function formatTime(totalSeconds: number): string {
		const hours = Math.floor(totalSeconds / 3600);
		const mins = Math.floor((totalSeconds % 3600) / 60);
		const secs = Math.floor(totalSeconds % 60);

		return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	}

	function stop() {
		isActive = false;
		lastFrameTime = null;

		if (animationFrameId !== null && typeof cancelAnimationFrame !== 'undefined') {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
		// Note: remainingSeconds is preserved for resume
	}

	function start() {
		const container = getContainer(config);
		if (!container) return;

		// If no remaining time, initialize from settings
		if (remainingSeconds <= 0) {
			const minutes = getTimerMinutes?.() ?? DEFAULT_TIMER_MINUTES;
			remainingSeconds = minutes * 60;
		}

		isActive = true;
		lastFrameTime = null;
		accumulatedScroll = 0;

		function tick(timestamp: DOMHighResTimeStamp) {
			if (!isActive) return;

			const container = getContainer(config);
			if (!container) {
				stop();
				remainingSeconds = 0; // Reset on error
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
			const currentScroll = container.scrollTop;

			// Stop if timer reached 0
			if (remainingSeconds <= 0) {
				stop();
				remainingSeconds = 0;
				return;
			}

			// Stop if at bottom (article ended)
			if (currentScroll >= maxScroll - 1) {
				stop();
				remainingSeconds = 0;
				return;
			}

			// Scroll - accumulate sub-pixels to avoid rounding issues
			accumulatedScroll += SCROLL_SPEED_PX_PER_MS * deltaMs;
			const wholePixels = Math.floor(accumulatedScroll);
			if (wholePixels >= 1) {
				container.scrollTop = currentScroll + wholePixels;
				accumulatedScroll -= wholePixels;
			}

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
