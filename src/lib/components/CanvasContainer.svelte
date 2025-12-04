<script lang="ts">
	/**
	 * CanvasContainer - Multi-canvas workspace container
	 *
	 * Wraps canvas content with a vertical icon tab switcher.
	 * Manages active canvas state per mode (localStorage).
	 * Passes mode-specific props to child canvas components.
	 */

	import { DEFAULT_CANVAS, type CanvasType } from '$lib/config/canvases';
	import type { Mode } from '$lib/config/modes';
	import CanvasSwitcher from './CanvasSwitcher.svelte';
	import ChartCarousel from './ChartCarousel.svelte';
	import CalendarCanvas from './canvases/CalendarCanvas.svelte';
	import NotesCanvas from './canvases/NotesCanvas.svelte';

	// Chart type for carousel canvas
	interface Chart {
		id: string;
		thumbnail_url: string;
		full_url: string;
		alt: string;
	}

	interface Props {
		mode: Mode;
		// Carousel-specific props (passed through when carousel is active)
		charts?: Chart[];
		selectedChartIndex?: number | null;
		showLightbox?: boolean;
		enableDelete?: boolean;
		onDelete?: (chartId: string) => void;
	}

	let {
		mode,
		charts = [],
		selectedChartIndex = $bindable(null),
		showLightbox = $bindable(false),
		enableDelete = false,
		onDelete
	}: Props = $props();

	let activeCanvas = $state<CanvasType>(DEFAULT_CANVAS);

	// Load active canvas from localStorage when mode changes
	$effect(() => {
		const stored = localStorage.getItem(`asura_canvas_${mode}`);
		if (stored && ['carousel', 'calendar', 'notes'].includes(stored)) {
			activeCanvas = stored as CanvasType;
		} else {
			activeCanvas = DEFAULT_CANVAS;
		}
	});

	function handleCanvasSelect(canvas: CanvasType) {
		activeCanvas = canvas;
		localStorage.setItem(`asura_canvas_${mode}`, canvas);
	}
</script>

<div class="canvas-container">
	<div class="canvas-content">
		{#if activeCanvas === 'carousel'}
			<ChartCarousel
				{charts}
				bind:selectedChartIndex
				bind:showLightbox
				{enableDelete}
				{onDelete}
			/>
		{:else if activeCanvas === 'calendar'}
			<CalendarCanvas {mode} />
		{:else if activeCanvas === 'notes'}
			<NotesCanvas {mode} />
		{/if}
	</div>

	<div class="canvas-switcher-area">
		<CanvasSwitcher {mode} {activeCanvas} onSelect={handleCanvasSelect} />
	</div>
</div>

<style>
	.canvas-container {
		grid-area: canvas;
		display: grid;
		grid-template-rows: 1fr auto;
		grid-template-columns: auto 1fr;
		grid-template-areas:
			'content content'
			'switcher content-bottom';
		height: 100vh;
		position: sticky;
		top: 0;
		align-self: start;
		border-left: 1px solid hsl(var(--border) / 0.3);
	}

	.canvas-content {
		grid-area: content;
		grid-row: 1 / -1;
		grid-column: 1 / -1;
		display: flex;
		flex-direction: column;
	}

	/* Remove canvas-area grid positioning from ChartCarousel - it's handled here */
	.canvas-content :global(.canvas-area) {
		grid-area: unset;
		position: relative;
		height: 100%;
	}

	.canvas-switcher-area {
		grid-area: switcher;
		position: absolute;
		bottom: -1px;
		left: -1px;
		z-index: 10;
		background: hsl(var(--background) / 0.9);
		border-top: 1px solid hsl(var(--border) / 0.3);
		border-right: 1px solid hsl(var(--border) / 0.3);
		border-top-right-radius: 8px;
	}
</style>
