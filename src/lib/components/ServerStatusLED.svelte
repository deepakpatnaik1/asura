<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	const POLL_INTERVAL = 10000;
	const FAILURE_THRESHOLD = 3;
	const TIMEOUT = 10000;

	let healthy = $state(true);
	let consecutiveFailures = 0;
	let pollInterval: ReturnType<typeof setInterval> | null = null;

	async function checkHealth() {
		if (!browser) return;

		try {
			const res = await fetch('/api/health', {
				signal: AbortSignal.timeout(TIMEOUT)
			});

			if (res.ok) {
				consecutiveFailures = 0;
				healthy = true;
			} else {
				handleFailure();
			}
		} catch {
			handleFailure();
		}
	}

	function handleFailure() {
		consecutiveFailures++;
		if (consecutiveFailures >= FAILURE_THRESHOLD) {
			healthy = false;
		}
	}

	onMount(() => {
		checkHealth();
		pollInterval = setInterval(checkHealth, POLL_INTERVAL);
	});

	onDestroy(() => {
		if (pollInterval) {
			clearInterval(pollInterval);
		}
	});
</script>

<div
	class="led"
	class:healthy
	class:down={!healthy}
	title={healthy ? 'Server healthy' : 'Server down'}
></div>

<style>
	.led {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
		margin-left: 6px;
		position: relative;
		z-index: 1;
	}

	.led.healthy {
		background-color: #22c55e;
		box-shadow: 0 0 6px 2px rgba(34, 197, 94, 0.5);
	}

	.led.down {
		background-color: #ef4444;
		box-shadow: 0 0 6px 2px rgba(239, 68, 68, 0.5);
	}
</style>
