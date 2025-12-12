<script lang="ts">
	import '../app.css';
	import { onMount, tick } from 'svelte';
	import { page } from '$app/stores';
	import { Icon } from 'svelte-icons-pack';
	import { LuLogOut, LuSettings, LuWifiOff } from 'svelte-icons-pack/lu';
	import SettingsModal from '$lib/components/SettingsModal.svelte';
	import ErrorBoundary from '$lib/components/ErrorBoundary.svelte';
	import { isConnected, initConnectivityListeners, cleanupConnectivityListeners } from '$lib/stores/connectivity';
	import { fetchWithRetry } from '$lib/utils/fetch-with-retry';

	let { children } = $props();
	let showSettings = $state(false);

	// FOUC prevention
	let mounted = $state(false);

	// Check if current route is login page (hide chrome)
	let isLoginPage = $derived($page.url.pathname === '/login');

	// Logout handler (moved from +page.svelte)
	async function handleLogout() {
		try {
			const { response } = await fetchWithRetry('/api/auth/logout', {
				method: 'POST'
			}, { maxRetries: 2 });

			if (response.ok || response.redirected) {
				window.location.href = '/login';
			} else {
				// Still redirect even on error - session may already be invalid
				window.location.href = '/login';
			}
		} catch {
			// Still redirect to login page even if API fails
			window.location.href = '/login';
		}
	}

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
	<!-- Sidebar (hidden on login) -->
	{#if !isLoginPage}
	<aside class="sidebar">
		<div class="sidebar-bottom">
			<button class="sidebar-icon hit-target" onclick={() => showSettings = true} title="Settings">
				<Icon src={LuSettings} size="18" />
			</button>
			<button class="sidebar-icon hit-target" onclick={handleLogout} title="Sign out">
				<Icon src={LuLogOut} size="18" />
			</button>
		</div>
	</aside>
	{/if}

	<!-- Offline indicator -->
	{#if !$isConnected && !isLoginPage}
		<div class="offline-banner">
			<Icon src={LuWifiOff} size="14" />
			<span>You're offline</span>
		</div>
	{/if}

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
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		text-decoration: none;
	}

	.sidebar-icon:hover {
		opacity: 1;
		color: var(--boss-accent);
	}

	.main-content {
		width: 100vw;
		height: 100vh;
	}

	/* Offline banner */
	.offline-banner {
		position: fixed;
		top: 0;
		left: 50%;
		transform: translateX(-50%);
		background: hsl(var(--destructive));
		color: hsl(var(--destructive-foreground));
		padding: 8px 16px;
		border-radius: 0 0 8px 8px;
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: "iA Writer Quattro V", system-ui, -apple-system, sans-serif;
		font-size: 12px;
		font-weight: 500;
		z-index: 1000;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
	}
</style>
