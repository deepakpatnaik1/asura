<script lang="ts">
	import { onMount } from 'svelte';
	import { renderMarkdown } from '$lib/markdown-renderer';
	import { Icon } from 'svelte-icons-pack';
	import { LuPaperclip, LuFolder, LuCloudDownload, LuChevronDown, LuArrowDown, LuArrowUp, LuMessageSquare, LuFlame } from 'svelte-icons-pack/lu';

	// Persist mode to localStorage
	onMount(() => {
		if (typeof window !== 'undefined') {
			localStorage.setItem('asura_app_mode', 'reader');
		}
	});

	// Placeholder state for future implementation
	let selectedNote = $state<any>(null);
	let selectedPersona = $state<'gunnar' | 'kirby'>('gunnar');
	let inputMessage = $state('');

	// Paste area state
	let showPasteArea = $state(false);
	let pasteAreaContent = $state('');
	let isProcessing = $state(true); // Set to true to show spinner for demo

	// Toggle paste area
	function handlePaperclipClick() {
		showPasteArea = !showPasteArea;
		if (showPasteArea) {
			// Clear any existing article
			selectedNote = null;
		}
	}

	// Handle paste event
	function handlePaste(event: ClipboardEvent) {
		event.preventDefault();

		const html = event.clipboardData?.getData('text/html');
		if (html) {
			console.log('[Paste] HTML content received:', html.substring(0, 200));

			// Create a temporary div to parse the HTML
			const temp = document.createElement('div');
			temp.innerHTML = html;

			// Remove all style attributes and color-related inline styles
			const allElements = temp.querySelectorAll('*');
			allElements.forEach((el) => {
				el.removeAttribute('style');
				el.removeAttribute('color');
				el.removeAttribute('bgcolor');
			});

			// Insert the cleaned HTML
			const pasteArea = event.target as HTMLElement;
			if (pasteArea) {
				pasteArea.innerHTML = temp.innerHTML;
			}

			// TODO: Start processing pipeline
		}
	}
</script>

