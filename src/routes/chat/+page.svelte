<script lang="ts">
	import { Icon } from 'svelte-icons-pack';
	import { LuStar, LuCopy, LuTrash2, LuArchive, LuRefreshCw, LuPaperclip, LuFolder, LuChevronDown, LuCloudDownload, LuEllipsisVertical, LuArrowDown, LuArrowUp, LuMessageSquare, LuFlame, LuX, LuCircle } from 'svelte-icons-pack/lu';
	import { currentMessage, isLoading, sendMessage, abortCurrentMessage } from '$lib/stores/chat';
	import { tick, onMount } from 'svelte';
	import { TIMING } from '$lib/config/timing';
	import { DEFAULT_PERSONA } from '$lib/config/personas';
	import { renderMarkdown } from '$lib/markdown-renderer';

	// Receive loaded messages from server
	let { data } = $props();
	// Reverse to show oldest first (most recent at bottom)
	let allMessages = $state([...(data.messages || [])].reverse());

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

	// Auto-scroll state
	let isAutoScrolling = $state(false);
	let scrollSpeed = $state(0.5); // pixels per frame - pattern: scroll 5s, pause 1min, repeat
	let pauseProgress = $state(0); // 0-100, percentage of pause completed
	let isPaused = $state(false); // Track if currently in pause phase
	let pauseStartTime = $state(0); // Track when pause started
	let scrollAccumulator = $state(0); // Accumulate fractional pixels for smooth low-speed scrolling

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

	// Auto-scroll to bottom
	async function scrollToBottom() {
		await tick();
		messagesEndRef?.scrollIntoView({ behavior: 'smooth' });
	}

	// Scroll to next message turn
	function scrollToNextTurn() {
		console.log('scrollToNextTurn called');

		const container = document.querySelector('.chat-container');
		console.log('container:', container);
		if (!container) {
			console.log('No container found');
			return;
		}

		// Get all turn indicators
		const turnIndicators = document.querySelectorAll('.turn-indicator');
		console.log('Found turn indicators:', turnIndicators.length);
		if (turnIndicators.length === 0) {
			console.log('No turn indicators found');
			return;
		}

		// Get current scroll position (top of viewport)
		const currentScrollTop = container.scrollTop;
		// Look for turns that are below the current visible area
		// Add 100px buffer to skip turns that are already near the top of viewport
		const viewportTop = currentScrollTop + 100;
		console.log('Current scroll top:', currentScrollTop, 'Viewport top threshold:', viewportTop);

		// Find the first turn indicator that's below the viewport threshold
		let nextTurn: Element | null = null;
		for (const indicator of turnIndicators) {
			const rect = indicator.getBoundingClientRect();
			const containerRect = container.getBoundingClientRect();
			const indicatorTopRelativeToContainer = rect.top - containerRect.top + container.scrollTop;

			console.log('Checking turn indicator:', indicator.textContent, 'at position:', indicatorTopRelativeToContainer);

			if (indicatorTopRelativeToContainer > viewportTop) {
				nextTurn = indicator;
				console.log('Found next turn:', indicator.textContent);
				break;
			}
		}

		// If no next turn found (we're at the end), do nothing
		if (!nextTurn) {
			console.log('No next turn found (at end)');
			return;
		}

		// Calculate scroll position: position of turn indicator minus space for line above boss card
		const rect = nextTurn.getBoundingClientRect();
		const containerRect = container.getBoundingClientRect();
		const turnTopRelativeToContainer = rect.top - containerRect.top + container.scrollTop;

		// Add enough space to show the line space above the boss card (approximately 40px)
		const spaceAbove = 40;
		const targetScrollTop = turnTopRelativeToContainer - spaceAbove;

		console.log('Scrolling to:', targetScrollTop);

		// Scroll to position
		container.scrollTo({
			top: targetScrollTop,
			behavior: 'smooth'
		});
	}

	// Scroll to previous message turn
	function scrollToPreviousTurn() {
		console.log('scrollToPreviousTurn called');

		const container = document.querySelector('.chat-container');
		console.log('container:', container);
		if (!container) {
			console.log('No container found');
			return;
		}

		// Get all turn indicators
		const turnIndicators = document.querySelectorAll('.turn-indicator');
		console.log('Found turn indicators:', turnIndicators.length);
		if (turnIndicators.length === 0) {
			console.log('No turn indicators found');
			return;
		}

		// Get current scroll position (top of viewport)
		const currentScrollTop = container.scrollTop;
		// Look for turns that are above the current visible area
		// Subtract 100px buffer to skip turns that are already near the top of viewport
		const viewportTop = currentScrollTop - 100;
		console.log('Current scroll top:', currentScrollTop, 'Viewport top threshold:', viewportTop);

		// Find the last turn indicator that's above the viewport threshold
		// (iterate backwards to find the previous one)
		let previousTurn: Element | null = null;
		for (let i = turnIndicators.length - 1; i >= 0; i--) {
			const indicator = turnIndicators[i];
			const rect = indicator.getBoundingClientRect();
			const containerRect = container.getBoundingClientRect();
			const indicatorTopRelativeToContainer = rect.top - containerRect.top + container.scrollTop;

			console.log('Checking turn indicator:', indicator.textContent, 'at position:', indicatorTopRelativeToContainer);

			if (indicatorTopRelativeToContainer < viewportTop) {
				previousTurn = indicator;
				console.log('Found previous turn:', indicator.textContent);
				break;
			}
		}

		// If no previous turn found (we're at the beginning), do nothing
		if (!previousTurn) {
			console.log('No previous turn found (at beginning)');
			return;
		}

		// Calculate scroll position: position of turn indicator minus space for line above boss card
		const rect = previousTurn.getBoundingClientRect();
		const containerRect = container.getBoundingClientRect();
		const turnTopRelativeToContainer = rect.top - containerRect.top + container.scrollTop;

		// Add enough space to show the line space above the boss card (approximately 40px)
		const spaceAbove = 40;
		const targetScrollTop = turnTopRelativeToContainer - spaceAbove;

		console.log('Scrolling to:', targetScrollTop);

		// Scroll to position
		container.scrollTo({
			top: targetScrollTop,
			behavior: 'smooth'
		});
	}

	// Custom auto-scroll with adjustable speed and pause pattern
	function handleAutoScroll() {
		if (isAutoScrolling) {
			// If auto-scroll is active (either scrolling or paused), turn it off
			isAutoScrolling = false;
			isPaused = false;
			pauseProgress = 0;
			scrollAccumulator = 0;
			return;
		}

		// Start scrolling
		isAutoScrolling = true;
		isPaused = false;
		pauseProgress = 0;
		scrollAccumulator = 0;
		const container = document.querySelector('.chat-container') as HTMLElement | null;
		if (!container) return;

		let scrollStartTime = Date.now();

		function smoothScroll() {
			if (!isAutoScrolling || !container) return;

			const maxScroll = container.scrollHeight - container.clientHeight;
			const currentScroll = container.scrollTop;

			if (currentScroll >= maxScroll) {
				// Reached bottom, stop scrolling
				isAutoScrolling = false;
				isPaused = false;
				pauseProgress = 0;
				scrollAccumulator = 0;
				return;
			}

			const now = Date.now();

			if (!isPaused) {
				// Scrolling phase: scroll for 5 seconds
				pauseProgress = 0;
				const scrollElapsed = now - scrollStartTime;
				if (scrollElapsed < TIMING.autoScrollDuration) {
					// Accumulate fractional pixels and scroll by whole pixels
					scrollAccumulator += scrollSpeed;
					const pixelsToScroll = Math.floor(scrollAccumulator);
					if (pixelsToScroll > 0) {
						container.scrollTop = currentScroll + pixelsToScroll;
						scrollAccumulator -= pixelsToScroll;
					}
				} else {
					// Switch to pause phase
					isPaused = true;
					pauseStartTime = now;
					scrollAccumulator = 0;
				}
			} else {
				// Pause phase: pause for 1 minute
				// During pause, user can manually scroll - we'll resume from their position
				const pauseElapsed = now - pauseStartTime;
				pauseProgress = Math.min(100, (pauseElapsed / TIMING.autoScrollPause) * 100);

				if (pauseElapsed >= TIMING.autoScrollPause) {
					// Switch back to scrolling phase from current scroll position
					isPaused = false;
					scrollStartTime = now;
					pauseProgress = 0;
					scrollAccumulator = 0;
				}
				// Don't auto-scroll during pause, but keep checking
			}

			// Continue the cycle
			requestAnimationFrame(smoothScroll);
		}

		smoothScroll();
	}

	// Watch for new messages and scroll
	// Scroll to boss card when new message is submitted (anchor at top of viewport)
	let lastScrolledMessageId: string | null = null;
	$effect(() => {
		if ($currentMessage && $currentMessage.id !== lastScrolledMessageId) {
			console.log('[Scroll Debug] New message detected, ID:', $currentMessage.id);
			// Only scroll once when boss card first appears (not continuously as AI response updates)
			lastScrolledMessageId = $currentMessage.id;

			// Wait for DOM to fully render using multiple RAF cycles
			tick().then(() => {
				requestAnimationFrame(() => {
					requestAnimationFrame(() => {
						const container = document.querySelector('.chat-container');
						const turnIndicators = document.querySelectorAll('.turn-indicator');

						console.log('[Scroll Debug] Container:', container);
						console.log('[Scroll Debug] Turn indicators found:', turnIndicators.length);

						if (!container || turnIndicators.length === 0) {
							console.log('[Scroll Debug] Early exit - missing container or turn indicators');
							return;
						}

						// Get the last turn indicator (newly created boss card)
						const newBossCard = turnIndicators[turnIndicators.length - 1];
						console.log('[Scroll Debug] New boss card element:', newBossCard);

						// Calculate position relative to container
						const rect = newBossCard.getBoundingClientRect();
						const containerRect = container.getBoundingClientRect();
						const turnTopRelativeToContainer = rect.top - containerRect.top + container.scrollTop;

						// Scroll to position: turn indicator position minus 40px space above
						const spaceAbove = 40;
						const targetScrollTop = turnTopRelativeToContainer - spaceAbove;

						console.log('[Scroll Debug] Scroll calculation:', {
							turnTop: rect.top,
							containerTop: containerRect.top,
							containerScrollTop: container.scrollTop,
							turnTopRelative: turnTopRelativeToContainer,
							targetScrollTop
						});

						// Scroll with smooth behavior
						container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
						console.log('[Scroll Debug] Scroll command issued');
					});
				});
			});
		}
	});

	// Scroll to bottom on initial load ONLY (not on message updates)
	onMount(() => {
		if (allMessages.length > 0 && messagesEndRef) {
			messagesEndRef.scrollIntoView({ behavior: 'instant' });
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
				// SSE will handle UI update automatically
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
									<button class="action-btn" title="Star"><Icon src={LuStar} size="11" /></button>
									<button class="action-btn" title="Copy"><Icon src={LuCopy} size="11" /></button>
									<button class="action-btn" title="Delete" onclick={() => handleMessageDeleteClick(msg.id)}><Icon src={LuTrash2} size="11" /></button>
									<button class="action-btn" title="Archive"><Icon src={LuArchive} size="11" /></button>
									<button class="action-btn" title="Refresh"><Icon src={LuRefreshCw} size="11" /></button>
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
									<button class="action-btn" title="Archive"><Icon src={LuArchive} size="11" /></button>
									<button class="action-btn" title="Refresh"><Icon src={LuRefreshCw} size="11" /></button>
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
						<button class="control-btn auto-scroll-btn" class:active={isAutoScrolling} title="Auto-scroll" onclick={handleAutoScroll} style="position: relative;">
							<svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
								<!-- Outer circle stroke -->
								<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/>
								<!-- Filled portion (Harvey ball) -->
								{#if pauseProgress > 0}
									{@const angle = (pauseProgress / 100) * 2 * Math.PI}
									{@const x = 12 + 10 * Math.sin(angle)}
									{@const y = 12 - 10 * Math.cos(angle)}
									{@const largeArc = pauseProgress > 50 ? 1 : 0}
									<path
										d="M12 2 A10 10 0 {largeArc} 1 {x} {y} L12 12 Z"
										fill="var(--boss-accent)"
									/>
								{/if}
							</svg>
							<!-- Red X badge when auto-scrolling is active -->
							{#if isAutoScrolling}
								<span style="position: absolute; top: -2px; right: -2px; width: 6px; height: 6px; background: red; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 5px; color: white; font-weight: bold; line-height: 1;">×</span>
							{/if}
						</button>
						<button class="control-btn" title="Next turn" onclick={scrollToNextTurn}><Icon src={LuArrowDown} size="11" /></button>
						<button class="control-btn" title="Previous turn" onclick={scrollToPreviousTurn}><Icon src={LuArrowUp} size="11" /></button>
						<button class="control-btn" title="Messages"><Icon src={LuMessageSquare} size="11" /></button>
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

</div>

<style>
	/* Main Layout - Three-column grid */
	.chat-container {
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
		.chat-container {
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

	.auto-scroll-btn svg {
		display: block;
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
		padding: 0 24px;
	}

	/* Adjust input padding on narrow screens to account for chat-container padding */
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
