<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	const POLL_INTERVAL = 3000;
	const FAILURE_THRESHOLD = 2; // consecutive failures before showing "down"

	type Status = 'ready' | 'restarting' | 'no-sidecar' | 'down';

	let status: Status = $state('no-sidecar');
	let hasSidecar = $state(false);
	let consecutiveFailures = 0;
	let pollInterval: ReturnType<typeof setInterval> | null = null;

	async function checkStatus() {
		if (!browser) return;

		try {
			const res = await fetch('/api/dev/status', {
				signal: AbortSignal.timeout(2000)
			});

			if (!res.ok) {
				handleFailure();
				return;
			}

			const data = await res.json();

			// Reset failure counter on success
			consecutiveFailures = 0;
			hasSidecar = data.sidecar;

			if (!data.sidecar) {
				// No sidecar running - user is using npm run dev
				status = 'no-sidecar';
			} else if (data.ready) {
				status = 'ready';
			} else if (data.running) {
				status = 'restarting';
			} else {
				status = 'down';
			}
		} catch {
			handleFailure();
		}
	}

	function handleFailure() {
		consecutiveFailures++;
		if (consecutiveFailures >= FAILURE_THRESHOLD) {
			status = 'down';
		}
	}

	async function handleClick() {
		if (!hasSidecar) return;

		status = 'restarting';

		try {
			const res = await fetch('/api/dev/status', {
				method: 'POST',
				signal: AbortSignal.timeout(60000)
			});
			const data = await res.json();

			if (data.ready) {
				status = 'ready';
				window.location.reload();
			} else {
				status = 'down';
			}
		} catch {
			status = 'down';
		}
	}

	function getTitle(): string {
		switch (status) {
			case 'ready':
				return 'Server ready (click to restart)';
			case 'restarting':
				return 'Restarting...';
			case 'no-sidecar':
				return 'Dev server running (use npm run dev:restart for restart capability)';
			case 'down':
				return 'Server down';
		}
	}

	onMount(() => {
		checkStatus();
		pollInterval = setInterval(checkStatus, POLL_INTERVAL);
	});

	onDestroy(() => {
		if (pollInterval) {
			clearInterval(pollInterval);
		}
	});
</script>

{#if hasSidecar}
	<button
		class="led"
		class:ready={status === 'ready'}
		class:restarting={status === 'restarting'}
		class:down={status === 'down'}
		onclick={handleClick}
		title={getTitle()}
	></button>
{:else}
	<div
		class="led no-sidecar"
		title={getTitle()}
	></div>
{/if}

<style>
	.led {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
		position: relative;
		z-index: 1;
		border: none;
		margin-left: 6px;
	}

	button.led {
		cursor: pointer;
	}

	.led.ready {
		background-color: #22c55e;
		box-shadow: 0 0 6px 2px rgba(34, 197, 94, 0.5);
	}

	.led.restarting {
		background-color: #f59e0b;
		animation: blink 0.5s ease-in-out infinite;
	}

	.led.down {
		background-color: #ef4444;
		box-shadow: 0 0 6px 2px rgba(239, 68, 68, 0.5);
	}

	.led.no-sidecar {
		background-color: #22c55e;
		box-shadow: 0 0 6px 2px rgba(34, 197, 94, 0.5);
	}

	@keyframes blink {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.3; }
	}
</style>
