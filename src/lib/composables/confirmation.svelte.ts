/**
 * Confirmation countdown composable.
 * Provides reactive state for destructive action confirmations.
 *
 * Usage:
 *   const confirm = createConfirmation();
 *   confirm.start('item-123', async () => { await deleteItem('item-123'); });
 *   // Access: confirm.isActive, confirm.targetId, confirm.progress
 */

import { TIMING } from '$lib/config/timing';

export interface ConfirmationState {
	readonly isActive: boolean;
	readonly targetId: string | null;
	readonly progress: number;
	start: (targetId: string, onConfirm: () => Promise<void> | void) => void;
	cancel: () => void;
}

/**
 * Create a reactive confirmation state.
 * Handles countdown timer and auto-confirm after duration.
 */
export function createConfirmation(duration: number = TIMING.countdownDuration): ConfirmationState {
	let isActive = $state(false);
	let targetId = $state<string | null>(null);
	let progress = $state(0);
	let timer: number | null = null;
	let pendingCallback: (() => Promise<void> | void) | null = null;

	function start(id: string, onConfirm: () => Promise<void> | void): void {
		// Reset state
		isActive = true;
		targetId = id;
		progress = 0;
		pendingCallback = onConfirm;

		// Clear any existing timer
		if (timer) {
			clearInterval(timer);
		}

		// Start countdown
		const interval = 50;
		const increment = (interval / duration) * 100;

		timer = window.setInterval(() => {
			progress += increment;
			if (progress >= 100) {
				confirm();
			}
		}, interval);
	}

	function cancel(): void {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
		isActive = false;
		targetId = null;
		progress = 0;
		pendingCallback = null;
	}

	async function confirm(): Promise<void> {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}

		const callback = pendingCallback;
		const id = targetId;

		// Reset state before callback (so UI updates)
		isActive = false;
		targetId = null;
		progress = 0;
		pendingCallback = null;

		// Execute callback
		if (callback && id) {
			try {
				await callback();
			} catch (err) {
				console.error('[Confirmation] Callback error:', err);
			}
		}
	}

	return {
		get isActive() {
			return isActive;
		},
		get targetId() {
			return targetId;
		},
		get progress() {
			return progress;
		},
		start,
		cancel
	};
}
