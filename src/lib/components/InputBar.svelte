<script lang="ts">
	interface Props {
		/** Current input value */
		value: string;
		/** Placeholder text */
		placeholder?: string;
		/** Whether input is disabled */
		disabled?: boolean;
		/** Send button text */
		sendText?: string;
		/** Sending button text */
		sendingText?: string;
		/** Whether currently sending */
		isSending?: boolean;
		/** Mode for accent color */
		mode?: 'chat' | 'reader';
		/** Send handler */
		onSend: () => void;
	}

	let {
		value = $bindable(),
		placeholder = 'Type your message...',
		disabled = false,
		sendText = 'Send',
		sendingText = 'Sending...',
		isSending = false,
		mode = 'chat',
		onSend
	}: Props = $props();

	let textareaRef: HTMLTextAreaElement;

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			onSend();
		}
	}

	function autoResize() {
		if (!textareaRef) return;
		textareaRef.style.height = 'auto';
		textareaRef.style.height = Math.min(textareaRef.scrollHeight, 200) + 'px';
	}

	// Expose reset function via export
	export function reset() {
		if (textareaRef) {
			textareaRef.style.height = 'auto';
		}
	}
</script>

<div class="input-bar" class:chat={mode === 'chat'} class:reader={mode === 'reader'}>
	<textarea
		bind:this={textareaRef}
		bind:value
		{placeholder}
		class="message-input"
		rows="1"
		onkeydown={handleKeyDown}
		oninput={autoResize}
		disabled={disabled || isSending}
	></textarea>
	<button
		class="send-button"
		onclick={onSend}
		disabled={disabled || isSending || !value.trim()}
	>
		{isSending ? sendingText : sendText}
	</button>
</div>

<style>
	.input-bar {
		display: flex;
		gap: 12px;
		align-items: flex-end;
		width: 100%;
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

	.message-input:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.send-button {
		background: transparent;
		border: 1px solid;
		border-radius: 6px;
		padding: 12px 24px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.chat .send-button {
		color: var(--boss-accent);
		border-color: var(--boss-accent);
	}

	.chat .send-button:hover:not(:disabled) {
		background: var(--boss-accent);
		color: hsl(var(--background));
	}

	.reader .send-button {
		color: var(--reader-accent);
		border-color: var(--reader-accent);
	}

	.reader .send-button:hover:not(:disabled) {
		background: var(--reader-accent);
		color: hsl(var(--background));
	}

	.send-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
