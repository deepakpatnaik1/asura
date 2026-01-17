<script lang="ts">
	/**
	 * Stage Manager Flash - "Boss, talk to Felix" notification
	 *
	 * A non-blocking visual alert that dims the screen when Felix
	 * has something that needs Boss's attention.
	 *
	 * UX Flow:
	 * 1. Flash appears and stays on (persistent)
	 * 2. Boss presses Escape to dismiss
	 * 3. If Boss doesn't talk to Felix within 4 hours, it re-appears
	 *
	 * State persisted in Supabase (survives browser refresh, app restart)
	 */

	import { onMount, onDestroy } from 'svelte';

	const REAPPEAR_DELAY_MS = 4 * 60 * 60 * 1000; // 4 hours

	let isActive = $state(false);
	let reappearTimeout: ReturnType<typeof setTimeout> | null = null;

	/** Show the flash notification (persists until Escape) */
	export function flash() {
		isActive = true;
		// Clear any pending re-appear timeout
		if (reappearTimeout) {
			clearTimeout(reappearTimeout);
			reappearTimeout = null;
		}
	}

	/** Dismiss the flash (called on Escape) */
	async function dismiss() {
		if (!isActive) return;
		isActive = false;

		// Record when dismissed in Supabase
		try {
			await fetch('/api/stage-manager', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'dismiss' })
			});
		} catch (err) {
			console.error('Failed to record dismiss:', err);
		}

		// Schedule re-appearance check in 4 hours
		scheduleReappearCheck();
	}

	/** Record that Boss talked to Felix */
	export async function recordTalkedToFelix() {
		try {
			await fetch('/api/stage-manager', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'talked' })
			});
		} catch (err) {
			console.error('Failed to record talked:', err);
		}

		// Clear any pending re-appear timeout since Boss just talked to Felix
		if (reappearTimeout) {
			clearTimeout(reappearTimeout);
			reappearTimeout = null;
		}
	}

	/** Schedule a single check after 4 hours */
	function scheduleReappearCheck() {
		if (reappearTimeout) clearTimeout(reappearTimeout);

		reappearTimeout = setTimeout(async () => {
			await checkShouldReappear();
		}, REAPPEAR_DELAY_MS);
	}

	/** Check if flash should re-appear (called after 4 hour timeout) */
	async function checkShouldReappear() {
		if (isActive) return; // Already showing

		try {
			const response = await fetch('/api/stage-manager');
			const state = await response.json();

			if (!state.flash_dismissed_at) return; // Never dismissed

			const dismissedTime = new Date(state.flash_dismissed_at).getTime();
			const lastTalkedTime = state.last_talked_to_felix_at
				? new Date(state.last_talked_to_felix_at).getTime()
				: 0;

			// If talked to Felix after dismissing, don't re-appear
			if (lastTalkedTime > dismissedTime) return;

			// 4 hours have passed (we're in the timeout callback), re-appear
			flash();
		} catch (err) {
			console.error('Failed to check stage manager state:', err);
		}
	}

	/** Check on mount if we need to schedule a re-appear or show immediately */
	async function initializeState() {
		try {
			const response = await fetch('/api/stage-manager');
			const state = await response.json();

			// Check if cron trigger found new starred emails
			if (state.should_show_flash) {
				console.log(`[Stage Manager] Showing flash - ${state.email_count} new emails found`);
				flash();
				return;
			}

			if (!state.flash_dismissed_at) return; // Never dismissed, nothing to do

			const dismissedTime = new Date(state.flash_dismissed_at).getTime();
			const lastTalkedTime = state.last_talked_to_felix_at
				? new Date(state.last_talked_to_felix_at).getTime()
				: 0;

			// If talked to Felix after dismissing, don't do anything
			if (lastTalkedTime > dismissedTime) return;

			// Check how long since dismissal
			const timeSinceDismissal = Date.now() - dismissedTime;

			if (timeSinceDismissal >= REAPPEAR_DELAY_MS) {
				// 4 hours already passed, show flash immediately
				flash();
			} else {
				// Schedule for remaining time
				const remainingTime = REAPPEAR_DELAY_MS - timeSinceDismissal;
				reappearTimeout = setTimeout(async () => {
					await checkShouldReappear();
				}, remainingTime);
			}
		} catch (err) {
			console.error('Failed to initialize stage manager state:', err);
		}
	}

	/** Handle keyboard events */
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && isActive) {
			event.preventDefault();
			event.stopPropagation();
			dismiss();
		}
	}

	onMount(() => {
		initializeState();
	});

	onDestroy(() => {
		if (reappearTimeout) clearTimeout(reappearTimeout);
	});

	// Expose functions globally
	if (typeof window !== 'undefined') {
		(window as any).stageManagerFlash = flash;
		(window as any).felixTalked = recordTalkedToFelix;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="border-flash" class:active={isActive}>
	<div class="border-flash-text">
		<div class="greeting">Boss,</div>
		<div class="body">Ping me when you have a minute.</div>
		<div class="signature">– Felix</div>
	</div>
</div>

<style>
	.border-flash {
		position: fixed;
		inset: 0;
		pointer-events: none;
		z-index: 99999;
		opacity: 0;
	}

	.border-flash.active {
		opacity: 1;
	}

	.border-flash::before {
		content: '';
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(6px);
	}



	.border-flash-text {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: hsl(var(--card));
		border: 2px solid hsl(var(--foreground) / 0.6);
		padding: 14px 24px;
		border-radius: 6px;
		font-family: "iA Writer Quattro V", system-ui, -apple-system, sans-serif;
		font-size: 8pt;
		color: hsl(var(--foreground));
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
		text-align: left;
	}

	.greeting {
		font-weight: 600;
		margin-bottom: 4px;
	}

	.body {
		padding-left: 16px;
		margin-bottom: 4px;
	}

	.signature {
		text-align: right;
	}
</style>
