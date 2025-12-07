<script lang="ts">
	/**
	 * CanvasContainer - Multi-canvas workspace container
	 *
	 * Wraps canvas content with a vertical icon tab switcher.
	 * Manages active canvas state per mode (localStorage).
	 * Passes mode-specific props to child canvas components.
	 * Available canvases: Gallery, Planner, Scratch
	 */

	import { type CanvasType, DEFAULT_CANVAS } from '$lib/config/canvases';
	import { getPersonaDefaultCanvas } from '$lib/config/personas';
	import CanvasSwitcher from './CanvasSwitcher.svelte';
	import ChartCarousel from './ChartCarousel.svelte';
	import CalendarCanvas from './canvases/CalendarCanvas.svelte';
	import NotesCanvas from './canvases/NotesCanvas.svelte';

	// Chart type for Gallery canvas
	interface Chart {
		id: string;
		thumbnail_url: string;
		full_url: string;
		alt: string;
	}

	interface Props {
		persona: string;
		// Gallery-specific props (passed through when Gallery canvas is active)
		charts?: Chart[];
		selectedChartIndex?: number | null;
		showLightbox?: boolean;
		enableDelete?: boolean;
		onDelete?: (chartId: string) => void;
		// Calendar-specific props
		calendarRefreshTrigger?: number;
	}

	let {
		persona,
		charts = [],
		selectedChartIndex = $bindable(null),
		showLightbox = $bindable(false),
		enableDelete = false,
		onDelete,
		calendarRefreshTrigger = 0
	}: Props = $props();

	// Get persona's default canvas
	const personaDefaultCanvas = $derived(getPersonaDefaultCanvas(persona));

	let activeCanvas = $state<CanvasType>(DEFAULT_CANVAS);

	// Load active canvas from localStorage when persona changes, fallback to persona default
	$effect(() => {
		const stored = localStorage.getItem(`asura_canvas_${persona}`);
		if (stored && ['carousel', 'calendar', 'notes'].includes(stored)) {
			activeCanvas = stored as CanvasType;
		} else {
			activeCanvas = personaDefaultCanvas;
		}
	});

	function handleCanvasSelect(canvas: CanvasType) {
		activeCanvas = canvas;
		localStorage.setItem(`asura_canvas_${persona}`, canvas);
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
			<CalendarCanvas {persona} refreshTrigger={calendarRefreshTrigger} />
		{:else if activeCanvas === 'notes'}
			<NotesCanvas />
		{/if}
	</div>

	<div class="canvas-switcher-area">
		<CanvasSwitcher {persona} {activeCanvas} onSelect={handleCanvasSelect} />
	</div>
</div>

<style>
	.canvas-container {
		grid-area: canvas;
		height: 100vh;
		position: sticky;
		top: 0;
		border-left: 1px solid hsl(var(--border) / var(--border-opacity));
		overflow: hidden;
		overscroll-behavior: contain;
	}

	.canvas-content {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
	}

	/* Ensure canvas frame fills container */
	.canvas-content :global(.canvas-frame) {
		height: 100%;
	}

	.canvas-switcher-area {
		position: absolute;
		bottom: 0;
		left: 0;
		z-index: 10;
		height: var(--input-bar-height);
		display: flex;
		align-items: center;
		background: hsl(var(--background) / 0.9);
		border-top: 1px solid hsl(var(--border) / var(--border-opacity));
		border-right: 1px solid hsl(var(--border) / var(--border-opacity));
		border-top-right-radius: 8px;
	}
</style>
