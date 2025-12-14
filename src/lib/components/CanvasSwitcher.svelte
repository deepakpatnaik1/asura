<script lang="ts">
	/**
	 * CanvasSwitcher - Vertical text tab stack for switching canvas types
	 *
	 * Positioned at the canvas column edge, aligned with the input bar.
	 * Active canvas shows mode accent color.
	 */

	import { CANVAS_TYPES, CANVAS_META, type CanvasType } from '$lib/config/canvases';
	import { getPersonaColor } from '$lib/config/personas';

	interface Props {
		persona: string;
		activeCanvas: CanvasType;
		onSelect: (canvas: CanvasType) => void;
	}

	let { persona, activeCanvas, onSelect }: Props = $props();

	// Get accent color from persona
	const accentColor = $derived(getPersonaColor(persona));
</script>

<div class="canvas-switcher">
	{#each CANVAS_TYPES as canvasType}
		<button
			class="switcher-btn"
			class:active={activeCanvas === canvasType}
			onclick={() => onSelect(canvasType)}
			style:--active-color={accentColor}
		>
			{CANVAS_META[canvasType].label}
		</button>
	{/each}
</div>

<style>
	.canvas-switcher {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 4px;
	}

	.switcher-btn {
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 4px 8px;
		border-radius: 4px;
		opacity: 0.5;
		transition: all 0.2s;
		font-size: 0.8em;
		text-align: left;
		white-space: nowrap;
	}

	.switcher-btn:hover {
		opacity: 0.8;
		background: hsl(var(--muted) / 0.3);
	}

	.switcher-btn.active {
		opacity: 1;
		color: var(--active-color);
	}
</style>
