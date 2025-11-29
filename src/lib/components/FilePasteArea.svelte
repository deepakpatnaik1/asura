<script lang="ts">
	/**
	 * FilePasteArea - Content-editable paste area for chat mode files
	 *
	 * Handles paste events, calls /api/chat/files, auto-closes on success.
	 */

	interface Props {
		onClose: () => void;
		onSuccess: (fileId: string, title: string) => void;
	}

	let { onClose, onSuccess }: Props = $props();

	let isProcessing = $state(false);
	let processingStatus = $state('');
	let processingError = $state<string | null>(null);
	let pastedHtml = $state('');

	async function handlePaste(event: ClipboardEvent) {
		event.preventDefault();

		const html = event.clipboardData?.getData('text/html');
		const text = event.clipboardData?.getData('text/plain');
		const content = html || text;

		if (!content) return;

		// Store for retry
		pastedHtml = content;

		// Display cleaned version
		if (html) {
			const temp = document.createElement('div');
			temp.innerHTML = html;
			temp.querySelectorAll('*').forEach((el) => {
				el.removeAttribute('style');
				el.removeAttribute('color');
				el.removeAttribute('bgcolor');
			});
			const pasteArea = event.target as HTMLElement;
			if (pasteArea) {
				pasteArea.innerHTML = temp.innerHTML;
			}
		}

		await processFile(content);
	}

	async function processFile(content: string) {
		isProcessing = true;
		processingStatus = 'Extracting title...';
		processingError = null;

		try {
			processingStatus = 'Generating artisan cut...';

			const response = await fetch('/api/chat/files', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error?.message || 'Upload failed');
			}

			const data = await response.json();

			processingStatus = 'Saving file...';
			await new Promise((r) => setTimeout(r, 300)); // Brief pause for UX

			// Success - close and notify parent
			onSuccess(data.file_id, data.title);
			onClose();
		} catch (error) {
			processingError = error instanceof Error ? error.message : 'Upload failed';
			isProcessing = false;
		}
	}

	function handleRetry() {
		if (pastedHtml) {
			processFile(pastedHtml);
		}
	}

	function handleAbort() {
		isProcessing = false;
		processingStatus = '';
		onClose();
	}
</script>

<div class="paste-box" class:has-error={processingError}>
	{#if isProcessing}
		<!-- Frosted Glass Overlay -->
		<div class="processing-overlay"></div>
		<div class="spinner-container">
			<div class="spinner">
				{#each Array(12) as _, i}
					<div class="spinner-bar" style="--bar-index: {i}"></div>
				{/each}
			</div>
			{#if processingStatus}
				<div class="processing-status">{processingStatus}</div>
			{/if}
			<button class="abort-button" onclick={handleAbort}>Cancel</button>
		</div>
	{/if}

	{#if processingError}
		<!-- Error State -->
		<div class="error-container">
			<div class="error-message">
				<strong>Error:</strong> {processingError}
			</div>
			<div class="error-actions">
				<button class="retry-button" onclick={handleRetry}>Retry</button>
				<button class="close-button" onclick={onClose}>Close</button>
			</div>
		</div>
	{:else if !isProcessing}
		<!-- Paste Area -->
		<div
			class="paste-area"
			contenteditable="true"
			onpaste={handlePaste}
			data-placeholder="Paste content here..."
		></div>
	{/if}
</div>

<style>
	.paste-box {
		background: rgb(0, 0, 0);
		border: 1px solid var(--boss-accent);
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
		height: 200px;
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

	.paste-area :global(*) {
		color: hsl(var(--foreground)) !important;
		background-color: transparent !important;
		font-size: 8pt !important;
		line-height: 1.6 !important;
	}

	/* Processing Overlay */
	.processing-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(8px);
		border-radius: var(--boss-card-border-radius);
		z-index: 25;
	}

	.spinner-container {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 30;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
	}

	.processing-status {
		color: var(--boss-accent);
		font-size: 10pt;
		font-weight: 500;
		text-align: center;
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
		background: var(--boss-accent);
		border-radius: 1.5px;
		top: 5px;
		left: 50%;
		margin-left: -1px;
		transform-origin: center 13px;
		transform: rotate(calc(var(--bar-index) * 30deg));
		opacity: calc(0.2 + (var(--bar-index) / 12) * 0.8);
	}

	.abort-button {
		background: transparent;
		color: rgb(239, 68, 68);
		border: 1px solid rgb(239, 68, 68);
		border-radius: 6px;
		padding: 8px 20px;
		font-size: 9pt;
		cursor: pointer;
		transition: all 0.2s;
	}

	.abort-button:hover {
		background: rgb(239, 68, 68);
		color: hsl(var(--background));
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
	}

	.error-actions {
		display: flex;
		gap: 12px;
	}

	.retry-button {
		background: transparent;
		color: var(--boss-accent);
		border: 1px solid var(--boss-accent);
		border-radius: 6px;
		padding: 10px 24px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.retry-button:hover {
		background: var(--boss-accent);
		color: hsl(var(--background));
	}

	.close-button {
		background: transparent;
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--border));
		border-radius: 6px;
		padding: 10px 24px;
		font-weight: 500;
		cursor: pointer;
		opacity: 0.7;
	}

	.close-button:hover {
		opacity: 1;
	}
</style>
