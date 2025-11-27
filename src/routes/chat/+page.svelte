<script lang="ts">
	import { Icon } from 'svelte-icons-pack';
	import { LuStar, LuCopy, LuTrash2, LuPaperclip, LuFolder, LuChevronDown, LuCloudDownload, LuEllipsisVertical, LuFlame } from 'svelte-icons-pack/lu';
	import { currentMessage, isLoading, sendMessage, abortCurrentMessage } from '$lib/stores/chat';
	import { tick, onMount } from 'svelte';
	import { TIMING } from '$lib/config/timing';
	import { DEFAULT_PERSONA } from '$lib/config/personas';
	import { renderMarkdown } from '$lib/markdown-renderer';
	import { CHAT_CONFIG, scrollToTurn, scrollToBottom, getTurns } from '$lib/ui/scroll';
	import ScrollControls from '$lib/components/ScrollControls.svelte';

	// Receive loaded messages from server
	let { data } = $props();
	// Reverse to show oldest first (most recent at bottom)
	let allMessages = $state([...(data.messages || [])].reverse());
	// Track starred message IDs
	let starredIds = $state(new Set<string>(data.starredIds || []));

	let inputMessage = $state('');
	let messagesEndRef: HTMLDivElement;
	let showNukeConfirm = $state(false);
	let nukeProgress = $state(0);
	let nukeTimer: number | null = null;

	// User settings state
	let selectedPersona = $state<'gunnar' | 'kirby'>(DEFAULT_PERSONA);

	// Message deletion state
	let deleteMessageId = $state<string | null>(null);
	let deleteMessageProgress = $state(0);
	let deleteMessageTimer: number | null = null;

	// Load user settings on mount
	onMount(async () => {
		// Persist mode to localStorage
		if (typeof window !== 'undefined') {
			localStorage.setItem('asura_app_mode', 'chat');
		}

		try {
			const response = await fetch('/api/settings');
			if (response.ok) {
				const data = await response.json();
				selectedPersona = data.selected_persona || DEFAULT_PERSONA;
			}
		} catch (error) {
			console.error('Failed to load settings:', error);
			// Fallback to defaults if database read fails
		}
	});

	// Helper function to format timestamps
	function formatTimestamp(dateString: string) {
		const date = new Date(dateString);
		return date.toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		});
	}

	// Behavior 1: Auto-switch dropdown when typing persona name at start
	$effect(() => {
		const normalized = inputMessage.trim().toLowerCase();
		if (normalized.startsWith('gunnar')) {
			selectedPersona = 'gunnar';
		} else if (normalized.startsWith('kirby')) {
			selectedPersona = 'kirby';
		}
	});

	// Behavior 2: Toggle persona dropdown and insert name in input
	async function togglePersona() {
		selectedPersona = selectedPersona === 'gunnar' ? 'kirby' : 'gunnar';

		// Insert persona name into input field
		const name = selectedPersona.charAt(0).toUpperCase() + selectedPersona.slice(1);
		inputMessage = `${name}, ${inputMessage}`;

		// Write to database - only update persona, preserve model settings
		try {
			await fetch('/api/settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					selected_persona: selectedPersona
				})
			});
		} catch (error) {
			console.error('Failed to save persona:', error);
		}
	}

	// Watch for new messages and scroll to boss card
	let lastScrolledMessageId: string | null = null;

	$effect(() => {
		if ($currentMessage && $currentMessage.id !== lastScrolledMessageId) {
			// Only scroll once when boss card first appears
			lastScrolledMessageId = $currentMessage.id;

			// Wait for DOM to render, then scroll to new boss card
			tick().then(() => {
				requestAnimationFrame(() => {
					requestAnimationFrame(() => {
						const turns = getTurns(CHAT_CONFIG);
						if (turns.length === 0) return;

						const lastTurn = turns[turns.length - 1];
						scrollToTurn(CHAT_CONFIG, lastTurn);
					});
				});
			});
		}

	});

	// Scroll to bottom on initial load
	onMount(() => {
		if (allMessages.length > 0) {
			scrollToBottom(CHAT_CONFIG);
		}
	});

	async function handleSend() {
		if (!inputMessage.trim() || $isLoading) return;

		const message = inputMessage.trim();
		inputMessage = '';

		// Send message and wait for response
		await sendMessage(message, selectedPersona);

		// Add the completed message to allMessages
		if ($currentMessage) {
			const now = new Date().toISOString();
			const formattedTimestamp = formatTimestamp(now);

			allMessages = [...allMessages, {
				id: crypto.randomUUID(),
				user_message: $currentMessage.boss,
				ai_response: $currentMessage.ai,
				persona_name: selectedPersona,
				created_at: now,
				formatted_timestamp: formattedTimestamp,
				model_identifier: $currentMessage.model_identifier
			}];

			// Clear current message after adding to history
			currentMessage.set(null);
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSend();
		}
	}


	function handleMessageDeleteClick(messageId: string) {
		deleteMessageId = messageId;
		deleteMessageProgress = 0;

		// Auto-confirm after 3 seconds
		const duration = TIMING.countdownDuration;
		const interval = 50;
		const increment = (interval / duration) * 100;

		deleteMessageTimer = window.setInterval(() => {
			deleteMessageProgress += increment;
			if (deleteMessageProgress >= 100) {
				if (deleteMessageTimer) clearInterval(deleteMessageTimer);
				handleMessageDeleteConfirm();
			}
		}, interval);
	}

	function handleMessageDeleteCancel() {
		if (deleteMessageTimer) {
			clearInterval(deleteMessageTimer);
			deleteMessageTimer = null;
		}
		deleteMessageId = null;
		deleteMessageProgress = 0;
	}

	async function handleMessageDeleteConfirm() {
		if (deleteMessageTimer) {
			clearInterval(deleteMessageTimer);
			deleteMessageTimer = null;
		}
		const messageId = deleteMessageId;
		deleteMessageId = null;
		deleteMessageProgress = 0;

		if (messageId) {
			try {
				const response = await fetch(`/api/superjournal/${messageId}`, {
					method: 'DELETE'
				});
				if (!response.ok) throw new Error('Delete failed');
				console.log('[Message] Deleted superjournal entry:', messageId);
				// Remove from local state
				allMessages = allMessages.filter(msg => msg.id !== messageId);
			} catch (err) {
				console.error('[Message] Delete failed:', err);
			}
		}
	}

	function handleAbortCurrentMessage() {
		// Use the abort function from chat store (supports AbortController)
		abortCurrentMessage();
		console.log('[Abort] Current message aborted');
	}

	// Track which message is showing "copied" feedback
	let copiedMessageId = $state<string | null>(null);

	async function handleCopyTurn(messageId: string, userMessage: string, aiResponse: string, personaName: string) {
		// Clean up excessive newlines - collapse to single newline
		const cleanResponse = aiResponse.replace(/\n{2,}/g, '\n').trim();
		const cleanMessage = userMessage.trim();
		const text = `Boss: ${cleanMessage}\n\n${personaName.charAt(0).toUpperCase() + personaName.slice(1)}: ${cleanResponse}`;
		await navigator.clipboard.writeText(text);

		// Show visual feedback briefly
		copiedMessageId = messageId;
		setTimeout(() => {
			if (copiedMessageId === messageId) copiedMessageId = null;
		}, 1500);
	}

	async function handleStarToggle(messageId: string) {
		// Optimistic update - toggle immediately
		const wasStarred = starredIds.has(messageId);
		if (wasStarred) {
			starredIds = new Set([...starredIds].filter(id => id !== messageId));
		} else {
			starredIds = new Set([...starredIds, messageId]);
		}

		// Fire and forget - API handles waiting for journal entry if needed
		fetch(`/api/superjournal/${messageId}`, { method: 'PATCH' })
			.then(response => response.json())
			.then(result => {
				// Sync with server state in case of mismatch
				if (result.is_starred !== undefined) {
					if (result.is_starred && !starredIds.has(messageId)) {
						starredIds = new Set([...starredIds, messageId]);
					} else if (!result.is_starred && starredIds.has(messageId)) {
						starredIds = new Set([...starredIds].filter(id => id !== messageId));
					}
				}
			})
			.catch(() => {
				// Revert on failure
				if (wasStarred) {
					starredIds = new Set([...starredIds, messageId]);
				} else {
					starredIds = new Set([...starredIds].filter(id => id !== messageId));
				}
			});
	}

	function handleNukeClick() {
		showNukeConfirm = true;
		nukeProgress = 0;

		// Auto-confirm after 3 seconds
		const duration = TIMING.countdownDuration;
		const interval = 50;
		const increment = (interval / duration) * 100;

		nukeTimer = window.setInterval(() => {
			nukeProgress += increment;
			if (nukeProgress >= 100) {
				if (nukeTimer) clearInterval(nukeTimer);
				handleNukeConfirm();
			}
		}, interval);
	}

	function handleNukeCancel() {
		if (nukeTimer) {
			clearInterval(nukeTimer);
			nukeTimer = null;
		}
		showNukeConfirm = false;
		nukeProgress = 0;
	}

	async function handleNukeConfirm() {
		if (nukeTimer) {
			clearInterval(nukeTimer);
			nukeTimer = null;
		}
		showNukeConfirm = false;
		nukeProgress = 0;

		try {
			const response = await fetch('/api/nuke', {
				method: 'POST'
			});

			if (!response.ok) {
				throw new Error('Failed to nuke database');
			}

			// Clear local messages
			allMessages = [];
			currentMessage.set(null);
		} catch (error) {
			console.error('Nuke error:', error);
		}
	}


