<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { Icon } from 'svelte-icons-pack';
	import { LuMessageSquare, LuBook, LuLogOut, LuSettings } from 'svelte-icons-pack/lu';
	import SettingsModal from '$lib/components/SettingsModal.svelte';

	let { children } = $props();
	let showSettings = $state(false);

	// Logout handler (moved from +page.svelte)
	async function handleLogout() {
		try {
			const response = await fetch('/api/auth/logout', {
				method: 'POST'
			});

			if (response.ok || response.redirected) {
				// Redirect will be handled by the server
				window.location.href = '/login';
			} else {
				console.error('Logout failed:', response.statusText);
			}
		} catch (error) {
			console.error('Logout error:', error);
			// Still redirect to login page even if API fails
			window.location.href = '/login';
		}
	}

	onMount(() => {
		// Icon library initialization
	});
</script>

<div class="app-layout">
	<!-- Sidebar -->
	<aside class="sidebar">
		<div class="sidebar-icons">
			<a href="/chat" class="sidebar-icon" class:active={$page.url.pathname === '/chat'} title="Chat">
				<Icon src={LuMessageSquare} size="18" />
			</a>
			<a href="/reader" class="sidebar-icon" class:active={$page.url.pathname === '/reader'} title="E-Reader">
				<Icon src={LuBook} size="18" />
			</a>
		</div>
	</aside>

	<!-- User controls (top-right) -->
	<div class="user-controls">
		<button class="logout-btn" onclick={handleLogout} title="Sign out">
			<Icon src={LuLogOut} size="16" />
		</button>
	</div>

	<!-- Settings button (bottom-right) -->
	<button class="settings-btn-fixed" onclick={() => showSettings = true} title="Settings">
		<Icon src={LuSettings} size="16" />
	</button>

	<!-- Main content -->
	<div class="main-content">
		{@render children()}
	</div>

	<!-- Settings Modal (accessible from all routes) -->
	{#if showSettings}
		<SettingsModal bind:open={showSettings} onClose={() => showSettings = false} />
	{/if}
</div>

<style>
	.app-layout {
		display: flex;
		height: 100vh;
		width: 100vw;
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
		padding-top: 80vh;
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

	.main-content {
		width: 100vw;
		height: 100vh;
	}

	/* User controls (top-right) */
	.user-controls {
		position: fixed;
		top: 16px;
		right: 16px;
		z-index: 100;
	}

	.logout-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px;
		border-radius: 6px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		color: hsl(var(--foreground));
		cursor: pointer;
		transition: all 0.15s ease;
		opacity: 0.7;
	}

	.logout-btn:hover {
		opacity: 1;
		background: hsl(var(--accent));
		border-color: hsl(var(--accent-foreground));
	}

	/* Settings button (bottom-right) */
	.settings-btn-fixed {
		position: fixed;
		bottom: 16px;
		right: 16px;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.15s ease;
		z-index: 100;
		opacity: 0.7;
	}

	.settings-btn-fixed:hover {
		opacity: 1;
		background: hsl(var(--accent));
		border-color: hsl(var(--accent-foreground));
	}
</style>
