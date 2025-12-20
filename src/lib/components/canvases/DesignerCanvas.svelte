<script lang="ts">
	/**
	 * DesignerCanvas - Character design canvas for Eva
	 * Renders designer canvases with notes, labels, lines, arrows, groups, images
	 * Purple-ish aesthetic to match Eva's palette
	 */

	import { onMount } from 'svelte';
	import { Icon } from 'svelte-icons-pack';
	import { LuCompass } from 'svelte-icons-pack/lu';
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
		onImagePaste?: (code: string, url: string) => void; // Called after successful paste
		refreshTrigger?: number; // Increment to force re-render after mutations
	}

	let {
		canvases = [],
		canvas = null,
		selectedCanvasIds = [],
		onSelect,
		onStateChange,
		onImagePaste,
		refreshTrigger = 0
	}: Props = $props();

	// Paste state
	let isPasting = $state(false);

	// Track refresh trigger to force re-read of canvas state
	$effect(() => {
		// This effect runs when refreshTrigger changes, forcing a re-evaluation of canvas state
		if (refreshTrigger > 0 && canvas?.state) {
			elements = canvas.state.render || [];
			stageX = canvas.state.viewport?.x || 0;
			stageY = canvas.state.viewport?.y || 0;
			stageScale = canvas.state.viewport?.scale || 1;
		}
	});

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

	// Text styling - zoom-invariant (constant visual size regardless of canvas zoom)
	// Base values match chat code blocks: SF Mono font, 9px size, 1.5 line-height
	const BASE_FONT_SIZE = 9;
	const BASE_LINE_HEIGHT = 1.5;
	const BASE_PADDING = 8;
	const BASE_WIDTH = 426; // matches code block content width (450 - 24px padding)

	// Inverse scale: multiply by this to keep visual size constant
	// When zoomed out (stageScale=0.5), inverseScale=2, so fontSize=22 renders as 11px visually
	let inverseScale = $derived(1 / stageScale);
	let fixedFontSize = $derived(BASE_FONT_SIZE * inverseScale);
	let fixedLineHeight = BASE_LINE_HEIGHT; // line-height is a ratio, doesn't need scaling
	let fixedPadding = $derived(BASE_PADDING * inverseScale);
	let fixedWidth = $derived(BASE_WIDTH * inverseScale);

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

	// Code generation for elements without codes
	const CODE_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	function generateCode(): string {
		let code = '';
		for (let i = 0; i < 3; i++) {
			code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
		}
		return code;
	}

	// Ensure all elements have codes (generates on first render, persists via notifyStateChange)
	function ensureElementCodes(els: RenderElement[]): RenderElement[] {
		const existingCodes = new Set(els.map(e => e.code).filter(Boolean));
		let modified = false;
		const result = els.map(el => {
			if (!el.code) {
				let newCode = generateCode();
				while (existingCodes.has(newCode)) {
					newCode = generateCode();
				}
				existingCodes.add(newCode);
				modified = true;
				return { ...el, code: newCode };
			}
			return el;
		});
		return modified ? result : els;
	}


	// Load state when canvas changes
	$effect(() => {
		if (canvas?.state) {
			const rawElements = canvas.state.render || [];
			const withCodes = ensureElementCodes(rawElements);
			elements = withCodes;

			// If codes were generated, persist them
			if (withCodes !== rawElements && canvas && onStateChange) {
				onStateChange(canvas.id, {
					render: withCodes,
					semantic: canvas.state.semantic || {},
					viewport: canvas.state.viewport || { x: 0, y: 0, scale: 1 }
				});
			}

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
		console.log('[DesignerCanvas] Loading images:', imageElements.length, 'elements');
		for (const el of imageElements) {
			if (el.src && !imageCache.has(el.src)) {
				console.log('[DesignerCanvas] Loading image:', el.id, el.src?.substring(0, 50));
				const img = new window.Image();
				// Only set crossOrigin for external URLs, not data URLs
				if (!el.src.startsWith('data:')) {
					img.crossOrigin = 'anonymous';
				}
				img.onload = () => {
					console.log('[DesignerCanvas] Image loaded:', el.id);
					imageCache = new Map(imageCache).set(el.src!, img);
				};
				img.onerror = (e) => {
					console.error('[DesignerCanvas] Image load error:', el.id, e);
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

	// Handle drag over - allow drop
	function handleDragOver(e: DragEvent) {
		if (!canvas) return;
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'copy';
		}
	}

	// Handle drop - upload image from Yoink or file system
	async function handleDrop(e: DragEvent) {
		if (!canvas || isPasting) return;
		e.preventDefault();

		const files = e.dataTransfer?.files;
		if (!files || files.length === 0) return;

		// Find first image file
		let imageFile: File | null = null;
		for (const file of files) {
			if (file.type.startsWith('image/')) {
				imageFile = file;
				break;
			}
		}

		if (!imageFile) return;

		isPasting = true;

		try {
			// Convert to base64
			const reader = new FileReader();
			const base64Promise = new Promise<string>((resolve, reject) => {
				reader.onload = () => resolve(reader.result as string);
				reader.onerror = reject;
			});
			reader.readAsDataURL(imageFile);
			const imageData = await base64Promise;

			// Send to paste API (reusing same endpoint)
			const response = await fetch(`/api/canvases/${canvas.id}/paste`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ imageData })
			});

			if (!response.ok) {
				const error = await response.json();
				console.error('[Drop] API error:', error);
				return;
			}

			const result = await response.json();

			// Update local state with new canvas state
			if (result.newState) {
				elements = result.newState.render || [];
			}

			// Notify parent
			if (onImagePaste && result.imageCode && result.imageUrl) {
				onImagePaste(result.imageCode, result.imageUrl);
			}

			console.log(`[Drop] Image added with code: ${result.imageCode}`);
		} catch (error) {
			console.error('[Drop] Error:', error);
		} finally {
			isPasting = false;
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

	// Fit to content: auto-layout elements in a cluster with gaps, then center and zoom to fit
	function fitToContent() {
		if (elements.length === 0) return;

		const GAP = 10;
		const PADDING = 40;

		// Get element dimensions
		const sized = elements.map((el) => ({
			el,
			w: el.width || (el.type === 'image' ? 384 : el.type === 'text' || el.type === 'prompt' ? 400 : 150),
			h: el.height || (el.type === 'image' ? 512 : el.type === 'text' || el.type === 'prompt' ? 150 : 100)
		}));

		// Calculate grid dimensions for a roughly square cluster
		const cols = Math.ceil(Math.sqrt(sized.length));
		const rows = Math.ceil(sized.length / cols);

		// Find max width/height per column/row for alignment
		const colWidths: number[] = Array(cols).fill(0);
		const rowHeights: number[] = Array(rows).fill(0);

		sized.forEach((item, i) => {
			const col = i % cols;
			const row = Math.floor(i / cols);
			colWidths[col] = Math.max(colWidths[col], item.w);
			rowHeights[row] = Math.max(rowHeights[row], item.h);
		});

		// Position elements in grid
		const positioned: { el: RenderElement; x: number; y: number; w: number; h: number }[] = [];

		sized.forEach((item, i) => {
			const col = i % cols;
			const row = Math.floor(i / cols);

			// Calculate x position (sum of previous column widths + gaps)
			let x = 0;
			for (let c = 0; c < col; c++) {
				x += colWidths[c] + GAP;
			}

			// Calculate y position (sum of previous row heights + gaps)
			let y = 0;
			for (let r = 0; r < row; r++) {
				y += rowHeights[r] + GAP;
			}

			positioned.push({ ...item, x, y });
		});

		// Apply new positions to elements
		elements = elements.map((el) => {
			const pos = positioned.find((p) => p.el.id === el.id);
			return pos ? { ...el, x: pos.x, y: pos.y } : el;
		});

		// Calculate bounding box
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;
		for (const p of positioned) {
			minX = Math.min(minX, p.x);
			minY = Math.min(minY, p.y);
			maxX = Math.max(maxX, p.x + p.w);
			maxY = Math.max(maxY, p.y + p.h);
		}

		const contentWidth = maxX - minX;
		const contentHeight = maxY - minY;

		// Calculate zoom to fit content in view
		const scaleX = (stageWidth - PADDING * 2) / contentWidth;
		const scaleY = (stageHeight - PADDING * 2) / contentHeight;
		const newScale = Math.min(scaleX, scaleY, 1);

		stageScale = Math.max(0.3, Math.min(1, newScale));

		// Center content in viewport
		const centerX = (minX + maxX) / 2;
		const centerY = (minY + maxY) / 2;
		stageX = stageWidth / 2 - centerX * stageScale;
		stageY = stageHeight / 2 - centerY * stageScale;

		notifyStateChange();
	}
</script>

<CanvasFrame>
	{#snippet content()}
		<div class="canvas-container" bind:this={containerEl} ondragover={handleDragOver} ondrop={handleDrop}>
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
					>
						<svelte:component this={Layer}>
							{#each elements as element (element.id)}
								{#if element.type === 'note'}
									<!-- Note: card with text - zoom-invariant -->
									{@const boxWidth = fixedWidth}
									{@const boxHeight = Math.max(100 * inverseScale, (element.text?.length || 0) * 0.4 * inverseScale)}
									{@const ribbonHeight = 14 * inverseScale}
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
											width={boxWidth}
											height={boxHeight}
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
											x={fixedPadding}
											y={fixedPadding}
											width={boxWidth - fixedPadding * 2}
											fontSize={fixedFontSize}
											lineHeight={fixedLineHeight}
											fontFamily="'SF Mono', Monaco, 'Cascadia Code', monospace"
											fill="#ebe5db"
											wrap="word"
										/>
										<!-- Code ribbons at top and bottom -->
										{#if element.code}
											<!-- Top ribbon -->
											<svelte:component
												this={Rect}
												x={0}
												y={0}
												width={boxWidth}
												height={ribbonHeight}
												fill="rgba(0,0,0,0.5)"
											/>
											<svelte:component
												this={Text}
												x={0}
												y={0}
												width={boxWidth}
												height={ribbonHeight}
												text={element.code}
												fontSize={fixedFontSize}
												fontFamily="'SF Mono', Monaco, 'Cascadia Code', monospace"
												fill="#ebe5db"
												fontStyle="bold"
												align="center"
												verticalAlign="middle"
											/>
											<!-- Bottom ribbon -->
											<svelte:component
												this={Rect}
												x={0}
												y={boxHeight - ribbonHeight}
												width={boxWidth}
												height={ribbonHeight}
												fill="rgba(0,0,0,0.5)"
											/>
											<svelte:component
												this={Text}
												x={0}
												y={boxHeight - ribbonHeight}
												width={boxWidth}
												height={ribbonHeight}
												text={element.code}
												fontSize={fixedFontSize}
												fontFamily="'SF Mono', Monaco, 'Cascadia Code', monospace"
												fill="#ebe5db"
												fontStyle="bold"
												align="center"
												verticalAlign="middle"
											/>
										{/if}
									</svelte:component>
								{:else if element.type === 'label'}
									<!-- Label: standalone text - zoom-invariant -->
									<svelte:component
										this={Text}
										x={element.x}
										y={element.y}
										text={element.text || ''}
										fontSize={fixedFontSize}
										lineHeight={fixedLineHeight}
										fontFamily="'SF Mono', Monaco, 'Cascadia Code', monospace"
										fill={element.fill || '#ebe5db'}
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
									<!-- Group: outline style - fixed visual size -->
									{@const groupWidth = element.width || 426}
									{@const groupHeight = element.height || 150}
									{@const ribbonHeight = 14 * inverseScale}
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
											width={groupWidth}
											height={groupHeight}
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
												x={fixedPadding}
												y={-18 * inverseScale}
												text={element.label}
												fontSize={fixedFontSize}
												lineHeight={fixedLineHeight}
												fontFamily="'SF Mono', Monaco, 'Cascadia Code', monospace"
												fill={element.stroke || '#5a5a5a'}
											/>
										{/if}
										<!-- Code ribbons at top and bottom -->
										{#if element.code}
											<!-- Top ribbon -->
											<svelte:component
												this={Rect}
												x={0}
												y={0}
												width={groupWidth}
												height={ribbonHeight}
												fill="rgba(0,0,0,0.5)"
											/>
											<svelte:component
												this={Text}
												x={0}
												y={0}
												width={groupWidth}
												height={ribbonHeight}
												text={element.code}
												fontSize={fixedFontSize}
												fontFamily="'SF Mono', Monaco, 'Cascadia Code', monospace"
												fill="#ebe5db"
												fontStyle="bold"
												align="center"
												verticalAlign="middle"
											/>
											<!-- Bottom ribbon -->
											<svelte:component
												this={Rect}
												x={0}
												y={groupHeight - ribbonHeight}
												width={groupWidth}
												height={ribbonHeight}
												fill="rgba(0,0,0,0.5)"
											/>
											<svelte:component
												this={Text}
												x={0}
												y={groupHeight - ribbonHeight}
												width={groupWidth}
												height={ribbonHeight}
												text={element.code}
												fontSize={fixedFontSize}
												fontFamily="'SF Mono', Monaco, 'Cascadia Code', monospace"
												fill="#ebe5db"
												fontStyle="bold"
												align="center"
												verticalAlign="middle"
											/>
										{/if}
									</svelte:component>
								{:else if element.type === 'image' && element.src && imageCache.has(element.src)}
									<!-- Image: displays loaded image with code label and optional selection border -->
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
											width={element.width || 426}
											height={element.height || 200}
										/>
										{#if selectedId === element.id}
											<svelte:component
												this={Rect}
												width={element.width || 426}
												height={element.height || 200}
												stroke="#fff"
												strokeWidth={2}
												cornerRadius={4}
											/>
										{/if}
										<!-- Image code ribbons - top and bottom, zoom-invariant -->
										{#if element.code}
											{@const ribbonHeight = 14 * inverseScale}
											<!-- Top ribbon -->
											<svelte:component
												this={Rect}
												x={0}
												y={0}
												width={element.width || 426}
												height={ribbonHeight}
												fill="rgba(0,0,0,0.5)"
											/>
											<svelte:component
												this={Text}
												x={0}
												y={0}
												width={element.width || 426}
												height={ribbonHeight}
												text={element.code}
												fontSize={fixedFontSize}
												fontFamily="'SF Mono', Monaco, 'Cascadia Code', monospace"
												fill="#ebe5db"
												fontStyle="bold"
												align="center"
												verticalAlign="middle"
											/>
											<!-- Bottom ribbon -->
											<svelte:component
												this={Rect}
												x={0}
												y={(element.height || 200) - ribbonHeight}
												width={element.width || 426}
												height={ribbonHeight}
												fill="rgba(0,0,0,0.5)"
											/>
											<svelte:component
												this={Text}
												x={0}
												y={(element.height || 200) - ribbonHeight}
												width={element.width || 426}
												height={ribbonHeight}
												text={element.code}
												fontSize={fixedFontSize}
												fontFamily="'SF Mono', Monaco, 'Cascadia Code', monospace"
												fill="#ebe5db"
												fontStyle="bold"
												align="center"
												verticalAlign="middle"
											/>
										{/if}
									</svelte:component>
								{:else if element.type === 'text'}
									<!-- Text: character field with heading - zoom-invariant -->
									{@const boxWidth = fixedWidth}
									{@const headerHeight = 20 * inverseScale}
									{@const boxHeight = Math.max(200 * inverseScale, (element.text?.length || 0) * 0.4 * inverseScale) + headerHeight}
									{@const ribbonHeight = 14 * inverseScale}
									{@const fieldLabel = element.field ? element.field.charAt(0).toUpperCase() + element.field.slice(1) : 'Text'}
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
											width={boxWidth}
											height={boxHeight}
											fill="#1a1a1a"
											stroke={selectedId === element.id ? '#fff' : '#3a3a3a'}
											strokeWidth={selectedId === element.id ? 2 : 1}
											cornerRadius={6}
										/>
										<!-- Field heading -->
										<svelte:component
											this={Text}
											text={fieldLabel}
											x={fixedPadding}
											y={ribbonHeight + fixedPadding * 0.5}
											width={boxWidth - fixedPadding * 2}
											fontSize={fixedFontSize * 1.1}
											fontFamily="'SF Mono', Monaco, 'Cascadia Code', monospace"
											fill="#888"
											fontStyle="bold"
										/>
										<!-- Content text -->
										<svelte:component
											this={Text}
											text={element.text || ''}
											x={fixedPadding}
											y={ribbonHeight + headerHeight}
											width={boxWidth - fixedPadding * 2}
											fontSize={fixedFontSize}
											lineHeight={fixedLineHeight}
											fontFamily="'SF Mono', Monaco, 'Cascadia Code', monospace"
											fill="#ebe5db"
											wrap="word"
										/>
										<!-- Code ribbons at top and bottom -->
										{#if element.code}
											<!-- Top ribbon -->
											<svelte:component
												this={Rect}
												x={0}
												y={0}
												width={boxWidth}
												height={ribbonHeight}
												fill="rgba(0,0,0,0.5)"
											/>
											<svelte:component
												this={Text}
												x={0}
												y={0}
												width={boxWidth}
												height={ribbonHeight}
												text={element.code}
												fontSize={fixedFontSize}
												fontFamily="'SF Mono', Monaco, 'Cascadia Code', monospace"
												fill="#ebe5db"
												fontStyle="bold"
												align="center"
												verticalAlign="middle"
											/>
											<!-- Bottom ribbon -->
											<svelte:component
												this={Rect}
												x={0}
												y={boxHeight - ribbonHeight}
												width={boxWidth}
												height={ribbonHeight}
												fill="rgba(0,0,0,0.5)"
											/>
											<svelte:component
												this={Text}
												x={0}
												y={boxHeight - ribbonHeight}
												width={boxWidth}
												height={ribbonHeight}
												text={element.code}
												fontSize={fixedFontSize}
												fontFamily="'SF Mono', Monaco, 'Cascadia Code', monospace"
												fill="#ebe5db"
												fontStyle="bold"
												align="center"
												verticalAlign="middle"
											/>
										{/if}
									</svelte:component>
								{:else if element.type === 'prompt'}
									<!-- Prompt: image generation prompt with heading - teal styling -->
									{@const boxWidth = fixedWidth}
									{@const headerHeight = 20 * inverseScale}
									{@const boxHeight = Math.max(120 * inverseScale, (element.text?.length || 0) * 0.4 * inverseScale) + headerHeight}
									{@const ribbonHeight = 14 * inverseScale}
									{@const promptLabel = element.promptIndex !== undefined ? `Prompt ${element.promptIndex + 1}` : 'Prompt'}
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
											width={boxWidth}
											height={boxHeight}
											fill="rgba(20, 60, 60, 0.95)"
											stroke={selectedId === element.id ? '#fff' : 'rgba(60, 160, 160, 0.6)'}
											strokeWidth={selectedId === element.id ? 2 : 1}
											cornerRadius={6}
										/>
										<!-- Prompt heading -->
										<svelte:component
											this={Text}
											text={promptLabel}
											x={fixedPadding}
											y={ribbonHeight + fixedPadding * 0.5}
											width={boxWidth - fixedPadding * 2}
											fontSize={fixedFontSize * 1.1}
											fontFamily="'SF Mono', Monaco, 'Cascadia Code', monospace"
											fill="#5a9a9a"
											fontStyle="bold"
										/>
										<!-- Content text -->
										<svelte:component
											this={Text}
											text={element.text || ''}
											x={fixedPadding}
											y={ribbonHeight + headerHeight}
											width={boxWidth - fixedPadding * 2}
											fontSize={fixedFontSize}
											lineHeight={fixedLineHeight}
											fontFamily="'SF Mono', Monaco, 'Cascadia Code', monospace"
											fill="#a8e0e0"
											wrap="word"
										/>
										<!-- Code ribbons at top and bottom -->
										{#if element.code}
											<!-- Top ribbon -->
											<svelte:component
												this={Rect}
												x={0}
												y={0}
												width={boxWidth}
												height={ribbonHeight}
												fill="rgba(0,0,0,0.5)"
											/>
											<svelte:component
												this={Text}
												x={0}
												y={0}
												width={boxWidth}
												height={ribbonHeight}
												text={element.code}
												fontSize={fixedFontSize}
												fontFamily="'SF Mono', Monaco, 'Cascadia Code', monospace"
												fill="#a8e0e0"
												fontStyle="bold"
												align="center"
												verticalAlign="middle"
											/>
											<!-- Bottom ribbon -->
											<svelte:component
												this={Rect}
												x={0}
												y={boxHeight - ribbonHeight}
												width={boxWidth}
												height={ribbonHeight}
												fill="rgba(0,0,0,0.5)"
											/>
											<svelte:component
												this={Text}
												x={0}
												y={boxHeight - ribbonHeight}
												width={boxWidth}
												height={ribbonHeight}
												text={element.code}
												fontSize={fixedFontSize}
												fontFamily="'SF Mono', Monaco, 'Cascadia Code', monospace"
												fill="#a8e0e0"
												fontStyle="bold"
												align="center"
												verticalAlign="middle"
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

			<!-- Fit to content button -->
			{#if canvas && elements.length > 0}
				<button
					class="fit-button"
					title="Fit to content"
					onclick={fitToContent}
				>
					<Icon src={LuCompass} size="13" />
				</button>
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
		position: relative;
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

	.fit-button {
		position: absolute;
		bottom: 12px;
		left: 12px;
		background: rgba(0, 0, 0, 0.7);
		border: none;
		border-radius: 50%;
		cursor: pointer;
		opacity: 0.6;
		transition: opacity 0.2s;
		padding: 6px;
		color: hsl(var(--foreground));
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.fit-button:hover {
		opacity: 1;
	}

	/* Canvas picker footer */
	.canvas-picker {
		display: flex;
		flex-direction: row;
		gap: 8px;
		width: 100%;
		padding: 0 10px 0 100px; /* Extra left padding for canvas switcher labels */
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
