<script lang="ts">
	/**
	 * PasteArea - Content paste area
	 *
	 * Accepts HTML (Firefox Reader Mode), plain text (markdown, Claude docs),
	 * or drag & dropped images. Tier selector at top: Ephemeral, Persistent, Canon.
	 */

	interface Props {
		onClose: () => void;
		onSuccess: (id: string, title: string, content: string, superjournalId?: string) => void;
		/** Callback when an image is uploaded */
		onImageUploaded?: () => void;
	}

	let { onClose, onSuccess, onImageUploaded }: Props = $props();

	// Tier selection: ephemeral (default), persistent (strategic), or canon
	type Tier = 'ephemeral' | 'persistent' | 'canon';
	let selectedTier = $state<Tier>('ephemeral');
	let isProcessing = $state(false);
	let processingStatus = $state('');
	let processingError = $state<string | null>(null);
	let pastedContent = $state('');
	let pasteAreaRef: HTMLElement | null = $state(null);
	let isDragging = $state(false);

	// Auto-focus paste area on mount so cursor is ready
	$effect(() => {
		if (pasteAreaRef && !isProcessing) {
			pasteAreaRef.focus();
		}
	});

	const placeholder = 'Paste content or drop images here...';
	const accentVar = 'var(--boss-accent)';

	// Supported image types
	const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

	async function handlePaste(event: ClipboardEvent) {
		event.preventDefault();

		const html = event.clipboardData?.getData('text/html');
		const text = event.clipboardData?.getData('text/plain');

		// Determine content type:
		// - If plain text looks like markdown, prefer it over HTML
		// - Otherwise use HTML if available (for web content)
		// Patterns: # headers, ** bold, - bullets, numbered lists, --- frontmatter/hr, ``` code blocks
		const looksLikeMarkdown = text && /^(#{1,6}\s|---|```|\*\*|-\s|\d+\.\s)/m.test(text);
		const content = looksLikeMarkdown ? text : (html || text);

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
			processingStatus = selectedTier !== 'ephemeral' ? 'Generating artisan cut...' : 'Processing...';

			// Map tier selection to API tier value
			const tier = selectedTier === 'canon' ? 'canon' : (selectedTier === 'persistent' ? 'strategic' : 'ephemeral');

			const response = await fetch('/api/chat/files', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					content,
					tier
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

	// Drag & drop handlers
	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'copy';
		}
	}

	function handleDragEnter(event: DragEvent) {
		event.preventDefault();
		isDragging = true;
	}

	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		// Only set to false if leaving the paste area entirely
		const relatedTarget = event.relatedTarget as Node | null;
		if (!pasteAreaRef?.contains(relatedTarget)) {
			isDragging = false;
		}
	}

	async function handleDrop(event: DragEvent) {
		event.preventDefault();
		isDragging = false;

		const files = event.dataTransfer?.files;
		if (!files || files.length === 0) return;

		// Get first image file
		const imageFile = Array.from(files).find((f) => IMAGE_TYPES.includes(f.type));
		if (!imageFile) {
			processingError = 'Please drop an image file (JPEG, PNG, GIF, WebP, or SVG)';
			return;
		}

		await uploadImage(imageFile);
	}

	async function uploadImage(file: File) {
		isProcessing = true;
		processingStatus = 'Uploading image...';
		processingError = null;

		try {
			const formData = new FormData();
			formData.append('image', file);

			const response = await fetch('/api/chat/files/upload', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error?.message || 'Upload failed');
			}

			processingStatus = 'Done!';
			await new Promise((r) => setTimeout(r, 300));

			// Notify parent that an image was uploaded (to refresh carousel)
			if (onImageUploaded) {
				onImageUploaded();
			}
			onClose();
		} catch (error) {
			processingError = error instanceof Error ? error.message : 'Upload failed';
			isProcessing = false;
		}
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
		<!-- Tier Selector - at top, hidden during processing -->
		{#if !isProcessing}
			<div class="tier-selector">
				<button
					class="tier-option"
					class:selected={selectedTier === 'ephemeral'}
					onclick={() => selectedTier = 'ephemeral'}
				>Ephemeral</button>
				<button
					class="tier-option"
					class:selected={selectedTier === 'persistent'}
					onclick={() => selectedTier = 'persistent'}
				>Persistent</button>
				<button
					class="tier-option"
					class:selected={selectedTier === 'canon'}
					onclick={() => selectedTier = 'canon'}
				>Canon</button>
			</div>
		{/if}

		<!-- Paste Area -->
		<div
			class="paste-area"
			class:dragging={isDragging}
			contenteditable={!isProcessing}
			onpaste={handlePaste}
			ondragover={handleDragOver}
			ondragenter={handleDragEnter}
			ondragleave={handleDragLeave}
			ondrop={handleDrop}
			data-placeholder={placeholder}
			bind:this={pasteAreaRef}
		></div>

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

	.paste-area.dragging {
		border: 2px dashed var(--accent);
		background: rgba(255, 255, 255, 0.02);
	}

	.paste-area.dragging:before {
		content: 'Drop image here...';
		opacity: 0.8;
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

	/* Tier Selector - segmented control at top */
	.tier-selector {
		display: flex;
		gap: 8px;
		margin-bottom: 12px;
	}

	.tier-option {
		flex: 1;
		padding: 8px 12px;
		background: transparent;
		border: 1px solid hsl(var(--border));
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s;
		font-size: 9pt;
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.tier-option:hover {
		border-color: hsl(var(--foreground) / 0.5);
	}

	.tier-option.selected {
		background: var(--accent);
		border-color: var(--accent);
		color: hsl(var(--background));
	}
</style>
