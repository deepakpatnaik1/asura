<script lang="ts">
	import '../app.css';
	import { onMount, tick } from 'svelte';
	import { page } from '$app/stores';
	import { Icon } from 'svelte-icons-pack';
	import { LuMessageSquare, LuBook, LuLogOut, LuSettings, LuChevronDown, LuPlus, LuWifiOff } from 'svelte-icons-pack/lu';
	import SettingsModal from '$lib/components/SettingsModal.svelte';
	import ErrorBoundary from '$lib/components/ErrorBoundary.svelte';
	import { isConnected, initConnectivityListeners, cleanupConnectivityListeners } from '$lib/stores/connectivity';
	import { fetchWithRetry } from '$lib/utils/fetch-with-retry';

	let { children } = $props();
	let showSettings = $state(false);

	// Article pane state
	let isArticlePaneCollapsed = $state(false);

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
		<div class="sidebar-icons">
			<a href="/chat" class="sidebar-icon" class:active={$page.url.pathname === '/chat'} title="Chat">
				<Icon src={LuMessageSquare} size="18" />
			</a>
			<!-- Reader mode deleted, icon placeholder -->
			<span class="sidebar-icon disabled" title="E-Reader (coming soon)">
				<Icon src={LuBook} size="18" />
			</span>
		</div>
	</aside>
	{/if}

	<!-- Article Pane (Library) - Temporarily removed, will reposition later -->
	<!-- {#if $page.url.pathname === '/reader'}
		<aside class="article-pane" class:collapsed={isArticlePaneCollapsed}>
			<div class="article-pane-header">
				<button
					class="collapse-toggle"
					onclick={() => isArticlePaneCollapsed = !isArticlePaneCollapsed}
					title={isArticlePaneCollapsed ? 'Expand' : 'Collapse'}
				>
					<Icon src={LuChevronDown} size="20" class={isArticlePaneCollapsed ? 'rotate-left' : ''} />
				</button>
				{#if !isArticlePaneCollapsed}
					<span class="pane-title">Library</span>
				{/if}
			</div>

			{#if !isArticlePaneCollapsed}
				<div class="article-list">
				</div>
			{/if}

			{#if !isArticlePaneCollapsed}
				<button class="new-article-btn">
					<Icon src={LuPlus} size="16" />
					<span>New Article</span>
				</button>
			{/if}
		</aside>
	{/if} -->

	<!-- User controls (top-right, hidden on login) -->
	{#if !isLoginPage}
	<div class="user-controls">
		<button class="logout-btn" onclick={handleLogout} title="Sign out">
			<Icon src={LuLogOut} size="18" />
		</button>
	</div>

	<!-- Settings button (bottom-right) -->
	<button class="settings-btn-fixed" onclick={() => showSettings = true} title="Settings">
		<Icon src={LuSettings} size="18" />
	</button>
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
		<ErrorBoundary mode="chat">
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
		width: 60px;
		background: hsl(var(--background));
		border-right: 1px solid hsl(var(--border));
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-start;
		padding-top: 24px;
		z-index: 5;
	}

	.sidebar-icons {
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

	/* Active state - mode-specific colors */
	.sidebar-icon.active:nth-child(1) {
		/* Chat mode (first icon) */
		opacity: 1;
		color: var(--boss-accent);
	}

	.sidebar-icon.active:nth-child(2) {
		/* Reader mode (second icon) */
		opacity: 1;
		color: var(--reader-accent);
	}

	.sidebar-icon.disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.sidebar-icon.disabled:hover {
		opacity: 0.3;
		color: hsl(var(--foreground));
	}

	.main-content {
		width: 100vw;
		height: 100vh;
	}

	/* User controls (top-right) */
	.user-controls {
		position: fixed;
		top: 24px;
		right: 24px;
		z-index: 100;
	}

	.logout-btn {
		display: flex;
		align-items: center;
		padding: 4px;
		border: none;
		background: transparent;
		color: hsl(var(--foreground));
		cursor: pointer;
		transition: opacity 0.15s ease;
		opacity: 0.5;
	}

	.logout-btn:hover {
		opacity: 1;
	}

	/* Settings button (bottom-right) */
	.settings-btn-fixed {
		position: fixed;
		bottom: 24px;
		right: 24px;
		padding: 4px;
		border: none;
		background: transparent;
		color: hsl(var(--foreground));
		cursor: pointer;
		transition: opacity 0.15s ease;
		z-index: 100;
		opacity: 0.5;
	}

	.settings-btn-fixed:hover {
		opacity: 1;
	}

	/* Article Pane (Library) */
	.article-pane {
		position: fixed;
		left: 60px; /* Accounts for sidebar width */
		top: 0;
		bottom: 0;
		width: 240px;
		background: hsl(var(--card));
		border-right: 1px solid hsl(var(--border));
		display: flex;
		flex-direction: column;
		transition: width 0.3s ease;
		z-index: 5;
		overflow: hidden;
	}

	.article-pane.collapsed {
		width: 60px;
	}

	.article-pane-header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px;
		border-bottom: 1px solid hsl(var(--border));
	}

	.collapse-toggle {
		background: none;
		border: none;
		cursor: pointer;
		color: hsl(var(--foreground));
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		border-radius: 4px;
		transition: background 0.15s ease;
	}

	.collapse-toggle:hover {
		background: hsl(var(--accent));
	}

	.collapse-toggle :global(.rotate-left) {
		transform: rotate(-90deg);
	}

	.pane-title {
		font-size: 14px;
		font-weight: 600;
		color: hsl(var(--foreground));
		white-space: nowrap;
	}

	.article-list {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.article-card {
		padding: 12px;
		border-radius: 6px;
		border: 1px solid hsl(var(--border));
		cursor: pointer;
		transition: all 0.15s ease;
		background: hsl(var(--card));
	}

	.article-card:hover {
		background: hsl(var(--accent));
		border-color: hsl(var(--accent-foreground));
	}

	.article-card.selected {
		border-color: var(--reader-accent);
		background: var(--reader-bg);
	}

	.article-title {
		font-size: 13px;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin-bottom: 4px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.article-preview {
		font-size: 12px;
		color: hsl(var(--muted-foreground));
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.new-article-btn {
		margin: 8px;
		padding: 10px 16px;
		border-radius: 6px;
		border: 1px solid var(--reader-accent);
		background: var(--reader-bg);
		color: var(--reader-accent);
		font-size: 13px;
		font-weight: 600;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.new-article-btn:hover {
		background: var(--reader-accent);
		color: white;
	}

	/* Responsive: hide article pane on narrow screens */
	@media (max-width: 900px) {
		.article-pane {
			display: none;
		}
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
