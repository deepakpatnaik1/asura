<script lang="ts">
	import { Icon } from 'svelte-icons-pack';
	import { LuPlay, LuPause, LuArrowDown, LuArrowUp } from 'svelte-icons-pack/lu';
	import type { ScrollConfig } from '$lib/ui/scroll';
	import { scrollToNextTurn, scrollToPreviousTurn } from '$lib/ui/scroll';
	import { createAutoScroll } from '$lib/ui/auto-scroll.svelte';

	// Props
	let { config }: { config: ScrollConfig } = $props();

	// Auto-scroll controller
	const autoScroll = createAutoScroll(config);
</script>

<div class="scroll-controls">
	<button
		class="control-btn hit-target"
		class:active={autoScroll.isActive}
		title={autoScroll.isActive ? 'Stop auto-scroll' : 'Start auto-scroll'}
		onclick={autoScroll.toggle}
	>
		<Icon src={autoScroll.isActive ? LuPause : LuPlay} size="11" />
	</button>
	<button
		class="control-btn hit-target"
		title="Next turn"
		onclick={() => scrollToNextTurn(config)}
	>
		<Icon src={LuArrowDown} size="13" />
	</button>
	<button
		class="control-btn hit-target"
		title="Previous turn"
		onclick={() => scrollToPreviousTurn(config)}
	>
		<Icon src={LuArrowUp} size="13" />
	</button>
</div>

<style>
	.scroll-controls {
		display: flex;
		align-items: center;
		gap: var(--action-icon-gap);
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
		color: var(--boss-accent);
	}
</style>
