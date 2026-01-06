<script lang="ts">
	import '../app.css';
	import { onMount, tick } from 'svelte';
	import { Icon } from 'svelte-icons-pack';
	import { LuSettings } from 'svelte-icons-pack/lu';
	import SettingsModal from '$lib/components/SettingsModal.svelte';
	import ErrorBoundary from '$lib/components/ErrorBoundary.svelte';
	import { initConnectivityListeners, cleanupConnectivityListeners } from '$lib/stores/connectivity';

	let { children } = $props();
	let showSettings = $state(false);

	// FOUC prevention
	let mounted = $state(false);

	onMount(() => {
		// Initialize connectivity listeners
		initConnectivityListeners();

		// Trigger mounted state for CSS transition (prevents FOUC)
		tick().then(() => { mounted = true; });

		// Cleanup on unmount
		return () => {
			cleanupConnectivityListeners();
		};
	});
</script>

<div class="app-layout" class:mounted={mounted}>
	<!-- Sidebar -->
	<aside class="sidebar">
		<div class="sidebar-bottom">
			<button class="sidebar-icon hit-target" onclick={() => showSettings = true} title="Settings">
				<Icon src={LuSettings} size="18" />
			</button>
		</div>
	</aside>

	<!-- Main content -->
	<div class="main-content">
		<ErrorBoundary>
			{@render children()}
		</ErrorBoundary>
	</div>

	<!-- Settings Modal (accessible from all routes) -->
	{#if showSettings}
		<SettingsModal bind:open={showSettings} onClose={() => showSettings = false} />
	{/if}
</div>

<style>
	/* FOUC Prevention */
	.app-layout {
		opacity: 0;
		transition: opacity 0.15s ease;
		display: flex;
		height: 100vh;
		width: 100vw;
	}

	.app-layout.mounted {
		opacity: 1;
	}

	.sidebar {
		position: fixed;
		left: 0;
		top: 0;
		bottom: 0;
		width: var(--sidebar-width);
		background: hsl(var(--background));
		border-right: 1px solid hsl(var(--border));
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-end;
		padding: var(--layout-padding) 0;
		z-index: 5;
	}

	.sidebar-bottom {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.sidebar-icon {
		background: transparent;
		border: none;
		color: hsl(var(--foreground));
		cursor: pointer;
		padding: 4px;
		opacity: 0.7;
		transition: opacity 0.2s, color 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		text-decoration: none;
		width: 26px;
		height: 26px;
		transform: translateZ(0);
		backface-visibility: hidden;
	}

	.sidebar-icon:hover {
		opacity: 1;
		color: var(--boss-accent);
	}

	.sidebar-icon :global(svg) {
		flex-shrink: 0;
	}

	.main-content {
		width: 100vw;
		height: 100vh;
	}

</style>
