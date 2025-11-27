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
		/** Mode for accent color: 'chat' or 'reader' */
		mode?: 'chat' | 'reader';
	}

	let {
		isOpen,
		progress,
		message = "Hush... it'll all be over soon.",
		onCancel,
		mode = 'chat'
	}: Props = $props();
</script>

{#if isOpen}
	<div class="modal-overlay" onclick={onCancel}>
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<p class="modal-text">{message}</p>
			<div class="progress-container">
				<div class="progress-bar" class:chat={mode === 'chat'} class:reader={mode === 'reader'} style="width: {progress}%"></div>
			</div>
			<div class="modal-actions">
				<button class="cancel-btn" class:chat={mode === 'chat'} class:reader={mode === 'reader'} onclick={onCancel}>Cancel</button>
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
	}

	.progress-bar.chat {
		background: #991b1b;
	}

	.progress-bar.reader {
		background: var(--reader-accent);
	}

	.modal-actions {
		display: flex;
		justify-content: center;
	}

	.cancel-btn {
		background: transparent;
		border: 1px solid;
		border-radius: 6px;
		padding: 12px 24px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.cancel-btn.chat {
		color: var(--boss-accent);
		border-color: var(--boss-accent);
	}

	.cancel-btn.chat:hover {
		background: var(--boss-accent);
		color: hsl(var(--background));
	}

	.cancel-btn.reader {
		color: var(--reader-accent);
		border-color: var(--reader-accent);
	}

	.cancel-btn.reader:hover {
		background: var(--reader-accent);
		color: hsl(var(--background));
	}
</style>
