<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	let healthy = $state(true);
	let eventSource: EventSource | null = null;

	function connect() {
		if (!browser) return;

		eventSource = new EventSource('/api/health/stream');

		eventSource.addEventListener('heartbeat', (event) => {
			const data = JSON.parse(event.data);
			// Green if server responds, even if DB is degraded
			// (server being alive is what matters for not losing messages)
			healthy = true;
		});

		eventSource.onerror = () => {
			// Connection dropped - server is dead
			healthy = false;

			// Close and attempt reconnect after a short delay
			eventSource?.close();
			setTimeout(connect, 2000);
		};
	}

	onMount(() => {
		connect();
	});

	onDestroy(() => {
		eventSource?.close();
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
