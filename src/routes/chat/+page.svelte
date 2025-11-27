<script lang="ts">
	import { Icon } from 'svelte-icons-pack';
	import { LuPaperclip, LuFolder, LuCloudDownload, LuFlame } from 'svelte-icons-pack/lu';
	import { currentMessage, isLoading, sendMessage, abortCurrentMessage } from '$lib/stores/chat';
	import { tick, onMount } from 'svelte';
	import { DEFAULT_PERSONA } from '$lib/config/personas';
	import { CHAT_CONFIG, scrollToTurn, scrollToBottom, getTurns } from '$lib/ui/scroll';
	import { createConfirmation } from '$lib/composables';
	import ScrollControls from '$lib/components/ScrollControls.svelte';
	import MessageGroup from '$lib/components/MessageGroup.svelte';
	import ConfirmationModal from '$lib/components/ConfirmationModal.svelte';
	import PersonaDropdown from '$lib/components/PersonaDropdown.svelte';
	import InputBar from '$lib/components/InputBar.svelte';

	// Receive loaded messages from server
	let { data } = $props();
	// Reverse to show oldest first (most recent at bottom)
	let allMessages = $state([...(data.messages || [])].reverse());
	// Track starred message IDs
	let starredIds = $state(new Set<string>(data.starredIds || []));

	let inputMessage = $state('');
	let messagesEndRef: HTMLDivElement;
	let textareaRef: HTMLTextAreaElement;

	// User settings state
	let selectedPersona = $state<'gunnar' | 'kirby'>(DEFAULT_PERSONA);

	// Confirmation composables (replaces manual timer state)
	const nukeConfirm = createConfirmation();
	const deleteConfirm = createConfirmation();

	// Load user settings on mount and trigger orphan recovery
	onMount(async () => {
		// Persist mode to localStorage
		if (typeof window !== 'undefined') {
			localStorage.setItem('asura_app_mode', 'chat');
		}

		try {
			const response = await fetch('/api/settings');
			if (response.ok) {
				const settingsData = await response.json();
				selectedPersona = settingsData.selected_persona || DEFAULT_PERSONA;
			}
		} catch (error) {
			console.error('Failed to load settings:', error);
			// Fallback to defaults if database read fails
		}

		// Trigger orphan recovery for any failed compressions
		if (data.orphans && data.orphans.length > 0) {
			for (const orphan of data.orphans) {
				try {
					await fetch('/api/chat/compress', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(orphan)
					});
				} catch (error) {
					console.error('[Orphan Recovery] Failed to recover:', orphan.superjournal_id, error);
				}
			}
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
		resetTextareaHeight();

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

	// Auto-resize textarea to fit content
	function autoResize() {
		if (!textareaRef) return;
		textareaRef.style.height = 'auto';
		textareaRef.style.height = Math.min(textareaRef.scrollHeight, 200) + 'px';
	}

	// Reset textarea height after sending
	function resetTextareaHeight() {
		if (!textareaRef) return;
		textareaRef.style.height = 'auto';
	}

	function handleMessageDeleteClick(messageId: string) {
		deleteConfirm.start(messageId, async () => {
			try {
				const response = await fetch(`/api/superjournal/${messageId}`, {
					method: 'DELETE'
				});
				if (!response.ok) throw new Error('Delete failed');
				// Remove from local state
				allMessages = allMessages.filter(msg => msg.id !== messageId);
			} catch (err) {
				console.error('[Message] Delete failed:', err);
			}
		});
	}

	function handleAbortCurrentMessage() {
		// Use the abort function from chat store (supports AbortController)
		abortCurrentMessage();
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
		nukeConfirm.start('nuke', async () => {
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
		});
	}


</script>

<div class="chat-container">
	<!-- Messages Area -->
	<div class="messages-area">
		<div class="messages-content">
			{#each allMessages as msg, index}
				<MessageGroup
					userMessage={msg.user_message}
					aiResponse={msg.ai_response}
					personaName={msg.persona_name}
					mode="chat"
					turnNumber={index + 1}
					timestamp={msg.formatted_timestamp}
					isStarred={starredIds.has(msg.id)}
					isCopied={copiedMessageId === msg.id}
					showActions={true}
					onStar={() => handleStarToggle(msg.id)}
					onCopy={() => handleCopyTurn(msg.id, msg.user_message, msg.ai_response, msg.persona_name)}
					onDelete={() => handleMessageDeleteClick(msg.id)}
				/>
			{/each}

			<!-- Show loading state for new message being sent -->
			{#if $isLoading && $currentMessage}
				<MessageGroup
					userMessage={$currentMessage.boss}
					aiResponse={$currentMessage.ai}
					personaName={selectedPersona}
					mode="chat"
					turnNumber={allMessages.length + 1}
					timestamp={$currentMessage.timestamp}
					isLoading={true}
					showActions={true}
					onDelete={handleAbortCurrentMessage}
				/>
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

					<PersonaDropdown
						selectedPersona={selectedPersona}
						onClick={() => togglePersona()}
					/>

					<div class="icon-group">
						<ScrollControls config={CHAT_CONFIG} />
					</div>

					<button class="control-btn settings-btn" title="Nuke all history" onclick={handleNukeClick}><Icon src={LuFlame} size="11" /></button>
				</div>
				<textarea
					placeholder="Type your message..."
					class="message-input"
					rows="1"
					bind:this={textareaRef}
					bind:value={inputMessage}
					onkeydown={handleKeyDown}
					oninput={autoResize}
					disabled={$isLoading}
				></textarea>
			</div>
			<button class="send-button" onclick={handleSend} disabled={$isLoading}>
				{$isLoading ? 'Sending...' : 'Send'}
			</button>
		</div>
	</div>


	<!-- Message Delete Confirmation Modal -->
	<ConfirmationModal
		isOpen={deleteConfirm.isActive}
		progress={deleteConfirm.progress}
		onCancel={() => deleteConfirm.cancel()}
		mode="chat"
	/>

	<!-- Nuke Confirmation Modal -->
	<ConfirmationModal
		isOpen={nukeConfirm.isActive}
		progress={nukeConfirm.progress}
		onCancel={() => nukeConfirm.cancel()}
		mode="chat"
	/>

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
		border-left: 1px solid hsl(var(--border) / 0.3);
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
		width: 100%;
		background: hsl(var(--input));
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--border));
		border-radius: 6px;
		padding: 12px 16px;
		outline: none;
		transition: border-color 0.2s;
		resize: none;
		min-height: 44px;
		max-height: 200px;
		overflow-y: auto;
		font-family: inherit;
		font-size: inherit;
		line-height: 1.5;
		box-sizing: border-box;
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

	.message-input:disabled,
	.send-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.send-button:hover:not(:disabled) {
		background: var(--boss-accent);
		color: hsl(var(--background));
	}
</style>
