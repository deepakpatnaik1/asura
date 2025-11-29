<script lang="ts">
	/**
	 * ArticlePasteArea - Content-editable paste area for article HTML
	 *
	 * Handles paste events, displays processing state, and error recovery.
	 */

	import ProcessingSpinner from './ProcessingSpinner.svelte';

	interface Props {
		isProcessing: boolean;
		processingStatus: string;
		processingError: string | null;
		onPaste: (html: string) => void;
		onAbort: () => void;
		onRetry: () => void;
	}

	let { isProcessing, processingStatus, processingError, onPaste, onAbort, onRetry }: Props = $props();

	function handlePaste(event: ClipboardEvent) {
		event.preventDefault();

		const html = event.clipboardData?.getData('text/html');
		if (html) {
			// Create a temporary div to parse and clean the HTML
			const temp = document.createElement('div');
			temp.innerHTML = html;

			// Remove all style attributes and color-related inline styles
			const allElements = temp.querySelectorAll('*');
			allElements.forEach((el) => {
				el.removeAttribute('style');
				el.removeAttribute('color');
				el.removeAttribute('bgcolor');
			});

			// Insert the cleaned HTML for display
			const pasteArea = event.target as HTMLElement;
			if (pasteArea) {
				pasteArea.innerHTML = temp.innerHTML;
			}

			// Trigger processing
			onPaste(html);
		}
	}
</script>

<div class="paste-box" class:has-error={processingError}>
	{#if isProcessing}
		<!-- Frosted Glass Overlay -->
		<div class="processing-overlay"></div>
		<ProcessingSpinner status={processingStatus} onAbort={onAbort} />
	{/if}

	{#if processingError}
		<!-- Error State -->
		<div class="error-container">
			<div class="error-message">
				<strong>Error:</strong> {processingError}
			</div>
			<button class="retry-button" onclick={onRetry}>
				Retry
			</button>
		</div>
	{:else}
		<!-- Paste Area -->
		<div
			class="paste-area"
			contenteditable="true"
			onpaste={handlePaste}
			data-placeholder="Paste article here..."
		></div>
	{/if}
</div>

<style>
	.paste-box {
		background: rgb(0, 0, 0);
		border: 1px solid var(--reader-accent);
		padding: var(--boss-card-padding-y) var(--boss-card-padding-x);
		border-radius: var(--boss-card-border-radius);
		min-height: 250px;
		position: fixed;
		bottom: 80px;
		left: 24px;
		width: calc(var(--middle-section-width) - 48px);
		z-index: 50;
	}

	.paste-area {
		height: 260px;
		overflow-y: auto;
		color: hsl(var(--foreground));
		font-size: 8pt;
		line-height: 1.6;
		outline: none;
		white-space: normal;
		position: relative;
		z-index: 20;
	}

	.paste-area:empty:before {
		content: attr(data-placeholder);
		color: hsl(var(--foreground));
		opacity: 0.5;
		font-size: 8pt;
	}

	/* Override all inline styles for pasted content */
	.paste-area :global(*),
	.paste-area :global(span),
	.paste-area :global(p),
	.paste-area :global(div),
	.paste-area :global(a) {
		color: hsl(var(--foreground)) !important;
		background-color: transparent !important;
		font-size: 8pt !important;
		line-height: 1.6 !important;
		font-family: "iA Writer Quattro V", system-ui, -apple-system, sans-serif !important;
	}

	.paste-area :global(img) {
		max-width: 100%;
		height: auto;
		display: block;
		margin: 12px 0;
		border-radius: 4px;
	}

	/* Processing Overlay - Frosted Glass */
	.processing-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border-radius: var(--boss-card-border-radius);
		z-index: 25;
	}

	/* Error State */
	.paste-box.has-error {
		border-color: rgb(239, 68, 68);
	}

	.error-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding: 40px;
		text-align: center;
	}

	.error-message {
		color: rgb(239, 68, 68);
		font-size: 10pt;
		line-height: 1.6;
	}

	.error-message strong {
		display: block;
		margin-bottom: 8px;
		font-size: 11pt;
	}

	.retry-button {
		background: transparent;
		color: var(--reader-accent);
		border: 1px solid var(--reader-accent);
		border-radius: 6px;
		padding: 10px 24px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.retry-button:hover {
		background: var(--reader-accent);
		color: hsl(var(--background));
	}
</style>
