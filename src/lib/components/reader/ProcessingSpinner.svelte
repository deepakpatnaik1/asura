<script lang="ts">
	/**
	 * ProcessingSpinner - macOS-style loading spinner with status text
	 *
	 * Used during article processing pipeline to show progress.
	 */

	interface Props {
		status: string;
		onAbort: () => void;
	}

	let { status, onAbort }: Props = $props();
</script>

<div class="spinner-container">
	<div class="spinner">
		<div class="spinner-bar" style="--bar-index: 0"></div>
		<div class="spinner-bar" style="--bar-index: 1"></div>
		<div class="spinner-bar" style="--bar-index: 2"></div>
		<div class="spinner-bar" style="--bar-index: 3"></div>
		<div class="spinner-bar" style="--bar-index: 4"></div>
		<div class="spinner-bar" style="--bar-index: 5"></div>
		<div class="spinner-bar" style="--bar-index: 6"></div>
		<div class="spinner-bar" style="--bar-index: 7"></div>
		<div class="spinner-bar" style="--bar-index: 8"></div>
		<div class="spinner-bar" style="--bar-index: 9"></div>
		<div class="spinner-bar" style="--bar-index: 10"></div>
		<div class="spinner-bar" style="--bar-index: 11"></div>
	</div>
	{#if status}
		<div class="processing-status">{status}</div>
	{/if}
	<button class="abort-button" onclick={onAbort}>
		Cancel
	</button>
</div>

<style>
	.spinner-container {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 30;
		pointer-events: none;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
	}

	.processing-status {
		color: var(--reader-accent);
		font-size: 10pt;
		font-weight: 500;
		text-align: center;
		white-space: nowrap;
	}

	.spinner {
		width: 36px;
		height: 36px;
		position: relative;
		animation: spin 1.2s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.spinner-bar {
		position: absolute;
		width: 2px;
		height: 10px;
		background: var(--reader-accent);
		border-radius: 1.5px;
		top: 5px;
		left: 50%;
		margin-left: -1px;
		transform-origin: center 13px;
		transform: rotate(calc(var(--bar-index) * 30deg));
		opacity: calc(0.2 + (var(--bar-index) / 12) * 0.8);
	}

	/* Gradient effect through opacity */
	.spinner-bar:nth-child(1) { opacity: 0.2; }
	.spinner-bar:nth-child(2) { opacity: 0.27; }
	.spinner-bar:nth-child(3) { opacity: 0.34; }
	.spinner-bar:nth-child(4) { opacity: 0.41; }
	.spinner-bar:nth-child(5) { opacity: 0.48; }
	.spinner-bar:nth-child(6) { opacity: 0.55; }
	.spinner-bar:nth-child(7) { opacity: 0.62; }
	.spinner-bar:nth-child(8) { opacity: 0.69; }
	.spinner-bar:nth-child(9) { opacity: 0.76; }
	.spinner-bar:nth-child(10) { opacity: 0.83; }
	.spinner-bar:nth-child(11) { opacity: 0.90; }
	.spinner-bar:nth-child(12) { opacity: 1.0; }

	.abort-button {
		background: transparent;
		color: rgb(239, 68, 68);
		border: 1px solid rgb(239, 68, 68);
		border-radius: 6px;
		padding: 8px 20px;
		font-size: 9pt;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
		pointer-events: all;
		margin-top: 8px;
	}

	.abort-button:hover {
		background: rgb(239, 68, 68);
		color: hsl(var(--background));
	}
</style>
