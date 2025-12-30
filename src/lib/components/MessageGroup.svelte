<script lang="ts">
	import { Icon } from 'svelte-icons-pack';
	import { LuStar, LuCopy, LuTrash2 } from 'svelte-icons-pack/lu';
	import { renderMarkdown } from '$lib/markdown-renderer';

	// Reference to AI message container for attaching code copy handlers
	let aiMessageContainer: HTMLDivElement;

	interface Props {
		/** Message ID for scroll targeting */
		messageId?: string;
		/** User message content */
		userMessage: string;
		/** AI response content (markdown) */
		aiResponse: string;
		/** Persona name (used for display and markdown styling) */
		personaName: string;
		/** Accent color for this persona */
		accentColor: string;
		/** Accent background color for this persona */
		accentBg: string;
		/** Optional turn number */
		turnNumber?: number;
		/** Optional timestamp string */
		timestamp?: string;
		/** Whether this message is starred */
		isStarred?: boolean;
		/** Whether copy feedback is active */
		isCopied?: boolean;
		/** Whether this is a loading/streaming state */
		isLoading?: boolean;
		/** Loading text to show while streaming */
		loadingText?: string;
		/** Show action buttons */
		showActions?: boolean;
		/** Star button click handler */
		onStar?: () => void;
		/** Copy button click handler */
		onCopy?: () => void;
		/** Delete button click handler */
		onDelete?: () => void;
		/** Table click handler (for opening chart in lightbox) */
		onTableClick?: (messageId: string | undefined, tableIndex: number) => void;
	}

	let {
		messageId,
		userMessage,
		aiResponse,
		personaName,
		accentColor,
		accentBg,
		turnNumber,
		timestamp,
		isStarred = false,
		isCopied = false,
		isLoading = false,
		loadingText = 'Thinking',
		showActions = false,
		onStar,
		onCopy,
		onDelete,
		onTableClick
	}: Props = $props();

	// Capitalize persona name
	const displayName = $derived(personaName.charAt(0).toUpperCase() + personaName.slice(1));

	// Render markdown asynchronously, updating state when ready
	// This avoids flashing "Rendering" text during streaming
	let renderedHtml = $state('');

	$effect(() => {
		if (aiResponse) {
			renderMarkdown(aiResponse, personaName).then((html) => {
				renderedHtml = html;
			});
		} else {
			renderedHtml = '';
		}
	});

	// Handle table clicks via event delegation (for opening in lightbox)
	function handleContainerClick(e: MouseEvent) {
		if (!onTableClick) return;

		const target = e.target as HTMLElement;
		const tableWrapper = target.closest('[data-table-index]') as HTMLElement;
		if (tableWrapper) {
			const tableIndex = parseInt(tableWrapper.dataset.tableIndex || '0', 10);
			onTableClick(messageId, tableIndex);
		}
	}

	// Attach click handlers to code copy buttons after HTML is rendered
	$effect(() => {
		if (!renderedHtml || !aiMessageContainer) return;

		// Find all code copy buttons and attach click handlers
		const copyBtns = aiMessageContainer.querySelectorAll('.code-copy-btn');
		copyBtns.forEach((btn) => {
			const button = btn as HTMLButtonElement;
			// Skip if already has handler attached
			if (button.dataset.handlerAttached) return;
			button.dataset.handlerAttached = 'true';

			button.addEventListener('click', async (e) => {
				e.preventDefault();
				e.stopPropagation();

				const codeBase64 = button.dataset.code;
				if (!codeBase64) return;

				try {
					// Decode base64 to get original code
					const code = decodeURIComponent(escape(atob(codeBase64)));
					await navigator.clipboard.writeText(code);

					// Show feedback - fill the icon
					const svg = button.querySelector('svg');
					if (svg) {
						svg.style.fill = accentColor;
						svg.style.stroke = accentColor;
						button.style.opacity = '1';
					}

					// Reset after 1.5s
					setTimeout(() => {
						if (svg) {
							svg.style.fill = 'none';
							svg.style.stroke = 'currentColor';
							button.style.opacity = '0.4';
						}
					}, 1500);
				} catch (err) {
					console.error('Failed to copy code:', err);
				}
			});

			// Hover effect
			button.addEventListener('mouseenter', () => {
				button.style.opacity = '0.8';
			});
			button.addEventListener('mouseleave', () => {
				// Only reset if not in "copied" state
				const svg = button.querySelector('svg');
				if (svg && svg.style.fill !== accentColor) {
					button.style.opacity = '0.4';
				}
			});
		});
	});
</script>

<!-- Boss Message -->
<div class="message-group" id={messageId ? `message-${messageId}` : undefined}>
	<div class="boss-message" style="background: {accentBg};">
		{#if turnNumber !== undefined}
			<div class="turn-indicator">turn {turnNumber}</div>
		{/if}

		<div class="message-header">
			<span class="message-label boss-label" style="color: {accentColor}; border-bottom-color: {accentColor};">Boss</span>
			{#if showActions}
				<div class="message-actions">
					<div class="action-icons">
						{#if onStar}
							<button
								class="action-btn hit-target"
								class:active={isStarred}
								class:filled={isStarred}
								style={isStarred ? `color: ${accentColor}; --fill-color: ${accentColor};` : ''}
								title={isStarred ? 'Unstar' : 'Star'}
								onclick={onStar}
							>
								<Icon src={LuStar} size="11" color={isStarred ? accentColor : undefined} />
							</button>
						{/if}
						{#if onCopy}
							<button
								class="action-btn hit-target"
								class:active={isCopied}
								class:filled={isCopied}
								style={isCopied ? `color: ${accentColor}; --fill-color: ${accentColor};` : ''}
								title="Copy"
								onclick={onCopy}
							>
								<Icon src={LuCopy} size="11" color={isCopied ? accentColor : undefined} />
							</button>
						{/if}
						{#if onDelete}
							<button class="action-btn hit-target" title="Delete" onclick={onDelete}>
								<Icon src={LuTrash2} size="11" />
							</button>
						{/if}
					</div>
					{#if timestamp}
						<span class="timestamp">{timestamp}</span>
					{/if}
				</div>
			{/if}
		</div>
		<div class="message-text">
			{#if personaName === 'samara'}
				Samara, demystify this.
			{:else if personaName === 'alicja' && /\blog (this|it|the founder diary)\b/i.test(userMessage)}
				Alicja, log this.
			{:else}
				{userMessage}
			{/if}
		</div>
	</div>
</div>

<!-- AI Response -->
<div class="message-group">
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="ai-message" bind:this={aiMessageContainer} onclick={handleContainerClick}>
		<div class="message-header">
			<span class="message-label ai-label">{displayName}</span>
		</div>
		<div class="message-text">
			{#if isLoading && !aiResponse}
				<span class="loading-text">{loadingText}<span class="dots"><span>.</span><span>.</span><span>.</span></span></span>
			{:else}
				{@html renderedHtml}
			{/if}
		</div>
	</div>
</div>

<style>
	/* Message Groups */
	.message-group {
		position: relative;
		margin-bottom: 16px;
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

	/* Boss Message - with background card */
	.boss-message {
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
		position: relative;
		top: -1px;
		border-bottom: 1px solid;
	}

	.ai-label {
		color: hsl(var(--foreground));
		border-bottom: 1px solid hsl(var(--border));
	}

	/* Message Actions */
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

	.action-btn.active {
		opacity: 1;
	}

	.action-btn.filled :global(svg) {
		fill: var(--fill-color);
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

	/* Loading animation */
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
</style>
