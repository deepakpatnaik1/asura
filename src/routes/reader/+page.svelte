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
</script>

<div class="reader-container">
	<!-- Messages Area -->
	<div class="messages-area">
		<div class="messages-content">
			<!-- Reader mode content would render here -->
			<!-- Example structure when note is selected:
			{#if selectedNote}
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
			{/if}
			-->

			<!-- Placeholder content -->
			<div class="placeholder-content">
				<h1>E-Reader Mode</h1>
				<p>The UI shell has been restored.</p>
				<p>Click the library sidebar to view articles (coming soon).</p>
			</div>
		</div>
	</div>

	<!-- Input Area -->
	<div class="input-area" data-mode="reader">
		<div class="input-container">
			<div class="input-field-wrapper">
				<div class="input-controls">
					<!-- Paperclip icon (decorative only) -->
					<button class="control-btn" title="Attach file (disabled)" disabled>
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
	/* Main Layout - Three-column grid */
	.reader-container {
		display: grid;
		grid-template-rows: 1fr auto;
		grid-template-columns: 1fr min(var(--middle-section-width), 100%) 1fr;
		grid-template-areas:
			'left-blank messages right-blank'
			'input input input';
		height: 100vh;
		overflow-y: auto;
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		position: relative;
	}

	/* Responsive adjustments for narrow screens */
	@media (max-width: 900px) {
		.reader-container {
			grid-template-columns: 0 1fr 0;
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
		padding: 0 24px;
	}

	/* Adjust input padding on narrow screens to account for reader-container padding */
	@media (max-width: 900px) {
		.input-container {
			padding: 0;
		}
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
</style>