</script>

<div class="chat-container">
	<!-- Messages Area -->
	<div class="messages-area">
		<div class="messages-content">
			{#each allMessages as msg, index}
				<!-- Boss Message -->
				<div class="message-group">
					<div class="boss-message">
						<!-- Turn Indicator -->
						<div class="turn-indicator">turn {index + 1}</div>

						<div class="message-header">
							<span class="message-label boss-label">Boss</span>
							<div class="message-actions">
								<div class="action-icons">
									<button class="action-btn" class:starred={starredIds.has(msg.id)} title={starredIds.has(msg.id) ? 'Unstar' : 'Star'} onclick={() => handleStarToggle(msg.id)}><Icon src={LuStar} size="11" /></button>
									<button class="action-btn" class:copied={copiedMessageId === msg.id} title="Copy" onclick={() => handleCopyTurn(msg.id, msg.user_message, msg.ai_response, msg.persona_name)}><Icon src={LuCopy} size="11" /></button>
									<button class="action-btn" title="Delete" onclick={() => handleMessageDeleteClick(msg.id)}><Icon src={LuTrash2} size="11" /></button>
								</div>
								<span class="timestamp">{msg.formatted_timestamp}</span>
							</div>
						</div>
						<div class="message-text">{msg.user_message}</div>
					</div>
				</div>

				<!-- AI Response -->
				<div class="message-group">
					<div class="ai-message">
						<div class="message-header">
							<span class="message-label ai-label">{msg.persona_name.charAt(0).toUpperCase() + msg.persona_name.slice(1)}</span>
						</div>
						<div class="message-text">
							{@html renderMarkdown(msg.ai_response)}
						</div>
					</div>
				</div>
			{/each}

			<!-- Show loading state for new message being sent -->
			{#if $isLoading && $currentMessage}
				<!-- Boss Message -->
				<div class="message-group">
					<div class="boss-message">
						<div class="turn-indicator">turn {allMessages.length + 1}</div>

						<div class="message-header">
							<span class="message-label boss-label">Boss</span>
							<div class="message-actions">
								<div class="action-icons">
									<button class="action-btn" title="Star"><Icon src={LuStar} size="11" /></button>
									<button class="action-btn" title="Copy"><Icon src={LuCopy} size="11" /></button>
									<button class="action-btn" title="Abort" onclick={handleAbortCurrentMessage}><Icon src={LuTrash2} size="11" /></button>
								</div>
								<span class="timestamp">{$currentMessage.timestamp}</span>
							</div>
						</div>
						<div class="message-text">{$currentMessage.boss}</div>
					</div>
				</div>

				<!-- AI Response Loading -->
				<div class="message-group">
					<div class="ai-message">
						<div class="message-header">
							<span class="message-label ai-label">{selectedPersona.charAt(0).toUpperCase() + selectedPersona.slice(1)}</span>
						</div>
						<div class="message-text loading-text">
							Thinking<span class="dots"><span>.</span><span>.</span><span>.</span></span>
						</div>
					</div>
				</div>
			{/if}

			<!-- Scroll anchor -->
			<div bind:this={messagesEndRef}></div>
		</div>
	</div>

	<!-- Input Area -->
	<div class="input-area">
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

					<div class="persona-dropdown" onclick={() => togglePersona()}>
						<span class="persona-name">{selectedPersona.charAt(0).toUpperCase() + selectedPersona.slice(1)}</span>
						<Icon src={LuChevronDown} size="11" />
					</div>

					<div class="icon-group">
						<ScrollControls config={CHAT_CONFIG} />
					</div>

					<button class="control-btn settings-btn" title="Nuke all history" onclick={handleNukeClick}><Icon src={LuFlame} size="11" /></button>
				</div>
				<input
					type="text"
					placeholder="Type your message..."
					class="message-input"
					bind:value={inputMessage}
					onkeydown={handleKeyDown}
					disabled={$isLoading}
				/>
			</div>
			<button class="send-button" onclick={handleSend} disabled={$isLoading}>
				{$isLoading ? 'Sending...' : 'Send'}
			</button>
		</div>
	</div>


	<!-- Message Delete Confirmation Modal -->
	{#if deleteMessageId}
		<div class="modal-overlay" onclick={handleMessageDeleteCancel}>
			<div class="modal-content" onclick={(e) => e.stopPropagation()}>
				<p class="modal-text">Hush... it'll all be over soon.</p>
				<div class="nuke-progress-container">
					<div class="nuke-progress-bar" style="width: {deleteMessageProgress}%"></div>
				</div>
				<div class="nuke-actions">
					<button class="nuke-cancel-btn" onclick={handleMessageDeleteCancel}>Cancel</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Nuke Confirmation Modal -->
	{#if showNukeConfirm}
		<div class="modal-overlay" onclick={handleNukeCancel}>
			<div class="modal-content" onclick={(e) => e.stopPropagation()}>
				<p class="modal-text">Hush... it'll all be over soon.</p>
				<div class="nuke-progress-container">
					<div class="nuke-progress-bar" style="width: {nukeProgress}%"></div>
				</div>
				<div class="nuke-actions">
					<button class="nuke-cancel-btn" onclick={handleNukeCancel}>Cancel</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Canvas Area - blank for now -->
	<div class="canvas-area"></div>

</div>

<style>
	/* Main Layout - Two-column grid (chat left, canvas right) */
	.chat-container {
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
		.chat-container {
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

	/* Turn Indicator */
	.turn-indicator {
		color: hsl(var(--muted-foreground));
		opacity: 0.3;
		margin-bottom: 12px;
		text-transform: capitalize;
		letter-spacing: 0.5px;
		font-size: 0.85em;
	}

	/* Message Groups */
	.message-group {
		position: relative;
		margin-bottom: 16px;
	}

	/* Boss Message - with background card */
	.boss-message {
		background: var(--boss-bg);
		padding: var(--boss-card-padding-y) var(--boss-card-padding-x);
		margin-left: var(--boss-card-margin-x);
		margin-right: var(--boss-card-margin-x);
		border-radius: var(--boss-card-border-radius);
		position: relative;
	}

	/* AI Message - no background */
	.ai-message {
		position: relative;
		padding: var(--message-padding-y) var(--boss-card-padding-x);
	}

	/* Message Header */
	.message-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
		position: relative;
	}

	/* Message Labels */
	.message-label {
		font-weight: 500;
		color: hsl(var(--chat-label));
		display: block;
		width: 100%;
		padding-bottom: 2px;
	}

	.boss-label {
		color: var(--boss-accent);
		border-bottom: 1px solid var(--boss-accent);
		position: relative;
		top: -1px;
	}

	.ai-label {
		color: hsl(var(--foreground));
		border-bottom: 1px solid hsl(var(--border));
	}

	/* Message Actions - explicitly positioned */
	.message-actions {
		display: flex;
		align-items: center;
		gap: var(--action-icon-gap);
		position: absolute;
		right: 0;
		top: 0;
	}

	.action-icons {
		display: flex;
		align-items: baseline;
		gap: var(--action-icon-gap);
	}

	.action-btn {
		background: transparent;
		border: none;
		cursor: pointer;
		opacity: 0.6;
		transition: opacity 0.2s;
		padding: 4px;
		display: inline-flex;
		align-items: center;
		margin-top: -4px;
		min-width: 19px;
		min-height: 19px;
		justify-content: center;
	}

	.action-btn:hover {
		opacity: 1;
	}

	.action-btn.starred {
		opacity: 1;
		color: rgb(217, 133, 107);
	}

	.action-btn.starred :global(svg) {
		fill: rgb(217, 133, 107);
	}

	.action-btn.copied {
		opacity: 1;
		color: rgb(217, 133, 107);
	}

	.action-btn.copied :global(svg) {
		fill: rgb(217, 133, 107);
	}

	.timestamp {
		color: hsl(var(--muted-foreground));
		opacity: 0.7;
		margin-left: 8px;
		font-family: Menlo, Monaco, 'Courier New', monospace;
		font-size: 0.85em;
	}

	/* Message Text */
	.message-text {
		line-height: 1.6;
		color: hsl(var(--foreground));
		white-space: normal;
	}

	/* Input Area - explicitly positioned at bottom */
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

	.control-btn.active {
		opacity: 1;
		color: var(--boss-accent);
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
		color: var(--boss-accent);
		border: 1px solid var(--boss-accent);
		border-radius: 6px;
		padding: 12px 24px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.send-button:hover {
		background: var(--boss-accent);
		color: hsl(var(--background));
	}

	/* Hide scrollbar */
	.messages-area::-webkit-scrollbar {
		display: none;
	}

	.messages-area {
		-ms-overflow-style: none;  /* IE and Edge */
		scrollbar-width: none;  /* Firefox */
	}

	/* Loading dots animation */
	.loading-text {
		opacity: 0.7;
	}

	.dots {
		display: inline-block;
	}

	.dots span {
		animation: pulse 1.4s infinite;
		opacity: 0;
	}

	.dots span:nth-child(1) {
		animation-delay: 0s;
	}

	.dots span:nth-child(2) {
		animation-delay: 0.2s;
	}

	.dots span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes pulse {
		0%, 60%, 100% {
			opacity: 0;
		}
		30% {
			opacity: 1;
		}
	}

	.message-input:disabled,
	.send-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.send-button:hover:not(:disabled) {
		background: var(--boss-accent);
		color: hsl(var(--background));
	}

	/* Nuke Confirmation Modal */
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

	.nuke-progress-bar {
		height: 100%;
		background: #991b1b;
	}

	.nuke-progress-container {
		width: 60%;
		height: 6px;
		background: hsl(var(--border));
		border-radius: 2px;
		overflow: hidden;
		margin: 0 auto 24px auto;
	}

	.nuke-actions {
		display: flex;
		justify-content: center;
	}

	.nuke-cancel-btn {
		background: transparent;
		color: var(--boss-accent);
		border: 1px solid var(--boss-accent);
		border-radius: 6px;
		padding: 12px 24px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.nuke-cancel-btn:hover {
		background: var(--boss-accent);
		color: hsl(var(--background));
	}

	.modal-btn {
		padding: 8px 16px;
		border-radius: 4px;
		border: none;
		cursor: pointer;
		font-size: 14px;
		transition: all 0.2s;
	}

	.modal-btn-cancel {
		background: transparent;
		color: hsl(var(--muted-foreground));
		border: 1px solid hsl(var(--border));
	}

	.modal-btn-cancel:hover {
		background: hsl(var(--muted) / 0.1);
	}

</style>
