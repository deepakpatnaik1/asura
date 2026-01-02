<script lang="ts">
	interface Props {
		/** Whether the modal is visible */
		isOpen: boolean;
		/** Progress percentage (0-100) */
		progress: number;
		/** Message to display */
		message?: string;
		/** Cancel button click handler */
		onCancel: () => void;
	}

	let {
		isOpen,
		progress,
		message = "Hush... it'll all be over soon.",
		onCancel
	}: Props = $props();
</script>

{#if isOpen}
	<div
		class="modal-overlay"
		onclick={onCancel}
		onkeydown={(e) => e.key === 'Escape' && onCancel()}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
	>
		<div class="modal-content" onclick={(e) => e.stopPropagation()} role="document">
			<p class="modal-text">{message}</p>
			<div class="progress-container">
				<div class="progress-bar" style="width: {progress}%"></div>
			</div>
			<div class="modal-actions">
				<button class="cancel-btn" onclick={onCancel}>Cancel</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal-content {
		background: hsl(var(--background));
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
		padding: 24px;
		min-width: 300px;
		max-width: 400px;
	}

	.modal-text {
		color: hsl(var(--foreground));
		font-family: "iA Writer Quattro V", system-ui, -apple-system, sans-serif;
		font-size: 8pt;
		margin: 0 0 16px 0;
		text-align: center;
	}

	.progress-container {
		width: 60%;
		height: 6px;
		background: hsl(var(--border));
		border-radius: 2px;
		overflow: hidden;
		margin: 0 auto 24px auto;
	}

	.progress-bar {
		height: 100%;
		transition: width 50ms linear;
		background: #991b1b; /* Danger/destructive color */
	}

	.modal-actions {
		display: flex;
		justify-content: center;
	}

	.cancel-btn {
		background: transparent;
		border: 1px solid hsl(var(--border));
		border-radius: 6px;
		padding: 12px 24px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
		color: hsl(var(--foreground));
	}

	.cancel-btn:hover {
		border-color: hsl(var(--foreground));
	}
</style>
