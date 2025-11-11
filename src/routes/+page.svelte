<script lang="ts">
	import { Icon } from 'svelte-icons-pack';
	import { LuStar, LuCopy, LuTrash2, LuArchive, LuRefreshCw, LuPaperclip, LuFolder, LuChevronDown, LuSettings, LuLogOut, LuCloudDownload, LuEllipsisVertical, LuArrowDown, LuArrowUp, LuMessageSquare, LuFlame } from 'svelte-icons-pack/lu';
	import { currentMessage, isLoading, sendMessage } from '$lib/stores/chat';
	import {
		files,
		processingFiles,
		readyFiles,
		failedFiles,
		error,
		uploadFile,
		deleteFile
	} from '$lib/stores/filesStore';
	import { tick } from 'svelte';

	// Receive loaded messages from server
	let { data } = $props();
	// Reverse to show oldest first (most recent at bottom)
	let allMessages = $state([...(data.messages || [])].reverse());

	let inputMessage = $state('');
	let messagesEndRef: HTMLDivElement;
	let showNukeConfirm = $state(false);
	let nukeProgress = $state(0);
	let nukeTimer: number | null = null;

	// File upload state
	let fileInputRef: HTMLInputElement;
	let showFileList = $state(false);
	let deleteConfirmId = $state<string | null>(null);
	let dragOverActive = $state(false);

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

	// Auto-scroll to bottom
	async function scrollToBottom() {
		await tick();
		messagesEndRef?.scrollIntoView({ behavior: 'smooth' });
	}

	// Watch for new messages and scroll
	$effect(() => {
		if ($currentMessage) {
			scrollToBottom();
		}
	});

	// Scroll to bottom on initial load (instant, not smooth)
	$effect(() => {
		if (allMessages.length > 0 && messagesEndRef) {
			messagesEndRef.scrollIntoView({ behavior: 'instant' });
		}
	});

	async function handleSend() {
		if (!inputMessage.trim() || $isLoading) return;

		const message = inputMessage.trim();
		inputMessage = '';

		// Send message and wait for response
		await sendMessage(message);

		// Add the completed message to allMessages
		if ($currentMessage) {
			const now = new Date().toISOString();
			const formattedTimestamp = formatTimestamp(now);

			allMessages = [...allMessages, {
				id: crypto.randomUUID(),
				user_message: $currentMessage.boss,
				ai_response: $currentMessage.ai,
				persona_name: 'ananya',
				created_at: now,
				formatted_timestamp: formattedTimestamp
			}];

			// Clear current message after adding to history
			currentMessage.set(null);

			// Scroll to show new message
			scrollToBottom();
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSend();
		}
	}

	// File upload handler
	async function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];

		if (!file) return;

		// Validate file type
		const allowedTypes = [
			'application/pdf',
			'text/plain',
			'text/markdown',
			'image/png',
			'image/jpeg',
			'image/gif',
			'image/webp',
			'text/javascript',
			'application/typescript',
			'text/x-python',
			'application/vnd.ms-excel',
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'text/csv',
			'application/json'
		];

		if (!allowedTypes.includes(file.type)) {
			error.set(`File type not supported: ${file.type}`);
			return;
		}

		// Validate file size (10MB = 10485760 bytes)
		if (file.size > 10485760) {
			error.set('File is too large. Maximum size is 10MB.');
			return;
		}

		try {
			showFileList = true;
			const fileId = await uploadFile(file);
			console.log('[Chunk 9 UI] File uploaded:', fileId);
		} catch (err) {
			console.error('[Chunk 9 UI] Upload failed:', err);
			error.set(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}

		// Reset input
		target.value = '';
	}

	async function handleDeleteFile(fileId: string) {
		try {
			await deleteFile(fileId);
			console.log('[Chunk 9 UI] File deleted:', fileId);
		} catch (err) {
			console.error('[Chunk 9 UI] Delete failed:', err);
			error.set(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
		}
		deleteConfirmId = null;
	}

	function triggerFileInput() {
		fileInputRef?.click();
	}

	// Helper to format file size
	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
	}

	// Drag and drop handlers
	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		event.dataTransfer!.dropEffect = 'copy';
		dragOverActive = true;
	}

	function handleDragLeave(event: DragEvent) {
		// Check if we're leaving the wrapper entirely
		const target = event.currentTarget as HTMLElement;
		if (event.relatedTarget && !target.contains(event.relatedTarget as Node)) {
			dragOverActive = false;
		}
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		dragOverActive = false;
		const fileList = event.dataTransfer?.files;
		if (fileList?.length) {
			const file = fileList[0];
			// Create synthetic event for reuse of validation logic
			const syntheticEvent = {
				target: {
					files: fileList,
					value: ''
				}
			} as unknown as Event;
			handleFileSelect(syntheticEvent);
		}
	}

	function handleNukeClick() {
		showNukeConfirm = true;
		nukeProgress = 0;

		// Auto-confirm after 3 seconds
		const duration = 3000; // 3 seconds
		const interval = 50; // Update every 50ms
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
									<button class="action-btn" title="Delete"><Icon src={LuTrash2} size="11" /></button>
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
						<div class="message-text">{msg.ai_response}</div>
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
									<button class="action-btn" title="Delete"><Icon src={LuTrash2} size="11" /></button>
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
							<span class="message-label ai-label">Ananya</span>
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
			<div
				class="input-field-wrapper"
				ondragover={handleDragOver}
				ondragleave={handleDragLeave}
				ondrop={handleDrop}
				class:drag-active={dragOverActive}
			>
				<div class="input-controls">
					<button
						class="control-btn file-upload-btn"
						title="Attach file"
						onclick={triggerFileInput}
					>
						<Icon src={LuPaperclip} size="11" />
					</button>

					<!-- Hidden file input -->
					<input
						type="file"
						bind:this={fileInputRef}
						onchange={handleFileSelect}
						accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.gif,.webp,.js,.ts,.py,.xlsx,.csv,.json"
						style="display: none"
					/>

					<!-- File list toggle button (show file count) -->
					{#if $files.length > 0}
						<button
							class="control-btn file-list-btn"
							title={`Files (${$files.length})`}
							onclick={() => (showFileList = !showFileList)}
						>
							<Icon src={LuFolder} size="11" />
							<span class="file-count">{$files.length}</span>
						</button>
					{/if}

					<button class="control-btn" title="Download from cloud"><Icon src={LuCloudDownload} size="11" /></button>
					<button class="control-btn" title="Browse folder"><Icon src={LuFolder} size="11" /></button>

					<div class="model-dropdown">
						<span class="model-name">Qwen 2.5 32B</span>
						<Icon src={LuChevronDown} size="11" />
					</div>

					<div class="persona-dropdown">
						<span class="persona-name">Gunnar</span>
						<Icon src={LuChevronDown} size="11" />
					</div>

					<div class="icon-group">
						<button class="control-btn" title="Auto-scroll"><Icon src={LuEllipsisVertical} size="11" /></button>
						<button class="control-btn" title="Scroll down"><Icon src={LuArrowDown} size="11" /></button>
						<button class="control-btn" title="Scroll up"><Icon src={LuArrowUp} size="11" /></button>
						<button class="control-btn" title="Messages"><Icon src={LuMessageSquare} size="11" /></button>
					</div>

					<!-- User Controls (inline on narrow screens) -->
					<div class="user-controls-inline">
						<button class="logout-btn logout-btn-inline"><Icon src={LuLogOut} size="11" /></button>
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

	<!-- File List Dropdown -->
	{#if showFileList && $files.length > 0}
		<div class="file-list-container">
			<!-- Error message -->
			{#if $error}
				<div class="file-error-banner">
					<span>{$error}</span>
					<button
						class="error-close-btn"
						onclick={() => error.set(null)}
					>
						×
					</button>
				</div>
			{/if}

			<!-- File list header -->
			<div class="file-list-header">
				<span class="file-list-title">Files ({$files.length})</span>
				<button
					class="file-list-close-btn"
					onclick={() => (showFileList = false)}
				>
					<Icon src={LuChevronDown} size="11" />
				</button>
			</div>

			<!-- Processing files section -->
			{#if $processingFiles.length > 0}
				<div class="file-list-section">
					<div class="file-list-section-label">Processing ({$processingFiles.length})</div>
					{#each $processingFiles as file (file.id)}
						<div class="file-item file-item-processing">
							<div class="file-item-info">
								<div class="file-item-name" title={file.filename}>{file.filename}</div>
								<div class="file-item-stage">{file.processing_stage || 'pending'}</div>
							</div>
							<div class="file-item-progress">
								<div class="progress-bar-container">
									<div class="progress-bar" style="width: {file.progress}%"></div>
								</div>
								<span class="file-item-percent">{file.progress}%</span>
							</div>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Ready files section -->
			{#if $readyFiles.length > 0}
				<div class="file-list-section">
					<div class="file-list-section-label">Ready ({$readyFiles.length})</div>
					{#each $readyFiles as file (file.id)}
						<div class="file-item file-item-ready">
							<div class="file-item-info">
								<div class="file-item-status-icon">✓</div>
								<div class="file-item-name" title={file.filename}>{file.filename}</div>
							</div>
							<button
								class="file-item-delete-btn"
								onclick={() => (deleteConfirmId = file.id)}
								title="Delete file"
							>
								<Icon src={LuTrash2} size="10" />
							</button>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Failed files section -->
			{#if $failedFiles.length > 0}
				<div class="file-list-section">
					<div class="file-list-section-label">Failed ({$failedFiles.length})</div>
					{#each $failedFiles as file (file.id)}
						<div class="file-item file-item-failed">
							<div class="file-item-info">
								<div class="file-item-status-icon">✕</div>
								<div class="file-item-details">
									<div class="file-item-name" title={file.filename}>{file.filename}</div>
									<div class="file-item-error">{file.error_message || 'Unknown error'}</div>
								</div>
							</div>
							<button
								class="file-item-delete-btn"
								onclick={() => (deleteConfirmId = file.id)}
								title="Delete file"
							>
								<Icon src={LuTrash2} size="10" />
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Delete Confirmation Modal -->
	{#if deleteConfirmId}
		<div class="modal-overlay" onclick={() => (deleteConfirmId = null)}>
			<div class="modal-content" onclick={(e) => e.stopPropagation()}>
				<p class="modal-text">Delete file permanently?</p>
				<div class="modal-actions">
					<button
						class="modal-btn modal-btn-cancel"
						onclick={() => (deleteConfirmId = null)}
					>
						Cancel
					</button>
					<button
						class="modal-btn modal-btn-confirm"
						onclick={() => deleteConfirmId && handleDeleteFile(deleteConfirmId)}
					>
						Delete
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- User Avatar/Logout (top right) -->
	<div class="user-controls">
		<button class="logout-btn"><Icon src={LuLogOut} size="16" /></button>
	</div>

	<!-- Nuke Confirmation Modal -->
	{#if showNukeConfirm}
		<div class="modal-overlay" onclick={handleNukeCancel}>
			<div class="modal-content" onclick={(e) => e.stopPropagation()}>
				<p class="modal-text">Do nothing to proceed or hit cancel</p>
				<div class="progress-bar-container">
					<div class="progress-bar" style="width: {nukeProgress}%"></div>
				</div>
				<div class="modal-actions">
					<button class="modal-btn modal-btn-cancel" onclick={handleNukeCancel}>Cancel</button>
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
		overflow: hidden;
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
	}

	/* Messages Area - middle column */
	.messages-area {
		grid-area: messages;
		overflow-y: auto;
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
		padding: var(--message-padding-y) 0;
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
		white-space: pre-wrap;
	}

	/* Input Area - explicitly positioned at bottom */
	.input-area {
		grid-area: input;
		background: hsl(var(--card));
		border-top: 1px solid hsl(var(--chat-border));
		padding: 16px 24px;
		position: relative;
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

	.model-dropdown {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-left: 12px;
		cursor: pointer;
		opacity: 0.7;
		transition: opacity 0.2s;
		padding: 4px;
		flex-shrink: 0;
	}

	.model-dropdown:hover {
		opacity: 1;
	}

	.model-name {
		font-size: 1em;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 140px;
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

	.model-select,
	.persona-select {
		background: hsl(var(--input));
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--border));
		border-radius: 4px;
		padding: 6px 12px;
		cursor: pointer;
	}

	.control-icons {
		display: flex;
		gap: 8px;
	}

	.token-percentage {
		color: hsl(var(--muted-foreground));
		margin-left: auto;
		padding-right: 8px;
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

	/* User Controls - absolutely positioned top right */
	.user-controls {
		position: fixed;
		top: 16px;
		right: 16px;
		z-index: var(--z-sticky);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* Hide top-right logout on narrow screens */
	@media (max-width: 900px) {
		.user-controls {
			display: none;
		}
	}

	/* Inline logout button container */
	.user-controls-inline {
		display: none;
		margin-left: auto;
		padding-right: 2px;
	}

	/* Show inline logout on narrow screens */
	@media (max-width: 900px) {
		.user-controls-inline {
			display: flex;
			align-items: center;
		}
	}

	.logout-btn {
		background: transparent;
		border: none;
		color: hsl(var(--chat-label));
		cursor: pointer;
		padding: 8px;
		opacity: 0.7;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.logout-btn-inline {
		padding: 4px;
	}

	.logout-btn:hover {
		opacity: 1;
		color: rgb(239, 68, 68);
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
		font-size: 16px;
		margin: 0 0 16px 0;
		text-align: center;
	}

	.progress-bar-container {
		width: 100%;
		height: 4px;
		background: hsl(var(--border));
		border-radius: 2px;
		overflow: hidden;
		margin-bottom: 24px;
	}

	.progress-bar {
		height: 100%;
		background: var(--boss-accent);
		transition: width 50ms linear;
	}

	.modal-actions {
		display: flex;
		gap: 12px;
		justify-content: flex-end;
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

	/* File Upload UI Styles */

	/* File upload button */
	.file-upload-btn {
		position: relative;
	}

	.file-upload-btn:hover {
		opacity: 1;
		color: var(--boss-accent);
	}

	/* File list button with count badge */
	.file-list-btn {
		position: relative;
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.file-count {
		font-size: 0.75em;
		background: var(--boss-accent);
		color: hsl(var(--background));
		border-radius: 10px;
		padding: 1px 4px;
		font-weight: 600;
		min-width: 16px;
		text-align: center;
	}

	/* Drag and drop visual feedback */
	.input-field-wrapper {
		transition: background-color 0.2s, border-color 0.2s;
	}

	.input-field-wrapper.drag-active {
		background-color: hsl(var(--input) / 0.15);
		border-color: var(--boss-accent);
	}

	/* File List Container */
	.file-list-container {
		position: fixed;
		bottom: 120px;
		left: 50%;
		transform: translateX(-50%);
		width: min(calc(100% - 32px), 600px);
		max-width: 600px;
		max-height: 400px;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		overflow-y: auto;
		z-index: 100;
	}

	/* File list header */
	.file-list-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid hsl(var(--border));
		background: hsl(var(--background));
		position: sticky;
		top: 0;
		z-index: 1;
	}

	.file-list-title {
		font-weight: 600;
		color: hsl(var(--foreground));
		font-size: 0.9em;
	}

	.file-list-close-btn {
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 4px;
		opacity: 0.7;
		transition: opacity 0.2s;
		display: flex;
		align-items: center;
		transform: rotate(180deg);
	}

	.file-list-close-btn:hover {
		opacity: 1;
	}

	/* File list sections */
	.file-list-section {
		padding: 12px 8px;
		border-bottom: 1px solid hsl(var(--border));
	}

	.file-list-section:last-child {
		border-bottom: none;
	}

	.file-list-section-label {
		font-size: 0.8em;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 8px;
		padding: 0 8px;
		font-weight: 500;
	}

	/* File item - base styles */
	.file-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px;
		border-radius: 4px;
		gap: 8px;
		margin-bottom: 4px;
		transition: background-color 0.2s;
	}

	.file-item:hover {
		background-color: hsl(var(--muted) / 0.1);
	}

	/* File item info container */
	.file-item-info {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.file-item-details {
		flex: 1;
		min-width: 0;
	}

	.file-item-name {
		font-size: 0.85em;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.file-item-stage {
		font-size: 0.75em;
		color: hsl(var(--muted-foreground));
		text-transform: capitalize;
	}

	.file-item-error {
		font-size: 0.75em;
		color: rgb(239, 68, 68);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* File item status icon */
	.file-item-status-icon {
		font-weight: bold;
		font-size: 0.9em;
		width: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.file-item-ready .file-item-status-icon {
		color: hsl(var(--foreground));
	}

	.file-item-failed .file-item-status-icon {
		color: rgb(239, 68, 68);
	}

	/* Processing specific styles */
	.file-item-processing {
		flex-direction: column;
		align-items: flex-start;
	}

	.file-item-progress {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.progress-bar-container {
		flex: 1;
		height: 4px;
		background: hsl(var(--border));
		border-radius: 2px;
		overflow: hidden;
	}

	.progress-bar {
		height: 100%;
		background: var(--boss-accent);
		transition: width 150ms linear;
	}

	.file-item-percent {
		font-size: 0.75em;
		color: hsl(var(--muted-foreground));
		min-width: 28px;
		text-align: right;
	}

	/* Delete button */
	.file-item-delete-btn {
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 4px;
		opacity: 0.6;
		transition: opacity 0.2s;
		color: rgb(239, 68, 68);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.file-item-delete-btn:hover {
		opacity: 1;
	}

	/* Error banner */
	.file-error-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		background: rgba(239, 68, 68, 0.1);
		border-bottom: 1px solid rgb(239, 68, 68);
		color: rgb(239, 68, 68);
		font-size: 0.85em;
		gap: 8px;
	}

	.error-close-btn {
		background: transparent;
		border: none;
		color: rgb(239, 68, 68);
		cursor: pointer;
		font-size: 1.2em;
		padding: 0 4px;
		opacity: 0.7;
		transition: opacity 0.2s;
	}

	.error-close-btn:hover {
		opacity: 1;
	}

	/* Delete confirmation modal - add to existing modal styles */
	.modal-btn-confirm {
		background: var(--boss-accent);
		color: hsl(var(--background));
		border: 1px solid var(--boss-accent);
	}

	.modal-btn-confirm:hover {
		background: rgb(217, 133, 107);
		border-color: rgb(217, 133, 107);
	}

	/* Scrollbar styling for file list */
	.file-list-container::-webkit-scrollbar {
		width: 6px;
	}

	.file-list-container::-webkit-scrollbar-track {
		background: transparent;
	}

	.file-list-container::-webkit-scrollbar-thumb {
		background: hsl(var(--border));
		border-radius: 3px;
	}

	.file-list-container::-webkit-scrollbar-thumb:hover {
		background: hsl(var(--muted-foreground));
	}

	/* Responsive adjustments */
	@media (max-width: 600px) {
		.file-list-container {
			bottom: 110px;
			width: calc(100% - 16px);
			max-height: 300px;
		}
	}
</style>
