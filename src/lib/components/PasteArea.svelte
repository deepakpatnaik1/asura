<script lang="ts">
	/**
	 * PasteArea - Paste area for chat and reader modes
	 *
	 * Accepts HTML (Firefox Reader Mode) or plain text (markdown, Claude docs).
	 * Toggle controls ephemeral vs persistent storage treatment.
	 * Mode parameter determines which content pool this belongs to.
	 */

	interface Props {
		onClose: () => void;
		onSuccess: (id: string, title: string, content: string, superjournalId?: string) => void;
		mode?: 'chat' | 'reader';
	}

	let { onClose, onSuccess, mode = 'chat' }: Props = $props();

	// Reader mode defaults to ephemeral, chat mode defaults to persistent
	let isPersistent = $state(mode === 'chat');
	let isCanon = $state(false); // Canon = shared knowledge across all modes
	let isProcessing = $state(false);
	let processingStatus = $state('');
	let processingError = $state<string | null>(null);
	let pastedContent = $state('');

	const placeholder = 'Paste content here...';
	const accentVar = 'var(--boss-accent)';

	async function handlePaste(event: ClipboardEvent) {
		event.preventDefault();

		const html = event.clipboardData?.getData('text/html');
		const text = event.clipboardData?.getData('text/plain');
		const content = html || text;

		if (!content) return;

		// Store for retry
		pastedContent = content;

		// Display cleaned version
		const pasteArea = event.target as HTMLElement;
		if (html && pasteArea) {
			const temp = document.createElement('div');
			temp.innerHTML = html;
			temp.querySelectorAll('*').forEach((el) => {
				el.removeAttribute('style');
				el.removeAttribute('color');
				el.removeAttribute('bgcolor');
			});
			pasteArea.innerHTML = temp.innerHTML;
		} else if (text && pasteArea) {
			pasteArea.textContent = text;
		}

		await processContent(content);
	}

	async function processContent(content: string) {
		isProcessing = true;
		processingStatus = 'Extracting title...';
		processingError = null;

		try {
			processingStatus = isPersistent ? 'Generating artisan cut...' : 'Processing...';

			const response = await fetch('/api/chat/files', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					content,
					persistent: isPersistent,
					mode,
					is_canon: isCanon
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error?.message || 'Upload failed');
			}

			const data = await response.json();

			processingStatus = 'Saving...';
			await new Promise((r) => setTimeout(r, 300));

			// Success - close and notify parent
			const id = data.file_id || data.article_id || data.id;
			const title = data.title || 'Untitled';
			const responseContent = data.content || '';
			const superjournalId = data.superjournal_id;
			onSuccess(id, title, responseContent, superjournalId);
			onClose();
		} catch (error) {
			processingError = error instanceof Error ? error.message : 'Upload failed';
			isProcessing = false;
		}
	}

	function handleRetry() {
		if (pastedContent) {
			processContent(pastedContent);
		}
	}

	function handleAbort() {
		isProcessing = false;
		processingStatus = '';
		onClose();
	}
</script>

<div class="paste-box" class:has-error={processingError} style="--accent: {accentVar}">
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
	{:else}
		<!-- Paste Area - always visible, content shows through overlay -->
		<div
			class="paste-area"
			contenteditable={!isProcessing}
			onpaste={handlePaste}
			data-placeholder={placeholder}
		></div>

		<!-- Toggle - hidden during processing -->
		{#if !isProcessing}
			<div class="controls-row">
				<div class="toggle-container" class:disabled={mode === 'reader'}>
					<span class="toggle-label" class:active={!isPersistent}>Ephemeral</span>
					<button
						class="toggle-switch"
						class:on={isPersistent}
						onclick={() => { if (mode !== 'reader') isPersistent = !isPersistent; }}
						aria-label="Toggle persistent mode"
						disabled={mode === 'reader'}
					>
						<span class="toggle-knob"></span>
					</button>
					<span class="toggle-label" class:active={isPersistent}>Persistent</span>
				</div>

				<label class="canon-checkbox">
					<button
						class="checkbox-btn"
						class:checked={isCanon}
						onclick={() => isCanon = !isCanon}
						aria-label="Toggle canon"
					>
						{#if isCanon}
							<span class="checkmark">✓</span>
						{/if}
					</button>
					<span class="checkbox-label" class:active={isCanon}>Canon</span>
				</label>
			</div>
		{/if}

		<!-- Processing Overlay - shows on top of content -->
		{#if isProcessing}
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
	{/if}
</div>

<style>
	.paste-box {
		background: rgb(0, 0, 0);
		border: 1px solid var(--accent);
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

	/* Processing Overlay - translucent so content shows through */
	.processing-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(10px);
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
		color: var(--accent);
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
		background: var(--accent);
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
		color: var(--accent);
		border: 1px solid var(--accent);
		border-radius: 6px;
		padding: 10px 24px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.retry-button:hover {
		background: var(--accent);
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

	/* Controls row */
	.controls-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 12px;
	}

	/* Toggle */
	.toggle-container {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.toggle-label {
		font-size: 1em;
		color: hsl(var(--foreground));
		opacity: 0.4;
		transition: opacity 0.2s;
	}

	.toggle-label.active {
		opacity: 1;
	}

	.toggle-container.disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.toggle-container.disabled .toggle-switch {
		cursor: not-allowed;
	}

	.toggle-switch {
		position: relative;
		width: 22px;
		height: 12px;
		background: hsl(var(--border));
		border: 1px solid hsl(var(--foreground));
		border-radius: 6px;
		cursor: pointer;
		transition: background 0.2s;
		padding: 0;
	}

	.toggle-switch.on {
		background: var(--accent);
		border-color: var(--accent);
	}

	.toggle-knob {
		position: absolute;
		top: 1px;
		left: 1px;
		width: 8px;
		height: 8px;
		background: hsl(var(--foreground));
		border-radius: 50%;
		transition: transform 0.2s;
	}

	.toggle-switch.on .toggle-knob {
		transform: translateX(10px);
		background: hsl(var(--background));
	}

	/* Canon checkbox */
	.canon-checkbox {
		display: flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
	}

	.checkbox-btn {
		width: 13px;
		height: 13px;
		border-radius: 2px;
		border: 1px solid hsl(var(--border));
		background: transparent;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		color: hsl(var(--foreground));
		transition: all 0.15s;
		padding: 0;
	}

	.checkbox-btn.checked {
		background: var(--accent);
		border-color: var(--accent);
		opacity: 1;
	}

	.checkmark {
		font-size: 9px;
		color: hsl(var(--background));
		font-weight: bold;
	}

	.checkbox-label {
		font-size: 1em;
		color: hsl(var(--foreground));
		opacity: 0.4;
		transition: opacity 0.2s;
	}

	.checkbox-label.active {
		opacity: 1;
	}
</style>
