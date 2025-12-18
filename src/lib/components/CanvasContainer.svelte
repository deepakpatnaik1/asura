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
	import type { CanvasState } from '$lib/api/canvas-tools';
	import CanvasSwitcher from './CanvasSwitcher.svelte';
	import ChartCarousel from './ChartCarousel.svelte';
	import CalendarCanvas from './canvases/CalendarCanvas.svelte';
	import NotesCanvas from './canvases/NotesCanvas.svelte';
	import DesignerCanvas from './canvases/DesignerCanvas.svelte';

	// Chart type for Gallery canvas
	interface Chart {
		id: string;
		thumbnail_url: string;
		full_url: string;
		alt: string;
	}

	// Whiteboard type for Notes canvas
	interface Whiteboard {
		id: string;
		title: string;
		state?: {
			notes: Array<{ id: string; x: number; y: number; text: string; fill: string; width: number; height: number }>;
			viewport: { x: number; y: number; scale: number };
		};
		created_at: string;
		updated_at: string;
	}

	// Designer Canvas type for Designer canvas
	interface DesignerCanvasData {
		id: string;
		title: string;
		state?: CanvasState;
		created_at: string;
		updated_at: string;
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
		// Notes/Whiteboard-specific props
		whiteboardRefreshTrigger?: number;
		whiteboards?: Whiteboard[];
		activeWhiteboardId?: string | null;
		selectedWhiteboardIds?: string[]; // For showing selection state in carousel
		onWhiteboardSelect?: (id: string) => void;
		onWhiteboardStateChange?: (id: string, state: Whiteboard['state']) => void;
		// Designer canvas-specific props
		designerCanvasRefreshTrigger?: number;
		designerCanvases?: DesignerCanvasData[];
		activeDesignerCanvasId?: string | null;
		selectedDesignerCanvasIds?: string[];
		onDesignerCanvasSelect?: (id: string) => void;
		onDesignerCanvasStateChange?: (id: string, state: DesignerCanvasData['state']) => void;
		// Force switch to specific canvas (e.g., when content is loaded)
		forceCanvas?: CanvasType | null;
	}

	let {
		persona,
		charts = [],
		selectedChartIndex = $bindable(null),
		showLightbox = $bindable(false),
		enableDelete = false,
		onDelete,
		calendarRefreshTrigger = 0,
		whiteboardRefreshTrigger = 0,
		whiteboards = [],
		activeWhiteboardId = null,
		selectedWhiteboardIds = [],
		onWhiteboardSelect,
		onWhiteboardStateChange,
		designerCanvasRefreshTrigger = 0,
		designerCanvases = [],
		activeDesignerCanvasId = null,
		selectedDesignerCanvasIds = [],
		onDesignerCanvasSelect,
		onDesignerCanvasStateChange,
		forceCanvas = $bindable(null)
	}: Props = $props();

	// Filter to only selected whiteboards (similar to enabled articles)
	const selectedWhiteboards = $derived(
		whiteboards.filter(wb => selectedWhiteboardIds.includes(wb.id))
	);

	// Get active whiteboard data (only if it's in the selected list)
	const activeWhiteboard = $derived(
		selectedWhiteboards.find(wb => wb.id === activeWhiteboardId) ?? null
	);

	// Filter to only selected designer canvases (similar to enabled articles)
	const selectedDesignerCanvases = $derived(
		designerCanvases.filter(c => selectedDesignerCanvasIds.includes(c.id))
	);

	// Get active designer canvas data (only if it's in the selected list)
	const activeDesignerCanvas = $derived(
		selectedDesignerCanvases.find(c => c.id === activeDesignerCanvasId) ?? null
	);

	let activeCanvas = $state<CanvasType>(DEFAULT_CANVAS);

	// Force switch to specific canvas when parent requests it
	$effect(() => {
		if (forceCanvas) {
			activeCanvas = forceCanvas;
			localStorage.setItem(`aether_canvas_${persona}`, forceCanvas);
			forceCanvas = null; // Reset after handling
		}
	});

	function handleCanvasSelect(canvas: CanvasType) {
		activeCanvas = canvas;
		localStorage.setItem(`aether_canvas_${persona}`, canvas);
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
			<NotesCanvas
				whiteboards={selectedWhiteboards}
				whiteboard={activeWhiteboard}
				{selectedWhiteboardIds}
				onSelect={onWhiteboardSelect}
				onStateChange={onWhiteboardStateChange}
				refreshTrigger={whiteboardRefreshTrigger}
			/>
		{:else if activeCanvas === 'designer'}
			<DesignerCanvas
				canvases={selectedDesignerCanvases}
				canvas={activeDesignerCanvas}
				selectedCanvasIds={selectedDesignerCanvasIds}
				onSelect={onDesignerCanvasSelect}
				onStateChange={onDesignerCanvasStateChange}
				refreshTrigger={designerCanvasRefreshTrigger}
			/>
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
