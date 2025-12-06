<script lang="ts">
	/**
	 * CanvasFrame - Shared wrapper for all canvas components
	 *
	 * Provides consistent layout structure:
	 * - Frame with configurable padding (top/left/right)
	 * - Content area (main canvas)
	 * - Footer area (aligns with input bar height)
	 *
	 * Footer structure mirrors input bar:
	 * - footerPadding (top) - matches input bar's derived top padding
	 * - footerContent (71px) - where thumbnails/controls go
	 * - footerPadding (bottom) - matches input bar's derived bottom padding
	 *
	 * Usage:
	 * <CanvasFrame>
	 *   {#snippet content()}
	 *     <!-- Your canvas content here -->
	 *   {/snippet}
	 *   {#snippet footer()}
	 *     <!-- Optional: carousel, controls, or leave empty -->
	 *   {/snippet}
	 * </CanvasFrame>
	 */

	import type { Snippet } from 'svelte';
	import { CANVAS_CONFIG } from '$lib/config/canvas';

	interface Props {
		content: Snippet;
		footer?: Snippet;
	}

	let { content, footer }: Props = $props();

	const { framePadding, footer: footerConfig, debug } = CANVAS_CONFIG;
</script>

<div
	class="canvas-frame"
	style:--frame-padding="{framePadding}px"
	style:--footer-padding="{footerConfig.padding}px"
	style:--footer-content-height="{footerConfig.contentHeight}px"
	style:background={debug.enabled ? debug.frameColor : 'transparent'}
>
	<div class="canvas-content">
		{@render content()}
	</div>
	<div class="canvas-footer">
		<div
			class="footer-padding-left"
			style:background={debug.enabled ? debug.frameColor : 'transparent'}
		></div>
		<div class="footer-center">
			<div
				class="footer-padding-top"
				style:background={debug.enabled ? debug.footerColor : 'transparent'}
			></div>
			<div class="footer-content">
				{#if footer}
					{@render footer()}
				{/if}
			</div>
			<div
				class="footer-padding-bottom"
				style:background={debug.enabled ? debug.footerColor : 'transparent'}
			></div>
		</div>
		<div
			class="footer-padding-right"
			style:background={debug.enabled ? debug.frameColor : 'transparent'}
		></div>
	</div>
</div>

<style>
	.canvas-frame {
		height: 100%;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
	}

	.canvas-content {
		flex: 1;
		margin: var(--frame-padding) var(--frame-padding) 0 var(--frame-padding);
		min-height: 0;
		overflow: hidden;
		background: hsl(var(--background));
	}

	.canvas-footer {
		flex-shrink: 0;
		min-height: var(--input-bar-min-height);
		display: flex;
		flex-direction: row;
		position: relative;
		background: hsl(var(--background));
		border-top: 1px solid hsl(var(--border) / var(--border-opacity));
	}

	.footer-padding-left,
	.footer-padding-right {
		width: var(--frame-padding);
		flex-shrink: 0;
	}

	.footer-center {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.footer-padding-top,
	.footer-padding-bottom {
		height: var(--footer-padding);
		flex-shrink: 0;
	}

	.footer-content {
		height: var(--footer-content-height);
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}
</style>
