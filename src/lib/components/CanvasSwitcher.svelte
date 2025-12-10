<script lang="ts">
	/**
	 * CanvasSwitcher - Vertical icon tab stack for switching canvas types
	 *
	 * Positioned at the canvas column edge, aligned with the input bar.
	 * Active canvas icon shows mode accent color.
	 */

	import { Icon } from 'svelte-icons-pack';
	import { LuLayoutGrid, LuCalendar, LuStickyNote, LuPalette } from 'svelte-icons-pack/lu';
	import { CANVAS_TYPES, CANVAS_META, type CanvasType } from '$lib/config/canvases';
	import { getPersonaColor } from '$lib/config/personas';

	interface Props {
		persona: string;
		activeCanvas: CanvasType;
		onSelect: (canvas: CanvasType) => void;
	}

	let { persona, activeCanvas, onSelect }: Props = $props();

	// Map icon names to components
	const ICON_MAP = {
		LuLayoutGrid,
		LuCalendar,
		LuStickyNote,
		LuPalette
	} as const;

	function getIcon(iconName: string) {
		return ICON_MAP[iconName as keyof typeof ICON_MAP] || LuLayoutGrid;
	}

	// Get accent color from persona
	const accentColor = $derived(getPersonaColor(persona));
</script>

<div class="canvas-switcher">
	{#each CANVAS_TYPES as canvasType}
		<button
			class="switcher-btn"
			class:active={activeCanvas === canvasType}
			title={CANVAS_META[canvasType].label}
			onclick={() => onSelect(canvasType)}
			style:--active-color={accentColor}
		>
			<Icon src={getIcon(CANVAS_META[canvasType].icon)} size="14" />
		</button>
	{/each}
</div>

<style>
	.canvas-switcher {
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 2px 4px;
	}

	.switcher-btn {
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 2px;
		border-radius: 4px;
		opacity: 0.5;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
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
