<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { Icon } from 'svelte-icons-pack';
	import { LuCircle } from 'svelte-icons-pack/lu';

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

<span
	class="led-wrapper"
	class:healthy
	class:down={!healthy}
	title={healthy ? 'Server healthy' : 'Server down'}
>
	<Icon src={LuCircle} size="11" />
</span>

<style>
	.led-wrapper {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
	}

	.led-wrapper :global(svg) {
		fill: currentColor;
		stroke: none;
	}

	.led-wrapper.healthy {
		color: #22c55e;
		filter: drop-shadow(0 0 4px rgba(34, 197, 94, 0.7));
	}

	.led-wrapper.down {
		color: #ef4444;
		filter: drop-shadow(0 0 4px rgba(239, 68, 68, 0.7));
	}
</style>
