<script lang="ts">
	/**
	 * DesignCanvas - Character design canvas for Eva
	 * Renders character canvases with images, notes, and backstory elements
	 */

	import { onMount } from 'svelte';
	import CanvasFrame from '$lib/components/CanvasFrame.svelte';
	import type { RenderElement, CanvasState } from '$lib/api/canvas-tools';
	import { CANVAS, LAYOUT } from '$lib/config/layout';

	interface Canvas {
		id: string;
		title: string;
		state?: CanvasState;
		created_at: string;
		updated_at: string;
	}

	interface Props {
		canvases?: Canvas[];
		canvas?: Canvas | null;
		selectedCanvasIds?: string[]; // Which canvases are selected for context injection
		onSelect?: (id: string) => void;
		onStateChange?: (id: string, state: CanvasState) => void;
	}

	let {
		canvases = [],
		canvas = null,
		selectedCanvasIds = [],
		onSelect,
		onStateChange
	}: Props = $props();

	// Track mounted state for client-only rendering
	let mounted = $state(false);
	let containerEl: HTMLDivElement;
	let stageWidth = $state(800);
	let stageHeight = $state(600);

	// Canvas state - initialized from canvas prop
	let elements = $state<RenderElement[]>([]);
	let stageX = $state(0);
	let stageY = $state(0);
	let stageScale = $state(1);

	// Selection state
	let selectedId = $state<string | null>(null);

	// Konva components (loaded dynamically)
	let Stage: any;
	let Layer: any;
	let Rect: any;
	let Text: any;
	let Group: any;
	let Line: any;
	let Arrow: any;
	let Image: any;

	// Image cache for Konva (requires HTMLImageElement)
	let imageCache = $state<Map<string, HTMLImageElement>>(new Map());

	// Load state when canvas changes
	$effect(() => {
		if (canvas?.state) {
			elements = canvas.state.render || [];
			stageX = canvas.state.viewport?.x || 0;
			stageY = canvas.state.viewport?.y || 0;
			stageScale = canvas.state.viewport?.scale || 1;
		} else {
			// Reset to empty state
			elements = [];
			stageX = 0;
			stageY = 0;
			stageScale = 1;
		}
		selectedId = null;
	});

	// Load images for image elements
	$effect(() => {
		const imageElements = elements.filter((el) => el.type === 'image' && el.src);
		for (const el of imageElements) {
			if (el.src && !imageCache.has(el.src)) {
				const img = new window.Image();
				img.crossOrigin = 'anonymous';
				img.onload = () => {
					imageCache = new Map(imageCache).set(el.src!, img);
				};
				img.src = el.src;
			}
		}
	});

	onMount(async () => {
		// Dynamic import for SSR compatibility
		const konva = await import('svelte-konva');
		Stage = konva.Stage;
		Layer = konva.Layer;
		Rect = konva.Rect;
		Text = konva.Text;
		Group = konva.Group;
		Line = konva.Line;
		Arrow = konva.Arrow;
		Image = konva.Image;

		// Size canvas to container
		if (containerEl) {
			const rect = containerEl.getBoundingClientRect();
			stageWidth = rect.width;
			stageHeight = rect.height;
		}

		mounted = true;

		// Handle resize
		const resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				stageWidth = entry.contentRect.width;
				stageHeight = entry.contentRect.height;
			}
		});
		if (containerEl) resizeObserver.observe(containerEl);

		return () => {
			resizeObserver.disconnect();
		};
	});

	// Notify parent of state changes (for persistence)
	function notifyStateChange() {
		if (canvas && onStateChange) {
			onStateChange(canvas.id, {
				render: elements,
				semantic: canvas.state?.semantic || {},
				viewport: { x: stageX, y: stageY, scale: stageScale }
			});
		}
	}

	// Handle drag end - update element position
	function handleDragEnd(elementId: string, e: any) {
		const target = e.target;
		elements = elements.map((el) =>
			el.id === elementId ? { ...el, x: target.x(), y: target.y() } : el
		);
		notifyStateChange();
	}

	// Handle wheel - Figma-style controls
	// Scroll = pan vertical, Shift+Scroll = pan horizontal, Cmd+Scroll = zoom
	function handleWheel(e: any) {
		e.evt.preventDefault();
		const evt = e.evt;

		if (evt.metaKey || evt.ctrlKey) {
			// Cmd/Ctrl + Scroll = Zoom
			const scaleBy = 1.05;
			const stage = e.target.getStage();
			const oldScale = stageScale;
			const pointer = stage.getPointerPosition();

			const mousePointTo = {
				x: (pointer.x - stageX) / oldScale,
				y: (pointer.y - stageY) / oldScale
			};

			const direction = evt.deltaY > 0 ? -1 : 1;
			const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;

			// Clamp scale
			stageScale = Math.max(0.3, Math.min(3, newScale));

			stageX = pointer.x - mousePointTo.x * stageScale;
			stageY = pointer.y - mousePointTo.y * stageScale;
		} else {
			// Pan - use both deltaX and deltaY
			stageX -= evt.deltaX || (evt.shiftKey ? evt.deltaY : 0);
			stageY -= evt.shiftKey ? 0 : evt.deltaY;
		}
	}

	// Handle stage drag for panning
	function handleStageDragEnd(e: any) {
		stageX = e.target.x();
		stageY = e.target.y();
	}

	// Select an element
	function handleSelect(elementId: string) {
		selectedId = elementId;
	}

	// Deselect on stage click
	function handleStageClick(e: any) {
		if (e.target === e.target.getStage()) {
			selectedId = null;
		}
	}

	// Double-click to add new note
	function handleDblClick(e: any) {
		if (!canvas) return; // Need active canvas to add elements

		const stage = e.target.getStage();
		const pointer = stage.getPointerPosition();
		const newElement: RenderElement = {
			id: `note-${Date.now()}`,
			type: 'note',
			x: (pointer.x - stageX) / stageScale,
			y: (pointer.y - stageY) / stageScale,
			text: 'Character note...',
			fill: '#4a3a5a', // Purple-ish for Eva's aesthetic
			width: 150,
			height: 100
		};
		elements = [...elements, newElement];
		selectedId = newElement.id;
		notifyStateChange();
	}

	// Handle canvas selection from footer
	function handleCanvasClick(id: string) {
		if (onSelect) {
			onSelect(id);
		}
	}

	// Helper to get element count for chip display
	function getElementCount(c: Canvas): number {
		return c.state?.render?.length || 0;
	}
