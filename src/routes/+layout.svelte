<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { Icon } from 'svelte-icons-pack';
	import { LuMessageSquare, LuBook } from 'svelte-icons-pack/lu';

	let { children } = $props();

	onMount(() => {
		// Icon library initialization
	});
</script>

<div class="app-layout">
	<!-- Sidebar -->
	<aside class="sidebar">
		<div class="sidebar-icons">
			<button class="sidebar-icon" title="Chat">
				<Icon src={LuMessageSquare} size="18" />
			</button>
			<button class="sidebar-icon" title="E-Reader">
				<Icon src={LuBook} size="18" />
			</button>
		</div>
	</aside>

	<!-- Main content -->
	<div class="main-content">
		{@render children()}
	</div>
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
	}

	.sidebar-icon:hover {
		opacity: 1;
		border-color: var(--boss-accent);
		color: var(--boss-accent);
	}

	.main-content {
		width: 100vw;
		height: 100vh;
	}
</style>
