<script lang="ts">
	import { Icon } from 'svelte-icons-pack';
	import { LuStar, LuCopy, LuTrash2 } from 'svelte-icons-pack/lu';
	import { renderMarkdown } from '$lib/markdown-renderer';

	interface Props {
		/** User message content */
		userMessage: string;
		/** AI response content (markdown) */
		aiResponse: string;
		/** Persona name to display */
		personaName: string;
		/** Mode for accent color: 'chat' or 'reader' */
		mode: 'chat' | 'reader';
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
	}

	let {
		userMessage,
		aiResponse,
		personaName,
		mode,
		turnNumber,
		timestamp,
		isStarred = false,
		isCopied = false,
		isLoading = false,
		loadingText = 'Thinking',
		showActions = false,
		onStar,
		onCopy,
		onDelete
	}: Props = $props();

	// Capitalize persona name
	const displayName = $derived(personaName.charAt(0).toUpperCase() + personaName.slice(1));

	// Render markdown asynchronously, updating state when ready
	// This avoids flashing "Rendering" text during streaming
	let renderedHtml = $state('');

	$effect(() => {
		if (aiResponse) {
			renderMarkdown(aiResponse, mode).then((html) => {
				renderedHtml = html;
			});
		} else {
			renderedHtml = '';
		}
	});
</script>

<!-- Boss Message -->
<div class="message-group">
	<div class="boss-message" class:chat={mode === 'chat'} class:reader={mode === 'reader'}>
		{#if turnNumber !== undefined}
			<div class="turn-indicator">turn {turnNumber}</div>
		{/if}

		<div class="message-header">
			<span class="message-label boss-label" class:chat={mode === 'chat'} class:reader={mode === 'reader'}>Boss</span>
			{#if showActions}
				<div class="message-actions">
					<div class="action-icons">
						{#if onStar}
							<button
								class="action-btn"
								class:starred={isStarred}
								title={isStarred ? 'Unstar' : 'Star'}
								onclick={onStar}
							>
								<Icon src={LuStar} size="11" />
							</button>
						{/if}
						{#if onCopy}
							<button
								class="action-btn"
								class:copied={isCopied}
								title="Copy"
								onclick={onCopy}
							>
								<Icon src={LuCopy} size="11" />
							</button>
						{/if}
						{#if onDelete}
							<button class="action-btn" title="Delete" onclick={onDelete}>
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
		<div class="message-text">{userMessage}</div>
	</div>
</div>

<!-- AI Response -->
<div class="message-group">
	<div class="ai-message">
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

	.boss-message.chat {
		background: var(--boss-bg);
	}

	.boss-message.reader {
		background: var(--reader-bg);
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
	}

	.boss-label.chat {
		color: var(--boss-accent);
		border-bottom: 1px solid var(--boss-accent);
	}

	.boss-label.reader {
		color: var(--reader-accent);
		border-bottom: 1px solid var(--reader-accent);
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
