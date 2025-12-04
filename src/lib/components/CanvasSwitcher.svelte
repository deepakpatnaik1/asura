<script lang="ts">
	/**
	 * CanvasSwitcher - Vertical icon tab stack for switching canvas types
	 *
	 * Positioned at the canvas column edge, aligned with the input bar.
	 * Active canvas icon shows mode accent color.
	 */

	import { Icon } from 'svelte-icons-pack';
	import { LuLayoutGrid, LuCalendar, LuStickyNote } from 'svelte-icons-pack/lu';
	import { CANVAS_TYPES, CANVAS_META, type CanvasType } from '$lib/config/canvases';
	import type { Mode } from '$lib/config/modes';

	interface Props {
		mode: Mode;
		activeCanvas: CanvasType;
		onSelect: (canvas: CanvasType) => void;
	}

	let { mode, activeCanvas, onSelect }: Props = $props();

	// Map icon names to components
	const ICON_MAP = {
		LuLayoutGrid,
		LuCalendar,
		LuStickyNote
	} as const;

	function getIcon(iconName: string) {
		return ICON_MAP[iconName as keyof typeof ICON_MAP] || LuLayoutGrid;
	}

	function getModeAccentVar(mode: Mode): string {
		switch (mode) {
			case 'chat':
				return 'var(--boss-accent)';
			case 'reader':
				return 'var(--reader-accent)';
			case 'todo':
				return 'var(--todo-accent)';
			default:
				return 'var(--boss-accent)';
		}
	}
</script>

<div class="canvas-switcher">
	{#each CANVAS_TYPES as canvasType}
		<button
			class="switcher-btn"
			class:active={activeCanvas === canvasType}
			title={CANVAS_META[canvasType].label}
			onclick={() => onSelect(canvasType)}
			style:--active-color={getModeAccentVar(mode)}
		>
			<Icon src={getIcon(CANVAS_META[canvasType].icon)} size="14" />
		</button>
	{/each}
</div>

<style>
	.canvas-switcher {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px 4px;
	}

	.switcher-btn {
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 6px;
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
