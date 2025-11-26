/**
 * Auto-Scroll Module
 *
 * Shared auto-scroll behavior for chat mode and e-reader mode.
 * Pattern: Pause 60s → Scroll 30s → Repeat until bottom reached.
 */

import { TIMING } from '$lib/config/timing';
import { type ScrollConfig, getContainer } from './scroll';

/** Scroll speed in pixels per animation frame */
const SCROLL_SPEED = 0.5;

export interface AutoScrollState {
	/** Whether auto-scroll is active (either scrolling or paused) */
	isActive: boolean;
	/** Whether currently in pause phase */
	isPaused: boolean;
	/** Progress through pause phase (0-1) */
	pauseProgress: number;
}

export interface AutoScrollController {
	/** Current state (reactive) */
	readonly isActive: boolean;
	readonly isPaused: boolean;
	readonly pauseProgress: number;

	/** Start auto-scroll (begins with pause phase) */
	start: () => void;

	/** Stop auto-scroll */
	stop: () => void;

	/** Toggle auto-scroll on/off */
	toggle: () => void;
}

/**
 * Create an auto-scroll controller for a container.
 * Returns reactive state and control methods.
 *
 * Usage in Svelte 5:
 * ```
 * let autoScroll = createAutoScroll(CHAT_CONFIG);
 *
 * // In template:
 * <button onclick={autoScroll.toggle} class:active={autoScroll.isActive}>
 * ```
 */
export function createAutoScroll(config: ScrollConfig): AutoScrollController {
	// Reactive state
	let isActive = $state(false);
	let isPaused = $state(false);
	let pauseProgress = $state(0);

	// Internal state
	let scrollAccumulator = 0;
	let pauseStartTime = 0;
	let scrollStartTime = 0;
	let animationFrameId: number | null = null;

	function stop() {
		isActive = false;
		isPaused = false;
		pauseProgress = 0;
		scrollAccumulator = 0;

		if (animationFrameId !== null && typeof cancelAnimationFrame !== 'undefined') {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
	}

	function start() {
		const container = getContainer(config);
		if (!container) return;

		// Start with pause phase
		isActive = true;
		isPaused = true;
		pauseProgress = 0;
		scrollAccumulator = 0;
		pauseStartTime = Date.now();
		scrollStartTime = Date.now();

		function tick() {
			if (!isActive) return;

			const container = getContainer(config);
			if (!container) {
				stop();
				return;
			}

			const maxScroll = container.scrollHeight - container.clientHeight;
			const currentScroll = container.scrollTop;

			// Check if at bottom
			if (currentScroll >= maxScroll - 1) {
				stop();
				return;
			}

			const now = Date.now();

			if (isPaused) {
				// Pause phase: update progress
				const pauseElapsed = now - pauseStartTime;
				pauseProgress = Math.min(1, pauseElapsed / TIMING.autoScrollPause);

				if (pauseElapsed >= TIMING.autoScrollPause) {
					// Switch to scroll phase
					isPaused = false;
					scrollStartTime = now;
					scrollAccumulator = 0;
				}
			} else {
				// Scroll phase
				const scrollElapsed = now - scrollStartTime;

				if (scrollElapsed < TIMING.autoScrollDuration) {
					// Accumulate and scroll
					scrollAccumulator += SCROLL_SPEED;
					const pixelsToScroll = Math.floor(scrollAccumulator);

					if (pixelsToScroll > 0) {
						container.scrollTop = currentScroll + pixelsToScroll;
						scrollAccumulator -= pixelsToScroll;
					}
				} else {
					// Switch back to pause phase
					isPaused = true;
					pauseStartTime = now;
					pauseProgress = 0;
					scrollAccumulator = 0;
				}
			}

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
		get isPaused() {
			return isPaused;
		},
		get pauseProgress() {
			return pauseProgress;
		},
		start,
		stop,
		toggle
	};
}
