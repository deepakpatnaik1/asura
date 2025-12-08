<script lang="ts">
	/**
	 * NotesCanvas - Interactive brainstorming canvas with Konva
	 * Renders whiteboards with sticky notes, drag/drop, pan/zoom
	 */

	import { onMount } from 'svelte';
	import CanvasFrame from '$lib/components/CanvasFrame.svelte';

	// Sticky note data model
	type StickyNote = {
		id: string;
		x: number;
		y: number;
		text: string;
		fill: string;
		width: number;
		height: number;
	};

	type WhiteboardState = {
		notes: StickyNote[];
		viewport: { x: number; y: number; scale: number };
	};

	interface Whiteboard {
		id: string;
		title: string;
		state?: WhiteboardState;
		created_at: string;
		updated_at: string;
	}

	interface Props {
		whiteboards?: Whiteboard[];
		whiteboard?: Whiteboard | null;
		selectedWhiteboardIds?: string[]; // Which whiteboards are selected for context injection
		onSelect?: (id: string) => void;
		onStateChange?: (id: string, state: WhiteboardState) => void;
	}

	let {
		whiteboards = [],
		whiteboard = null,
		selectedWhiteboardIds = [],
		onSelect,
		onStateChange
	}: Props = $props();

	// Track mounted state for client-only rendering
	let mounted = $state(false);
	let containerEl: HTMLDivElement;
	let stageWidth = $state(800);
	let stageHeight = $state(600);

	// Canvas state - initialized from whiteboard prop
	let notes = $state<StickyNote[]>([]);
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
	let Transformer: any;

	// Load state when whiteboard changes
	$effect(() => {
		if (whiteboard?.state) {
			notes = whiteboard.state.notes || [];
			stageX = whiteboard.state.viewport?.x || 0;
			stageY = whiteboard.state.viewport?.y || 0;
			stageScale = whiteboard.state.viewport?.scale || 1;
		} else {
			// Reset to empty state
			notes = [];
			stageX = 0;
			stageY = 0;
			stageScale = 1;
		}
		selectedId = null;
	});

	onMount(async () => {
		// Dynamic import for SSR compatibility
		const konva = await import('svelte-konva');
		Stage = konva.Stage;
		Layer = konva.Layer;
		Rect = konva.Rect;
		Text = konva.Text;
		Group = konva.Group;
		Transformer = konva.Transformer;

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
		if (whiteboard && onStateChange) {
			onStateChange(whiteboard.id, {
				notes,
				viewport: { x: stageX, y: stageY, scale: stageScale }
			});
		}
	}

	// Handle drag end - update note position
	function handleDragEnd(noteId: string, e: any) {
		const target = e.target;
		notes = notes.map(n =>
			n.id === noteId
				? { ...n, x: target.x(), y: target.y() }
				: n
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
			// Shift+Scroll: some browsers swap axes, others set deltaX
			// This handles both cases naturally
			stageX -= evt.deltaX || (evt.shiftKey ? evt.deltaY : 0);
			stageY -= evt.shiftKey ? 0 : evt.deltaY;
		}
	}

	// Handle stage drag for panning
	function handleStageDragEnd(e: any) {
		stageX = e.target.x();
		stageY = e.target.y();
	}

	// Select a note
	function handleSelect(noteId: string) {
		selectedId = noteId;
	}

	// Deselect on stage click
	function handleStageClick(e: any) {
		if (e.target === e.target.getStage()) {
			selectedId = null;
		}
	}

	// Double-click to add new note
	function handleDblClick(e: any) {
		if (!whiteboard) return; // Need active whiteboard to add notes

		const stage = e.target.getStage();
		const pointer = stage.getPointerPosition();
		const newNote: StickyNote = {
			id: `note-${Date.now()}`,
			x: (pointer.x - stageX) / stageScale,
			y: (pointer.y - stageY) / stageScale,
			text: 'New idea...',
			fill: '#e9d5ff',
			width: 150,
			height: 100
		};
		notes = [...notes, newNote];
		selectedId = newNote.id;
		notifyStateChange();
	}

	// Handle whiteboard selection from footer
	function handleWhiteboardClick(id: string) {
		if (onSelect) {
			onSelect(id);
		}
	}
</script>

<CanvasFrame>
	{#snippet content()}
		<div class="canvas-container" bind:this={containerEl}>
			{#if mounted && Stage}
				{#if whiteboard}
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
							{#each notes as note (note.id)}
								<svelte:component
									this={Group}
									x={note.x}
									y={note.y}
									draggable={true}
									ondragend={(e: any) => handleDragEnd(note.id, e)}
									onclick={() => handleSelect(note.id)}
								>
									<!-- Sticky note background -->
									<svelte:component
										this={Rect}
										width={note.width}
										height={note.height}
										fill={note.fill}
										cornerRadius={4}
										shadowColor="black"
										shadowBlur={8}
										shadowOpacity={0.2}
										shadowOffsetY={4}
										stroke={selectedId === note.id ? '#000' : 'transparent'}
										strokeWidth={2}
									/>
									<!-- Sticky note text -->
									<svelte:component
										this={Text}
										text={note.text}
										x={10}
										y={10}
										width={note.width - 20}
										height={note.height - 20}
										fontSize={14}
										fontFamily="system-ui, -apple-system, sans-serif"
										fill="#1f2937"
										wrap="word"
									/>
								</svelte:component>
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
		{#if whiteboards.length > 0}
			<div class="whiteboard-picker">
				{#each whiteboards as wb (wb.id)}
					<button
						class="whiteboard-chip"
						class:active={whiteboard?.id === wb.id}
						class:selected={selectedWhiteboardIds.includes(wb.id)}
						onclick={() => handleWhiteboardClick(wb.id)}
						title={wb.title}
					>
						{#if selectedWhiteboardIds.includes(wb.id)}
							<span class="chip-check">✓</span>
						{/if}
						<span class="chip-title">{wb.title}</span>
						<span class="chip-count">{wb.state?.notes?.length || 0}</span>
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

		/* Cutting mat aesthetic - neutral dark gray with grid */
		--mat-bg: hsl(0, 0%, 5%);
		--mat-grid-minor: hsla(0, 0%, 100%, 0.03);
		--mat-grid-major: hsla(0, 0%, 100%, 0.04);

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
		color: rgba(100, 140, 120, 0.8);
		font-size: 0.875rem;
		gap: 4px;
	}

	.empty-state .hint {
		font-size: 0.75rem;
		opacity: 0.6;
	}

	/* Whiteboard picker footer */
	.whiteboard-picker {
		display: flex;
		flex-direction: row;
		gap: 8px;
		width: 100%;
		padding: 0 10px 0 44px; /* Extra left padding for canvas switcher */
		justify-content: center;
		flex-wrap: nowrap;
		overflow-x: auto;
		height: 100%;
		align-items: center;
	}

	.whiteboard-chip {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: 16px;
		cursor: pointer;
		transition: all 0.2s ease;
		flex-shrink: 0;
	}

	.whiteboard-chip:hover {
		background: hsl(var(--accent));
		border-color: hsl(var(--accent));
	}

	.whiteboard-chip.active {
		background: hsl(var(--foreground) / 0.1);
		border-color: hsl(var(--foreground) / 0.3);
	}

	.whiteboard-chip.selected {
		background: hsl(var(--accent));
		border-color: hsl(var(--accent));
	}

	.whiteboard-chip.selected.active {
		background: hsl(var(--accent));
		border-color: hsl(var(--foreground) / 0.5);
	}

	.chip-check {
		font-size: 0.7rem;
		color: hsl(var(--foreground));
		font-weight: 600;
	}

	.chip-title {
		font-size: 0.75rem;
		color: hsl(var(--foreground));
		max-width: 120px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.chip-count {
		font-size: 0.65rem;
		color: hsl(var(--muted-foreground));
		background: hsl(var(--background));
		padding: 2px 6px;
		border-radius: 10px;
	}
</style>
