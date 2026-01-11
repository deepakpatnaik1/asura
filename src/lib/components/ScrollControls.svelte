<script lang="ts">
	import type { ScrollConfig } from '$lib/ui/scroll';
	import { scrollToNextTurn, scrollToPreviousTurn } from '$lib/ui/scroll';
	import { createAutoScroll } from '$lib/ui/auto-scroll.svelte';

	// Props
	let { config }: { config: ScrollConfig } = $props();

	// Auto-scroll controller (created once on mount)
	const autoScroll = createAutoScroll(config);
</script>

<div class="scroll-controls">
	<button
		class="control-btn"
		class:active={autoScroll.isActive}
		title={autoScroll.isActive ? 'Stop auto-scroll' : 'Start auto-scroll'}
		onclick={autoScroll.toggle}
	>
		{#if autoScroll.isActive}
			<!-- Pause icon -->
			<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
			</svg>
		{:else}
			<!-- Play icon -->
			<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polygon points="5 3 19 12 5 21 5 3"/>
			</svg>
		{/if}
	</button>
	<button
		class="control-btn"
		title="Next turn"
		onclick={() => scrollToNextTurn(config)}
	>
		<!-- ArrowDown icon -->
		<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>
		</svg>
	</button>
	<button
		class="control-btn"
		title="Previous turn"
		onclick={() => scrollToPreviousTurn(config)}
	>
		<!-- ArrowUp icon -->
		<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>
		</svg>
	</button>
</div>

<style>
	.scroll-controls {
		display: flex;
		align-items: center;
		gap: var(--action-icon-gap);
		transform: translateZ(0); /* Force GPU layer */
		will-change: contents;
	}

	.control-btn {
		background: transparent;
		border: none;
		cursor: pointer;
		opacity: 0.7;
		transition: opacity 0.2s;
		padding: 4px;
	}

	.control-btn:hover {
		opacity: 1;
	}

	.control-btn.active {
		opacity: 1;
		color: var(--current-accent);
	}

	.icon {
		width: 11px;
		height: 11px;
		display: block;
	}
</style>