<div class="reader-container">
	<!-- Messages Area -->
	<div class="messages-area">
		<div class="messages-content">
			<!-- Paste Area Card -->
			<div class="paste-box">
				{#if isProcessing}
					<!-- Loading Spinner -->
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
					</div>
				{/if}
				<div
					class="paste-area"
					contenteditable="true"
					onpaste={handlePaste}
					data-placeholder="Paste article here..."
				></div>
			</div>

			{#if selectedNote}
				<!-- Article Display (future) -->
				<div class="message-group" data-role="boss">
					<div class="boss-message" data-mode="reader">
						<div class="message-header">
							<span class="boss-label" data-mode="reader">BOSS</span>
						</div>
						<div class="message-text">
							Let's explore: {selectedNote.title}
						</div>
					</div>
				</div>

				<div class="message-group" data-role="gunnar">
					<div class="gunnar-message">
						<div class="message-header">
							<span class="gunnar-label">GUNNAR</span>
						</div>
						<div class="message-text">
							{@html renderMarkdown(selectedNote.transformed_content, 'reader')}
						</div>
					</div>
				</div>
			{:else}
				<!-- Placeholder content -->
				<div class="placeholder-content">
					<h1>E-Reader Mode</h1>
					<p>The UI shell has been restored.</p>
					<p>Library coming soon.</p>
				</div>
			{/if}
		</div>
	</div>

	<!-- Canvas Area - blank for now -->
	<div class="canvas-area"></div>

	<!-- Input Area -->
	<div class="input-area" data-mode="reader">
		<div class="input-container">
			<div class="input-field-wrapper">
				<div class="input-controls">
					<!-- Paperclip icon (active - triggers paste area) -->
					<button class="control-btn" title="Paste article" onclick={handlePaperclipClick}>
						<Icon src={LuPaperclip} size="11" />
					</button>

					<!-- Folder icon (decorative only) -->
					<button class="control-btn" title="Files (disabled)" disabled>
						<Icon src={LuFolder} size="11" />
					</button>

					<button class="control-btn" title="Download from cloud"><Icon src={LuCloudDownload} size="11" /></button>

					<div class="persona-dropdown">
						<span class="persona-name">{selectedPersona.charAt(0).toUpperCase() + selectedPersona.slice(1)}</span>
						<Icon src={LuChevronDown} size="11" />
					</div>

					<div class="icon-group">
						<button class="control-btn" title="Auto-scroll">
							<svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
								<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/>
							</svg>
						</button>
						<button class="control-btn" title="Next turn"><Icon src={LuArrowDown} size="11" /></button>
						<button class="control-btn" title="Previous turn"><Icon src={LuArrowUp} size="11" /></button>
						<button class="control-btn" title="Messages"><Icon src={LuMessageSquare} size="11" /></button>
					</div>

					<button class="control-btn settings-btn" title="Nuke all history"><Icon src={LuFlame} size="11" /></button>
				</div>
				<input
					type="text"
					placeholder="Type your message..."
					class="message-input"
					bind:value={inputMessage}
				/>
			</div>
			<button class="send-button">
				Send
			</button>
		</div>
	</div>
</div>

<style>
	/* Main Layout - Two-column grid (reader left, canvas right) */
	.reader-container {
		display: grid;
		grid-template-rows: 1fr auto;
		grid-template-columns: var(--middle-section-width) 1fr;
		grid-template-areas:
			'messages canvas'
			'input canvas';
		height: 100vh;
		margin-left: 60px; /* Account for sidebar */
		overflow-y: auto;
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		position: relative;
	}

	/* Canvas area - blank for now */
	.canvas-area {
		grid-area: canvas;
		background: hsl(var(--background));
	}

	/* Responsive adjustments for narrow screens */
	@media (max-width: 900px) {
		.reader-container {
			grid-template-columns: 1fr 0;
			margin-left: 0;
			padding: 0 16px;
		}

		.messages-content {
			max-width: var(--middle-section-width);
			margin: 0 auto;
		}
	}

	/* Messages Area - middle column */
	.messages-area {
		grid-area: messages;
		padding: 24px;
		position: relative;
	}

	.messages-content {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--message-gap);
	}

	/* Placeholder content */
	.placeholder-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 60vh;
		text-align: center;
	}

	.placeholder-content h1 {
		color: var(--reader-accent);
		margin-bottom: 16px;
	}

	.placeholder-content p {
		color: hsl(var(--muted-foreground));
		margin: 8px 0;
	}

	/* Message Groups (for future use) */
	.message-group {
		position: relative;
		margin-bottom: 16px;
	}

	/* Boss Message - reader mode styling */
	.boss-message[data-mode="reader"] {
		background: var(--reader-bg);
		padding: var(--boss-card-padding-y) var(--boss-card-padding-x);
		margin-left: var(--boss-card-margin-x);
		margin-right: var(--boss-card-margin-x);
		border-radius: var(--boss-card-border-radius);
		border-left: 3px solid var(--reader-accent);
	}

	/* Boss label - reader mode color */
	.boss-label[data-mode="reader"] {
		color: var(--reader-accent);
		border-bottom: 1px solid var(--reader-accent);
	}

	/* Message Header */
	.message-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}

	.message-text {
		line-height: 1.6;
		color: hsl(var(--foreground));
		white-space: normal;
	}

	/* Input Area - reader mode styling */
	.input-area {
		grid-area: input;
		background: hsl(var(--card));
		border-top: 1px solid hsl(var(--chat-border));
		border-right: 1px solid hsl(var(--chat-border));
		padding: 16px 24px;
		position: sticky;
		bottom: 0;
		z-index: 10;
	}

	.input-container {
		display: flex;
		gap: 12px;
		align-items: flex-end;
		max-width: var(--middle-section-width);
		margin: 0 auto;
		width: 100%;
	}

	.input-field-wrapper {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.input-controls {
		display: flex;
		align-items: center;
		gap: var(--action-icon-gap);
		margin-bottom: 0px;
		flex-wrap: nowrap;
		overflow-x: auto;
	}

	.control-btn {
		background: transparent;
		border: none;
		cursor: pointer;
		opacity: 0.7;
		transition: opacity 0.2s;
		padding: 4px;
	}

	.control-btn:hover {
		opacity: 1;
	}

	.persona-dropdown {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-left: 4px;
		cursor: pointer;
		opacity: 0.7;
		transition: opacity 0.2s;
		padding: 4px;
		flex-shrink: 0;
	}

	.persona-dropdown:hover {
		opacity: 1;
	}

	.persona-name {
		font-size: 1em;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 80px;
	}

	.icon-group {
		display: flex;
		align-items: center;
		gap: var(--action-icon-gap);
		margin-left: 12px;
	}

	.settings-btn {
		color: rgb(239, 68, 68);
	}

	.settings-btn:hover {
		color: rgb(220, 38, 38);
	}

	/* On wide screens, push fire icon to the right */
	@media (min-width: 901px) {
		.settings-btn {
			margin-left: auto;
		}
	}

	.message-input {
		flex: 1;
		background: hsl(var(--input));
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--border));
		border-radius: 6px;
		padding: 12px 16px;
		outline: none;
		transition: border-color 0.2s;
	}

	.message-input:focus {
		border-color: hsl(var(--ring));
	}

	.message-input::placeholder {
		color: hsl(var(--muted-foreground));
		opacity: 0.6;
	}

	.send-button {
		background: transparent;
		color: var(--reader-accent);
		border: 1px solid var(--reader-accent);
		border-radius: 6px;
		padding: 12px 24px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.send-button:hover {
		background: var(--reader-accent);
		color: hsl(var(--background));
	}

	.message-input:disabled,
	.send-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.send-button:hover:not(:disabled) {
		background: var(--reader-accent);
		color: hsl(var(--background));
	}

	/* Paste Area Box - styled for reader mode */
	.paste-box {
		background: rgba(10, 10, 10, 0.85);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid var(--reader-accent);
		padding: var(--boss-card-padding-y) var(--boss-card-padding-x);
		margin-left: var(--boss-card-margin-x);
		margin-right: var(--boss-card-margin-x);
		border-radius: var(--boss-card-border-radius);
		min-height: 300px;
		position: absolute;
		bottom: 80px;
		left: 24px;
		right: 24px;
	}

	/* Frosted glass overlay */
	.paste-box::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(255, 255, 255, 0.03);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border-radius: var(--boss-card-border-radius);
		pointer-events: none;
		z-index: 10;
	}

	/* Paste Area - contenteditable div */
	.paste-area {
		height: 260px;
		overflow-y: auto;
		color: hsl(var(--foreground));
		font-size: 8pt;
		line-height: 1.6;
		outline: none;
		white-space: normal;
		position: relative;
		z-index: 1;
	}

	.paste-area:empty:before {
		content: attr(data-placeholder);
		color: hsl(var(--foreground));
		opacity: 0.5;
		font-size: 8pt;
	}

	/* Override all inline styles for pasted content */
	.paste-area *,
	.paste-area span,
	.paste-area p,
	.paste-area div,
	.paste-area a {
		color: hsl(var(--foreground)) !important;
		background-color: transparent !important;
		font-size: 8pt !important;
		line-height: 1.6 !important;
		font-family: "iA Writer Quattro V", system-ui, -apple-system, sans-serif !important;
	}

	/* Style pasted images */
	.paste-area img {
		max-width: 100%;
		height: auto;
		display: block;
		margin: 12px 0;
		border-radius: 4px;
	}

	/* Loading Spinner */
	.spinner-container {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 11; /* Above frosted glass overlay (z-index: 10) */
		pointer-events: none;
	}

	.spinner {
		width: 36px;
		height: 36px;
		position: relative;
		animation: spin 1.2s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
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
</style>
