<script lang="ts">
	/**
	 * ChartCarousel - Canvas with thumbnail grid and lightbox
	 *
	 * Displays extracted chart images from articles with expand/collapse functionality.
	 * Uses bindable props so parent can read lightbox state for Q&A context.
	 * Supports optional pin/delete controls for chat mode.
	 */

	import { Icon } from 'svelte-icons-pack';
	import { LuTrash2 } from 'svelte-icons-pack/lu';
	import type { Mode } from '$lib/config/modes';
	import CanvasFrame from '$lib/components/CanvasFrame.svelte';

	interface Chart {
		id: string;
		thumbnail_url: string;
		full_url: string;
		alt: string;
	}

	interface Props {
		mode: Mode;
		charts: Chart[];
		selectedChartIndex?: number | null;
		showLightbox?: boolean;
		/** Enable delete controls (for chat mode) */
		enableDelete?: boolean;
		/** Callback when chart is deleted */
		onDelete?: (chartId: string) => void;
	}

	let {
		mode,
		charts,
		selectedChartIndex = $bindable(null),
		showLightbox = $bindable(false),
		enableDelete = false,
		onDelete
	}: Props = $props();

	function openLightbox(index: number) {
		selectedChartIndex = index;
		showLightbox = true;
	}

	function closeLightbox() {
		showLightbox = false;
		selectedChartIndex = null;
	}

	function navigateChart(direction: 'prev' | 'next') {
		if (selectedChartIndex === null) return;

		if (direction === 'prev') {
			selectedChartIndex = selectedChartIndex > 0 ? selectedChartIndex - 1 : charts.length - 1;
		} else {
			selectedChartIndex = selectedChartIndex < charts.length - 1 ? selectedChartIndex + 1 : 0;
		}
	}

	function handleDeleteClick(event: MouseEvent, chart: Chart) {
		event.stopPropagation();
		if (onDelete) {
			onDelete(chart.id);
		}
	}

	// Handle keyboard navigation
	function handleKeydown(event: KeyboardEvent) {
		if (!showLightbox) return;

		if (event.key === 'Escape') {
			closeLightbox();
		} else if (event.key === 'ArrowLeft') {
			navigateChart('prev');
		} else if (event.key === 'ArrowRight') {
			navigateChart('next');
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<CanvasFrame {mode}>
	{#snippet content()}
		{#if charts.length > 0 && showLightbox && selectedChartIndex !== null}
			<!-- Full-size chart view -->
			<div class="canvas-chart-view">
				<div class="chart-view-header">
					<div class="chart-view-info">
						<span class="chart-counter">{selectedChartIndex + 1} / {charts.length}</span>
						<span class="chart-title">{charts[selectedChartIndex].alt}</span>
					</div>
					{#if enableDelete}
						<div class="chart-view-actions">
							<button
								class="chart-action-btn delete"
								onclick={(e) => handleDeleteClick(e, charts[selectedChartIndex!])}
								title="Delete"
							>
								<Icon src={LuTrash2} size="14" />
							</button>
						</div>
					{/if}
				</div>

				<div class="chart-view-image">
					<button class="chart-nav chart-nav-prev" onclick={() => navigateChart('prev')} title="Previous (←)">
						<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</button>

					<img src={charts[selectedChartIndex].full_url} alt={charts[selectedChartIndex].alt} />

					<button class="chart-nav chart-nav-next" onclick={() => navigateChart('next')} title="Next (→)">
						<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</button>
				</div>
			</div>
		{/if}
	{/snippet}
	{#snippet footer()}
		{#if charts.length > 0}
			<!-- Thumbnail grid -->
			<div class="chart-grid">
				{#each charts as chart, index}
					{@const isActive = showLightbox && selectedChartIndex === index}
					<div class="chart-thumbnail-wrapper">
						<button
							class="chart-thumbnail"
							class:active={isActive}
							onclick={() => isActive ? closeLightbox() : openLightbox(index)}
							title={isActive ? "Collapse (Esc)" : chart.alt}
						>
							<img src={chart.thumbnail_url} alt={chart.alt} />
							<div class="chart-overlay">
								{#if isActive}
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
										<path d="M4 14h6v6M20 10h-6V4M10 14l-7 7M14 10l7-7" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
									</svg>
								{:else}
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
										<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
									</svg>
								{/if}
							</div>
						</button>
						{#if enableDelete}
							<div class="thumbnail-actions">
								<button
									class="thumbnail-action-btn delete"
									onclick={(e) => handleDeleteClick(e, chart)}
									title="Delete"
								>
									<Icon src={LuTrash2} size="11" />
								</button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/snippet}
</CanvasFrame>

<style>
	.chart-grid {
		display: flex;
		flex-direction: row;
		gap: 10px;
		width: 100%;
		padding: 0 10px 0 44px; /* Extra left padding for canvas switcher */
		justify-content: center;
		flex-wrap: nowrap;
		overflow-x: auto;
		height: 100%;
		align-items: center;
	}

	.chart-thumbnail-wrapper {
		position: relative;
		flex-shrink: 0;
		margin: 0;
		padding: 0;
	}

	.chart-thumbnail {
		position: relative;
		flex-shrink: 0;
		height: 80px;
		width: auto;
		background: hsl(var(--background));
		border: none;
		overflow: hidden;
		cursor: pointer;
		transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
		padding: 0;
		margin: 0;
	}

	.chart-thumbnail:hover {
		transform: scale(1.05);
	}

	.chart-thumbnail:active {
		transform: scale(0.98);
	}

	.chart-thumbnail.active {
		outline: 2px solid var(--reader-accent);
		outline-offset: 2px;
	}

	.chart-thumbnail img {
		height: 100%;
		width: auto;
		background: hsl(var(--background));
		margin: 0;
		padding: 0;
		display: block;
	}

	.chart-overlay {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--reader-accent);
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.chart-thumbnail:hover .chart-overlay,
	.chart-thumbnail.active .chart-overlay {
		opacity: 1;
	}

	.thumbnail-actions {
		position: absolute;
		bottom: -4px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 2px;
		opacity: 0;
		transition: opacity 0.2s ease;
		background: hsl(var(--card));
		border-radius: 4px;
		padding: 2px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}

	.chart-thumbnail-wrapper:hover .thumbnail-actions {
		opacity: 1;
	}

	.thumbnail-action-btn {
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		border-radius: 3px;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s;
	}

	.thumbnail-action-btn:hover {
		background: hsl(var(--accent));
		color: hsl(var(--foreground));
	}

	.thumbnail-action-btn.delete:hover {
		background: rgba(239, 68, 68, 0.1);
		color: rgb(239, 68, 68);
	}

	.canvas-chart-view {
		height: 100%;
		width: 100%;
		display: flex;
		flex-direction: column;
		animation: fadeIn 0.2s ease;
		overflow: hidden;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.chart-view-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px;
		border-bottom: 1px solid hsl(var(--border) / 0.3);
		flex-shrink: 0;
	}

	.chart-view-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.chart-counter {
		font-size: 9pt;
		color: hsl(var(--muted-foreground));
		font-weight: 500;
	}

	.chart-title {
		font-size: 10pt;
		color: hsl(var(--foreground));
		font-weight: 500;
	}

	.chart-view-actions {
		display: flex;
		gap: 8px;
	}

	.chart-action-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 6px;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s;
	}

	.chart-action-btn:hover {
		background: hsl(var(--accent));
		color: hsl(var(--foreground));
	}

	.chart-action-btn.delete:hover {
		background: rgba(239, 68, 68, 0.1);
		border-color: rgb(239, 68, 68);
		color: rgb(239, 68, 68);
	}

	.chart-view-image {
		flex: 1;
		position: relative;
		display: flex;
		align-items: flex-start;
		justify-content: flex-start;
		padding: 24px;
		overflow: auto;
		overscroll-behavior: contain;
		min-height: 0;
	}

	.chart-view-image img {
		/* Display at natural size, scroll if larger than container */
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.chart-nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 40px;
		height: 40px;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border) / 0.3);
		border-radius: 8px;
		color: hsl(var(--foreground));
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.chart-nav:hover {
		background: hsl(var(--accent));
		border-color: hsl(var(--accent));
		color: hsl(var(--accent-foreground));
		transform: translateY(-50%) scale(1.05);
	}

	.chart-nav-prev { left: 16px; }
	.chart-nav-next { right: 16px; }
</style>
