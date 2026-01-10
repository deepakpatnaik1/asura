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

	// Press-and-hold state for continuous navigation
	let holdTimeout: ReturnType<typeof setTimeout> | null = null;
	let repeatInterval: ReturnType<typeof setInterval> | null = null;

	const HOLD_DELAY = 3000; // 3 seconds before continuous mode
	const REPEAT_INTERVAL = 400; // ms between repeats

	function startHold(direction: 'next' | 'prev') {
		// Single click action happens immediately
		if (direction === 'next') {
			scrollToNextTurn(config);
		} else {
			scrollToPreviousTurn(config);
		}

		// Start timer for continuous mode
		holdTimeout = setTimeout(() => {
			repeatInterval = setInterval(() => {
				if (direction === 'next') {
					scrollToNextTurn(config);
				} else {
					scrollToPreviousTurn(config);
				}
			}, REPEAT_INTERVAL);
		}, HOLD_DELAY);
	}

	function stopHold() {
		if (holdTimeout) {
			clearTimeout(holdTimeout);
			holdTimeout = null;
		}
		if (repeatInterval) {
			clearInterval(repeatInterval);
			repeatInterval = null;
		}
	}
</script>

<div class="scroll-controls">
	<button
		class="control-btn"
		class:active={autoScroll.isActive}
		title={autoScroll.isActive ? 'Stop auto-scroll' : 'Start auto-scroll'}
		onclick={autoScroll.toggle}
	>
		<Icon src={autoScroll.isActive ? LuPause : LuPlay} size="11" />
	</button>
	<button
		class="control-btn"
		title="Next turn (hold for continuous)"
		onmousedown={() => startHold('next')}
		onmouseup={stopHold}
		onmouseleave={stopHold}
	>
		<Icon src={LuArrowDown} size="11" />
	</button>
	<button
		class="control-btn"
		title="Previous turn (hold for continuous)"
		onmousedown={() => startHold('prev')}
		onmouseup={stopHold}
		onmouseleave={stopHold}
	>
		<Icon src={LuArrowUp} size="11" />
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
		color: var(--current-accent);
	}
</style>
