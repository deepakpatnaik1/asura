<script lang="ts">
	/**
	 * NotesCanvas - Scratch canvas: Markdown scratch pad
	 */

	import { Icon } from 'svelte-icons-pack';
	import { LuStickyNote } from 'svelte-icons-pack/lu';
	import type { Mode } from '$lib/config/modes';
	import CanvasFrame from '$lib/components/CanvasFrame.svelte';

	interface Props {
		mode: Mode;
	}

	let { mode }: Props = $props();
</script>

<CanvasFrame {mode}>
	{#snippet content()}
		<div class="notes-canvas">
			<div class="placeholder">
				<Icon src={LuStickyNote} size="48" />
				<h3>Notes</h3>
				<p>Scratch pad coming soon</p>
			</div>
		</div>
	{/snippet}
	{#snippet footer()}
		<!-- Empty footer for layout alignment -->
	{/snippet}
</CanvasFrame>

<style>
	.notes-canvas {
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.placeholder {
		text-align: center;
		color: hsl(var(--muted-foreground));
		opacity: 0.6;
	}

	.placeholder h3 {
		margin: 16px 0 8px;
		font-size: 1.1rem;
		font-weight: 500;
		color: var(--accent);
	}

	.placeholder p {
		font-size: 0.875rem;
	}
</style>