</script>

<CanvasFrame>
	{#snippet content()}
		<div class="canvas-container" bind:this={containerEl}>
			{#if mounted && Stage}
				{#if canvas}
					<svelte:component
						this={Stage}
						width={stageWidth}
						height={stageHeight}
						x={stageX}
						y={stageY}
						scaleX={stageScale}
						scaleY={stageScale}
						draggable={true}
						onwheel={handleWheel}
						ondragend={handleStageDragEnd}
						onclick={handleStageClick}
						ondblclick={handleDblClick}
					>
						<svelte:component this={Layer}>
							{#each elements as element (element.id)}
								{#if element.type === 'note'}
									<!-- Note: card with text -->
									<svelte:component
										this={Group}
										x={element.x}
										y={element.y}
										draggable={true}
										ondragend={(e: any) => handleDragEnd(element.id, e)}
										onclick={() => handleSelect(element.id)}
									>
										<svelte:component
											this={Rect}
											width={element.width || 150}
											height={element.height || 100}
											fill={element.fill || '#4a3a5a'}
											cornerRadius={4}
											shadowColor="black"
											shadowBlur={element.stroke ? 0 : 8}
											shadowOpacity={element.stroke ? 0 : 0.2}
											shadowOffsetY={element.stroke ? 0 : 4}
											stroke={selectedId === element.id
												? '#fff'
												: element.stroke || 'transparent'}
											strokeWidth={element.strokeWidth || 2}
										/>
										<svelte:component
											this={Text}
											text={element.text || ''}
											x={10}
											y={10}
											width={(element.width || 150) - 20}
											height={(element.height || 100) - 20}
											fontSize={11}
											fontFamily="iA Writer Quattro V, system-ui, -apple-system, sans-serif"
											fill="#d9d9d9"
											wrap="word"
										/>
									</svelte:component>
								{:else if element.type === 'label'}
									<!-- Label: standalone text -->
									<svelte:component
										this={Text}
										x={element.x}
										y={element.y}
										text={element.text || ''}
										fontSize={element.fontSize || 14}
										fontFamily="iA Writer Quattro V, system-ui, -apple-system, sans-serif"
										fill={element.fill || '#d9d9d9'}
										draggable={true}
										ondragend={(e: any) => handleDragEnd(element.id, e)}
										onclick={() => handleSelect(element.id)}
									/>
								{:else if element.type === 'line'}
									<!-- Line: connects two points -->
									<svelte:component
										this={Line}
										points={[
											element.from?.[0] || 0,
											element.from?.[1] || 0,
											element.to?.[0] || 0,
											element.to?.[1] || 0
										]}
										stroke={element.stroke || '#5a5a5a'}
										strokeWidth={element.strokeWidth || 2}
										onclick={() => handleSelect(element.id)}
									/>
								{:else if element.type === 'arrow'}
									<!-- Arrow: line with pointer -->
									<svelte:component
										this={Arrow}
										points={[
											element.from?.[0] || 0,
											element.from?.[1] || 0,
											element.to?.[0] || 0,
											element.to?.[1] || 0
										]}
										stroke={element.stroke || '#5a5a5a'}
										strokeWidth={element.strokeWidth || 2}
										fill={element.stroke || '#5a5a5a'}
										pointerLength={10}
										pointerWidth={8}
										onclick={() => handleSelect(element.id)}
									/>
								{:else if element.type === 'group'}
									<!-- Group: outline style with colored border + translucent fill -->
									<svelte:component
										this={Group}
										x={element.x}
										y={element.y}
										draggable={true}
										ondragend={(e: any) => handleDragEnd(element.id, e)}
										onclick={() => handleSelect(element.id)}
									>
										<svelte:component
											this={Rect}
											width={element.width || 200}
											height={element.height || 150}
											fill={element.fill || 'rgba(20,20,20,0.8)'}
											stroke={selectedId === element.id
												? '#fff'
												: element.stroke || '#5a5a5a'}
											strokeWidth={element.strokeWidth || 1}
											cornerRadius={4}
										/>
										{#if element.label}
											<svelte:component
												this={Text}
												x={8}
												y={-18}
												text={element.label}
												fontSize={11}
												fontFamily="iA Writer Quattro V, system-ui, -apple-system, sans-serif"
												fill={element.stroke || '#5a5a5a'}
											/>
										{/if}
									</svelte:component>
								{:else if element.type === 'image' && element.src && imageCache.has(element.src)}
									<!-- Image: displays loaded image with optional selection border -->
									<svelte:component
										this={Group}
										x={element.x}
										y={element.y}
										draggable={true}
										ondragend={(e: any) => handleDragEnd(element.id, e)}
										onclick={() => handleSelect(element.id)}
									>
										<svelte:component
											this={Image}
											image={imageCache.get(element.src)}
											width={element.width || 200}
											height={element.height || 200}
										/>
										{#if selectedId === element.id}
											<svelte:component
												this={Rect}
												width={element.width || 200}
												height={element.height || 200}
												stroke="#fff"
												strokeWidth={2}
												cornerRadius={4}
											/>
										{/if}
									</svelte:component>
								{/if}
							{/each}
						</svelte:component>
					</svelte:component>
				{:else}
					<div class="empty-state"></div>
				{/if}
			{:else}
				<div class="loading">Loading canvas...</div>
			{/if}
		</div>
	{/snippet}
	{#snippet footer()}
		{#if canvases.length > 0}
			<div
				class="canvas-picker"
				style="--thumbnail-height: {CANVAS.footer.contentHeight}px; --body-font: {LAYOUT.typography.body}px;"
			>
				{#each canvases as c (c.id)}
					<button
						class="canvas-chip"
						class:active={canvas?.id === c.id}
						class:selected={selectedCanvasIds.includes(c.id)}
						onclick={() => handleCanvasClick(c.id)}
						title={c.title}
					>
						{#if selectedCanvasIds.includes(c.id)}
							<span class="chip-check">✓</span>
						{/if}
						<span class="chip-title">{c.title}</span>
						<span class="chip-count">{getElementCount(c)}</span>
					</button>
				{/each}
			</div>
		{/if}
	{/snippet}
</CanvasFrame>

<style>
	.canvas-container {
		width: 100%;
		height: 100%;
		border-radius: 8px;
		overflow: hidden;

		/* Eva's design canvas - warmer, slightly purple-tinted mat */
		--mat-bg: hsl(270, 10%, 6%);
		--mat-grid-minor: hsla(270, 30%, 50%, 0.03);
		--mat-grid-major: hsla(270, 30%, 50%, 0.05);

		background-color: var(--mat-bg);
		background-image:
			/* Major grid lines every 100px */
			linear-gradient(var(--mat-grid-major) 1px, transparent 1px),
			linear-gradient(90deg, var(--mat-grid-major) 1px, transparent 1px),
			/* Minor grid lines every 20px */
			linear-gradient(var(--mat-grid-minor) 1px, transparent 1px),
			linear-gradient(90deg, var(--mat-grid-minor) 1px, transparent 1px);
		background-size:
			100px 100px,
			100px 100px,
			10px 10px,
			10px 10px;
	}

	.loading,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: rgba(140, 100, 160, 0.8);
		font-size: 0.875rem;
		gap: 4px;
	}

	/* Canvas picker footer */
	.canvas-picker {
		display: flex;
		flex-direction: row;
		gap: 8px;
		width: 100%;
		padding: 0 10px 0 44px; /* Extra left padding for canvas switcher */
		justify-content: flex-start;
		flex-wrap: nowrap;
		overflow-x: auto;
		height: 100%;
		align-items: center;
	}

	/* Mini canvas thumbnail style */
	.canvas-chip {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: flex-start;
		padding: 8px 10px;
		height: var(--thumbnail-height);
		min-width: 80px;
		background: hsl(270, 10%, 6%); /* Same as canvas mat */
		border: 1px solid hsl(var(--border) / 0.3);
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s ease;
		flex-shrink: 0;
		position: relative;
	}

	.canvas-chip:hover {
		border-color: hsl(var(--border) / 0.6);
	}

	.canvas-chip.active {
		border-color: hsl(var(--foreground) / 0.5);
	}

	.canvas-chip.selected {
		border-color: hsl(var(--accent));
	}

	.canvas-chip.selected.active {
		border-color: hsl(var(--foreground) / 0.7);
		box-shadow: 0 0 0 1px hsl(var(--accent) / 0.3);
	}

	.chip-check {
		position: absolute;
		top: 4px;
		right: 4px;
		font-size: 9px;
		color: hsl(var(--accent));
		font-weight: 600;
	}

	.chip-title {
		font-size: var(--body-font);
		color: hsl(var(--foreground) / 0.9);
		white-space: nowrap;
		line-height: 1.3;
	}

	.chip-count {
		font-size: 9px;
		color: hsl(var(--muted-foreground));
		margin-top: auto;
	}
</style>
