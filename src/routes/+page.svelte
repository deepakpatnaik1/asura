<script lang="ts">
	import { Icon } from 'svelte-icons-pack';
	import { LuStar, LuCopy, LuTrash2, LuArchive, LuRefreshCw, LuPaperclip, LuFolder, LuChevronDown, LuSettings, LuLogOut, LuCloudDownload, LuEllipsisVertical, LuArrowDown, LuArrowUp, LuMessageSquare, LuFlame, LuX } from 'svelte-icons-pack/lu';
	import { currentMessage, isLoading, sendMessage } from '$lib/stores/chat';
	import {
		files,
		error,
		uploadFile,
		deleteFile,
		refreshFiles
	} from '$lib/stores/filesStore';
	import { tick, onMount } from 'svelte';

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
	let selectedPersona = $state<'gunnar' | 'kirby'>('gunnar');
	let selectedModel = $state<string>('accounts/fireworks/models/qwen3-235b-a22b');

	// File upload state
	let fileInputRef: HTMLInputElement;
	let showFileList = $state(false);
	let deleteConfirmId = $state<string | null>(null);
	let dragOverActive = $state(false);

	// Load user settings on mount
	onMount(async () => {
		try {
			const response = await fetch('/api/settings');
			if (response.ok) {
				const data = await response.json();
				selectedPersona = data.selected_persona || 'gunnar';
				selectedModel = data.selected_model || 'accounts/fireworks/models/qwen3-235b-a22b';
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

		// Write to database
		try {
			await fetch('/api/settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ selected_model: selectedModel, selected_persona: selectedPersona })
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

			// Refresh files list to clear UI
			await refreshFiles();
		} catch (error) {
			console.error('Nuke error:', error);
		}
	}

	// Close file dropdown on Escape key or click outside
	$effect(() => {
		if (!showFileList) return;

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				showFileList = false;
			}
		};

		const handleClickOutside = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			// Close if clicking outside the dropdown, folder button, and delete modal
			if (
				!target.closest('.files-dropdown') &&
				!target.closest('.file-list-btn') &&
				!target.closest('.modal-overlay')
			) {
				showFileList = false;
			}
		};

		document.addEventListener('keydown', handleEscape);
		document.addEventListener('click', handleClickOutside);

		return () => {
			document.removeEventListener('keydown', handleEscape);
			document.removeEventListener('click', handleClickOutside);
		};
	});
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
					<button
						class="control-btn file-list-btn"
						title={`Files (${$files.length})`}
						onclick={() => (showFileList = !showFileList)}
					>
						<Icon src={LuFolder} size="11" />
						{#if $files.length > 0}
							<span class="file-count">{$files.length}</span>
						{/if}
					</button>

					<button class="control-btn" title="Download from cloud"><Icon src={LuCloudDownload} size="11" /></button>

					<div class="model-dropdown">
						<span class="model-name">Qwen 2.5 32B</span>
						<Icon src={LuChevronDown} size="11" />
					</div>

					<div class="persona-dropdown" onclick={() => togglePersona()}>
						<span class="persona-name">{selectedPersona.charAt(0).toUpperCase() + selectedPersona.slice(1)}</span>
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
	{#if showFileList}
		<div class="files-dropdown">
			<!-- Header -->
			<div class="files-header">
				<span>Files ({$files.length})</span>
				<button class="close-btn" onclick={() => (showFileList = false)}>
					<Icon src={LuX} size="12" />
				</button>
			</div>

			<!-- File List -->
			<div class="files-list">
				{#if $files.length === 0}
					<div class="empty-state">No files uploaded</div>
				{:else}
					{#each $files as file (file.id)}
						<div class="file-row">
							<button class="delete-btn" onclick={() => (deleteConfirmId = file.id)}>
								<Icon src={LuTrash2} size="10" />
							</button>
							<span class="filename">{file.filename.substring(0, 30)}{file.filename.length > 30 ? '...' : ''}</span>
							<div class="progress-bar">
								<div class="progress-fill {file.status}" style="width: {file.status === 'ready' ? 100 : file.progress}%"></div>
							</div>
							<span class="percent">{file.status === 'ready' ? 100 : file.progress}%</span>
						</div>
					{/each}
				{/if}
			</div>

			<!-- Error Banner -->
			{#if $error}
				<div class="error-banner">
					{$error}
					<button onclick={() => error.set(null)}>×</button>
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

	/* Files Dropdown */
	.files-dropdown {
		position: fixed;
		bottom: 120px;
		left: 50%;
		transform: translateX(-50%);
		width: min(420px, calc(100% - 32px));
		max-height: 400px;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		z-index: 100;
		display: flex;
		flex-direction: column;
	}

	/* Header */
	.files-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 16px;
		border-bottom: 1px solid hsl(var(--border));
		font-weight: 600;
		font-size: 0.9em;
	}

	.close-btn {
		background: none;
		border: none;
		cursor: pointer;
		opacity: 0.7;
		padding: 4px;
		display: flex;
	}

	.close-btn:hover {
		opacity: 1;
	}

	/* Files List */
	.files-list {
		overflow-y: auto;
		padding: 8px;
	}

	.empty-state {
		padding: 32px;
		text-align: center;
		color: hsl(var(--muted-foreground));
		font-size: 0.9em;
	}

	/* File Row */
	.file-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 16px;
		border-radius: 4px;
		margin-bottom: 2px;
	}

	.file-row:hover {
		background: hsl(var(--muted) / 0.1);
	}

	.delete-btn {
		background: none;
		border: none;
		cursor: pointer;
		color: rgb(239, 68, 68);
		opacity: 0.6;
		padding: 4px;
		display: flex;
		flex-shrink: 0;
	}

	.delete-btn:hover {
		opacity: 1;
	}

	.filename {
		font-size: 0.85em;
		width: 180px;
		flex-shrink: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.progress-bar {
		width: 100px;
		height: 6px;
		background: hsl(var(--muted) / 0.3);
		border-radius: 3px;
		overflow: hidden;
		flex-shrink: 0;
	}

	.progress-fill {
		height: 100%;
		transition: width 150ms linear;
	}

	.progress-fill.processing,
	.progress-fill.pending {
		background: var(--boss-accent);
	}

	.progress-fill.ready {
		background: rgb(34, 197, 94);
	}

	.progress-fill.failed {
		background: rgb(239, 68, 68);
	}

	.percent {
		font-size: 0.75em;
		color: hsl(var(--muted-foreground));
		width: 35px;
		text-align: right;
		flex-shrink: 0;
	}

	/* Error Banner */
	.error-banner {
		padding: 8px 12px;
		background: rgba(239, 68, 68, 0.1);
		border-top: 1px solid rgb(239, 68, 68);
		color: rgb(239, 68, 68);
		font-size: 0.85em;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.error-banner button {
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
		font-size: 1.2em;
		padding: 0 4px;
		opacity: 0.7;
	}

	.error-banner button:hover {
		opacity: 1;
	}

	/* Delete confirmation modal */
	.modal-btn-confirm {
		background: var(--boss-accent);
		color: hsl(var(--background));
		border: 1px solid var(--boss-accent);
	}

	.modal-btn-confirm:hover {
		background: rgb(217, 133, 107);
		border-color: rgb(217, 133, 107);
	}
</style>
