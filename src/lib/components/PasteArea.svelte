<script lang="ts">
	/**
	 * PasteArea - Content paste area
	 *
	 * Accepts HTML (Firefox Reader Mode), plain text (markdown, Claude docs),
	 * or drag & dropped images/PDFs. Two dropdowns: Lifecycle and Owner.
	 * Format is auto-detected. Default owner is "No One".
	 * Scan processing triggers for Felix-owned images.
	 */
	import { tick } from 'svelte';

	interface Props {
		onClose: () => void;
		onSuccess: (id: string, title: string, content: string, superjournalId?: string) => void;
		onPasteComplete?: (owner: string, lifecycle: string, fileId: string, chartId?: string) => void;
		lastOwner?: string;
		lastLifecycle?: string;
	}

	let { onClose, onSuccess, onPasteComplete, lastOwner = 'no-one', lastLifecycle = 'ephemeral' }: Props = $props();
	console.log('[PasteArea] Mounted with props:', { lastOwner, lastLifecycle });

	// Lifecycle: ephemeral (default) or persistent - initialized from last selection
	type Lifecycle = 'ephemeral' | 'persistent';
	let lifecycle = $state<Lifecycle>((lastLifecycle as Lifecycle) || 'ephemeral');

	// Owner: which persona owns this content - initialized from last selection
	type Owner = 'no-one' | 'felix' | 'gunnar' | 'kirby' | 'samara' | 'alicja' | 'eva' | 'ananya' | 'everyone';
	let owner = $state<Owner>((lastOwner as Owner) || 'no-one');
	console.log('[PasteArea] State initialized:', { owner, lifecycle });

	// Owner display names and colors
	const ownerConfig: Record<Owner, { label: string; color: string }> = {
		'no-one': { label: 'No One', color: 'hsl(var(--border))' },
		felix: { label: 'Felix', color: 'var(--felix-accent, #f59e0b)' },
		gunnar: { label: 'Gunnar', color: 'var(--gunnar-accent, #3b82f6)' },
		kirby: { label: 'Kirby', color: 'var(--kirby-accent, #ec4899)' },
		samara: { label: 'Samara', color: 'var(--samara-accent, #10b981)' },
		alicja: { label: 'Alicja', color: 'var(--alicja-accent, #8b5cf6)' },
		eva: { label: 'Eva', color: 'var(--eva-accent, #f43f5e)' },
		ananya: { label: 'Ananya', color: 'var(--ananya-accent, #06b6d4)' },
		everyone: { label: 'Everyone', color: 'var(--boss-accent)' }
	};
	let isProcessing = $state(false);
	let processingStatus = $state('');
	let processingError = $state<string | null>(null);
	let pastedContent = $state('');
	let pasteAreaRef: HTMLElement | null = $state(null);
	let isDragging = $state(false);
	let isFilePath = $state(false); // True when pasted content is an Obsidian file path

	// Detect if content is a file path (starts with /, ends with .md, single line)
	function detectFilePath(content: string): boolean {
		const trimmed = content.trim();
		return /^\/.*\.md$/.test(trimmed) && !trimmed.includes('\n');
	}

	// Auto-focus paste area on mount so cursor is ready
	$effect(() => {
		if (pasteAreaRef && !isProcessing) {
			pasteAreaRef.focus();
		}
	});

	// Placeholder text
	const placeholder = 'Paste content or drop images/PDFs here...';

	// Accent color based on owner
	const accentVar = $derived(ownerConfig[owner].color);

	// Supported image types
	const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

	// Supported document types (PDFs)
	const PDF_TYPE = 'application/pdf';

	async function handlePaste(event: ClipboardEvent) {
		event.preventDefault();

		const html = event.clipboardData?.getData('text/html');
		const text = event.clipboardData?.getData('text/plain');

		// Check if pasted text is a file path (Obsidian "Copy path")
		if (text && detectFilePath(text)) {
			isFilePath = true;
			pastedContent = text.trim();

			const pasteArea = event.target as HTMLElement;
			if (pasteArea) {
				pasteArea.textContent = text.trim();
			}

			await processFilePath(text.trim());
			return;
		}

		// Regular content paste
		isFilePath = false;

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

	async function processFilePath(sourcePath: string) {
		isProcessing = true;
		processingStatus = lifecycle === 'persistent' ? 'Linking and generating artisan cut...' : 'Linking to Obsidian file...';
		processingError = null;

		try {
			// Lifecycle determines tier - owner is passed separately
			const tier = lifecycle === 'persistent' ? 'strategic' : 'ephemeral';

			const response = await fetch('/api/chat/files', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					source_path: sourcePath,
					tier,
					owner
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error?.message || 'Failed to link file');
			}

			const data = await response.json();

			processingStatus = 'Linked!';
			await new Promise((r) => setTimeout(r, 300));

			// Success - close and notify parent
			const id = data.file_id || data.article_id || data.id;
			const title = data.title || 'Untitled';
			const responseContent = data.content || '';
			const superjournalId = data.superjournal_id;
			onSuccess(id, title, responseContent, superjournalId);
			// Save last selections and trigger auto-prompt for persona owners
			if (onPasteComplete) {
				console.log('[PasteArea:linkFile] onPasteComplete:', { owner, lifecycle, id });
				onPasteComplete(owner, lifecycle, id);
			}
			onClose();
		} catch (error) {
			processingError = error instanceof Error ? error.message : 'Failed to link file';
			isProcessing = false;
		}
	}

	async function processContent(content: string) {
		isProcessing = true;
		processingStatus = 'Extracting title...';
		processingError = null;

		try {
			processingStatus = lifecycle === 'persistent' ? 'Generating artisan cut...' : 'Processing...';

			// Lifecycle determines tier - owner is passed separately
			const tier = lifecycle === 'persistent' ? 'strategic' : 'ephemeral';

			const response = await fetch('/api/chat/files', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					content,
					tier,
					owner
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
			// Save last selections and trigger auto-prompt for persona owners
			if (onPasteComplete) {
				console.log('[PasteArea:processContent] onPasteComplete:', { owner, lifecycle, id });
				onPasteComplete(owner, lifecycle, id);
			}
			onClose();
		} catch (error) {
			processingError = error instanceof Error ? error.message : 'Upload failed';
			isProcessing = false;
		}
	}

	function handleRetry() {
		if (pastedContent) {
			if (isFilePath) {
				processFilePath(pastedContent);
			} else {
				processContent(pastedContent);
			}
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

		// Show spinner immediately to eliminate the "stuck" feeling
		isProcessing = true;
		processingStatus = 'Processing...';
		await tick(); // Force DOM update before async work

		// Check for PDF first
		const pdfFile = Array.from(files).find((f) => f.type === PDF_TYPE);
		if (pdfFile) {
			await processPdf(pdfFile);
			return;
		}

		// Get first image file
		const imageFile = Array.from(files).find((f) => IMAGE_TYPES.includes(f.type));
		if (!imageFile) {
			isProcessing = false;
			processingStatus = '';
			processingError = 'Please drop an image or PDF file';
			return;
		}

		// All images go through regular upload — no automatic Grok processing
		await uploadImage(imageFile);
	}

	async function uploadImage(file: File) {
		isProcessing = true;
		processingStatus = 'Uploading image...';
		processingError = null;

		try {
			const formData = new FormData();
			formData.append('image', file);

			// Pass owner (images ignore lifecycle)
			if (owner !== 'no-one') {
				formData.append('owner', owner);
			}

			const response = await fetch('/api/chat/files/upload', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error?.message || 'Upload failed');
			}

			const data = await response.json();

			processingStatus = 'Done!';
			await new Promise((r) => setTimeout(r, 300));

			// Success - close and notify parent (consistent with PDF/scan workflow)
			const id = data.file_id || data.id;
			const title = data.title || 'Uploaded Image';
			const content = data.content || '';
			const superjournalId = data.superjournal_id;
			const chartId = data.chart_id; // For vision API - images need chart_id, not article_id
			onSuccess(id, title, content, superjournalId);
			// Save last selections and trigger auto-prompt for persona owners
			// Pass chartId so images can be sent to vision API
			if (onPasteComplete) {
				console.log('[PasteArea:uploadImage] onPasteComplete:', { owner, lifecycle, id, chartId });
				onPasteComplete(owner, lifecycle, id, chartId);
			}
			onClose();
		} catch (error) {
			processingError = error instanceof Error ? error.message : 'Upload failed';
			isProcessing = false;
		}
	}

	async function processPdf(file: File) {
		isProcessing = true;
		processingStatus = 'Uploading PDF...';
		processingError = null;

		try {
			const formData = new FormData();
			formData.append('pdf', file);

			// Lifecycle determines tier - owner is passed separately
			const tier = lifecycle === 'persistent' ? 'strategic' : 'ephemeral';
			formData.append('tier', tier);
			formData.append('owner', owner);

			const response = await fetch('/api/chat/files/pdf', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error?.message || 'PDF processing failed');
			}

			processingStatus = 'Extracting text...';

			const data = await response.json();

			processingStatus = 'Done!';
			await new Promise((r) => setTimeout(r, 300));

			// Success - close and notify parent
			const id = data.file_id || data.article_id || data.id;
			const title = data.title || 'Untitled PDF';
			const content = data.content || '';
			const superjournalId = data.superjournal_id;
			onSuccess(id, title, content, superjournalId);
			// Save last selections and trigger auto-prompt for persona owners
			if (onPasteComplete) {
				console.log('[PasteArea:processPdf] onPasteComplete:', { owner, lifecycle, id });
				onPasteComplete(owner, lifecycle, id);
			}
			onClose();
		} catch (error) {
			processingError = error instanceof Error ? error.message : 'PDF processing failed';
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
		<!-- Dropdowns - at top, hidden during processing -->
		{#if !isProcessing}
			<div class="dropdown-row">
				<!-- Lifecycle Dropdown -->
				<div class="dropdown-group">
					<label class="dropdown-label" for="lifecycle-select">Lifecycle</label>
					<select
						id="lifecycle-select"
						class="dropdown"
						bind:value={lifecycle}
					>
						<option value="ephemeral">Raw</option>
						<option value="persistent">Artisan Cut</option>
					</select>
				</div>

				<!-- Owner Dropdown -->
				<div class="dropdown-group">
					<label class="dropdown-label" for="owner-select">Owner</label>
					<select
						id="owner-select"
						class="dropdown"
						bind:value={owner}
					>
						<option value="no-one">{ownerConfig['no-one'].label}</option>
						<option disabled>─────────</option>
						<option value="felix">{ownerConfig.felix.label}</option>
						<option value="gunnar">{ownerConfig.gunnar.label}</option>
						<option value="kirby">{ownerConfig.kirby.label}</option>
						<option value="samara">{ownerConfig.samara.label}</option>
						<option value="alicja">{ownerConfig.alicja.label}</option>
						<option value="eva">{ownerConfig.eva.label}</option>
						<option value="ananya">{ownerConfig.ananya.label}</option>
						<option disabled>─────────</option>
						<option value="everyone">{ownerConfig.everyone.label}</option>
					</select>
				</div>
			</div>
		{/if}

		<!-- Paste Area -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
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
			role="textbox"
			aria-label="Paste content here"
			aria-multiline="true"
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

	/* Dropdown Row - two dropdowns side by side */
	.dropdown-row {
		display: flex;
		gap: 16px;
		margin-bottom: 12px;
	}

	.dropdown-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex: 1;
	}

	.dropdown-label {
		font-size: 8pt;
		color: hsl(var(--foreground) / 0.6);
	}

	.dropdown {
		padding: 8px 12px;
		background: transparent;
		border: 1px solid hsl(var(--border));
		border-radius: 6px;
		cursor: pointer;
		font-size: 8pt;
		font-weight: 500;
		color: hsl(var(--foreground));
		appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 10px center;
		padding-right: 32px;
	}

	.dropdown:hover {
		border-color: hsl(var(--foreground) / 0.5);
	}

	.dropdown:focus {
		outline: none;
		border-color: var(--accent);
	}

	.dropdown option {
		background: hsl(var(--background));
		color: hsl(var(--foreground));
	}

</style>
