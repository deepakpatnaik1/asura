<script lang="ts">
	import { Icon } from 'svelte-icons-pack';
	import { LuPaperclip, LuFolder, LuCloudDownload, LuFlame } from 'svelte-icons-pack/lu';
	import { currentMessage, isLoading, sendMessage, abortCurrentMessage } from '$lib/stores/chat';
	import { tick, onMount } from 'svelte';
	import { DEFAULT_PERSONA, PERSONAS } from '$lib/config/personas';
	import { getPersonaAccentColor, getPersonaAccentBg } from '$lib/config/colors';
	import { CHAT_CONFIG, scrollToTurn, scrollToLastTurn, getTurns } from '$lib/ui/scroll';
	import { createConfirmation } from '$lib/composables';
	import ScrollControls from '$lib/components/ScrollControls.svelte';
	import MessageGroup from '$lib/components/MessageGroup.svelte';
	import ConfirmationModal from '$lib/components/ConfirmationModal.svelte';
	import PersonaDropdown from '$lib/components/PersonaDropdown.svelte';
	import CanvasContainer from '$lib/components/CanvasContainer.svelte';
	import PasteArea from '$lib/components/PasteArea.svelte';
	import ContentLibrary from '$lib/components/ContentLibrary.svelte';
	import NukeMenu from '$lib/components/NukeMenu.svelte';

	// Receive loaded data from server
	let { data } = $props();

	// Unified conversation - ALL messages regardless of persona
	let allMessages = $state([...(data.messages || [])].reverse());
	let starredIds = $state(new Set<string>(data.starredIds || []));
	let hasMore = $state(data.hasMore || false);
	let isLoadingMore = $state(false);
	let currentOffset = $state(data.messages?.length || 0);

	// Currently selected persona (determines who receives next message)
	let selectedPersona = $state<string>(data.selectedPersona || DEFAULT_PERSONA);

	// Accent color for current persona (send button, input bar)
	const currentAccentColor = $derived(getPersonaAccentColor(selectedPersona));
	const currentAccentBg = $derived(getPersonaAccentBg(selectedPersona));

	// Charts state for canvas
	interface Chart {
		id: string;
		thumbnail_url: string;
		full_url: string;
		alt: string;
		is_pinned?: boolean;
		source: 'file' | 'superjournal';
		file_id?: string;
	}
	let superjournalCharts = $state<Chart[]>([]);
	let fileCharts = $state<Chart[]>([]);
	let allCharts = $derived([...fileCharts, ...superjournalCharts]);
	let selectedChartIndex = $state<number | null>(null);
	let showLightbox = $state(false);

	let inputMessage = $state('');
	let messagesEndRef: HTMLDivElement;
	let textareaRef: HTMLTextAreaElement;

	// Helper to get persona prefix for input field
	function getPersonaPrefix(): string {
		const persona = PERSONAS[selectedPersona];
		return persona ? `${persona.displayName}, ` : '';
	}

	// File paste and library state
	let showFilePaste = $state(false);
	let showFileLibrary = $state(false);
	let showNukeMenu = $state(false);
	let nukeButtonRef = $state<HTMLElement | null>(null);
	interface FileItem {
		id: string;
		title: string;
		is_enabled: boolean;
		created_at: string;
	}
	let files = $state<FileItem[]>([]);
	let isDeletingFile = $state(false);

	// Confirmation composables
	const deleteConfirm = createConfirmation();
	const fileDeleteConfirm = createConfirmation();
	const chartDeleteConfirm = createConfirmation();

	let pendingTimeouts: number[] = [];

	// Fetch superjournal charts
	async function loadSuperjournalCharts() {
		const messageIds = allMessages.map((m) => m.id).filter(Boolean);
		if (messageIds.length === 0) {
			superjournalCharts = [];
			return;
		}

		try {
			const response = await fetch(`/api/superjournal/charts?ids=${messageIds.join(',')}`);
			if (response.ok) {
				const data = await response.json();
				const charts: Chart[] = [];
				for (const sjId of Object.keys(data.charts || {})) {
					for (const chart of data.charts[sjId]) {
						charts.push({ ...chart, source: 'superjournal' as const });
					}
				}
				superjournalCharts = charts;
			}
		} catch (error) {
			console.error('Failed to load superjournal charts:', error);
		}
	}

	// Fetch file charts
	async function loadFileCharts() {
		try {
			const response = await fetch('/api/chat/files/charts?enabled_only=true');
			if (response.ok) {
				const data = await response.json();
				fileCharts = (data.charts || []).map((chart: Chart & { file_id: string }) => ({
					...chart,
					source: 'file' as const
				}));
			}
		} catch (error) {
			console.error('Failed to load file charts:', error);
		}
	}

	async function loadCharts() {
		await Promise.all([loadSuperjournalCharts(), loadFileCharts()]);
	}

	onMount(() => {
		textareaRef?.focus();

		(async () => {
			inputMessage = getPersonaPrefix();
			await loadCharts();
		})();

		return () => {
			pendingTimeouts.forEach(clearTimeout);
			pendingTimeouts = [];
			deleteConfirm.cleanup();
			fileDeleteConfirm.cleanup();
			chartDeleteConfirm.cleanup();
		};
	});

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

	// Load more messages (no mode filter - unified history)
	async function loadMoreMessages() {
		if (isLoadingMore || !hasMore) return;

		isLoadingMore = true;
		try {
			const response = await fetch(`/api/superjournal?offset=${currentOffset}&limit=50`);
			if (response.ok) {
				const result = await response.json();
				const olderMessages = [...result.messages].reverse();
				allMessages = [...olderMessages, ...allMessages];
				currentOffset += result.messages.length;
				hasMore = result.hasMore;
			}
		} catch (error) {
			console.error('Failed to load more messages:', error);
		} finally {
			isLoadingMore = false;
		}
	}

	// Auto-switch dropdown when typing persona name at start
	$effect(() => {
		const normalized = inputMessage.trim().toLowerCase();
		for (const name of Object.keys(PERSONAS)) {
			if (normalized.startsWith(name)) {
				selectedPersona = name;
				break;
			}
		}
	});

	// Select persona from dropdown
	async function selectPersona(persona: string) {
		if (!PERSONAS[persona]) return;
		selectedPersona = persona;

		// Replace persona prefix in input
		const displayName = PERSONAS[persona].displayName;
		const personaPattern = new RegExp(`^(${Object.values(PERSONAS).map(p => p.displayName).join('|')}),?\\s*`, 'i');
		const cleanedMessage = inputMessage.replace(personaPattern, '');
		inputMessage = cleanedMessage ? `${displayName}, ${cleanedMessage}` : `${displayName}, `;

		// Save to database
		try {
			await fetch('/api/settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ selected_persona: selectedPersona })
			});
		} catch (error) {
			console.error('Failed to save persona:', error);
		}
	}

	// Watch for new messages and scroll to boss card
	let lastScrolledMessageId: string | null = null;

	$effect(() => {
		if ($currentMessage && $currentMessage.id !== lastScrolledMessageId) {
			lastScrolledMessageId = $currentMessage.id;

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

	// Scroll to last turn on initial load
	onMount(() => {
		if (allMessages.length > 0) {
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					scrollToLastTurn(CHAT_CONFIG);
				});
			});
		}
	});

	async function handleSend() {
		if (!inputMessage.trim() || $isLoading) return;

		const message = inputMessage.trim();
		inputMessage = getPersonaPrefix();
		resetTextareaHeight();

		let chartId: string | undefined;
		let chartSource: 'file' | 'superjournal' | undefined;
		if (showLightbox && selectedChartIndex !== null && allCharts[selectedChartIndex]) {
			const selectedChart = allCharts[selectedChartIndex];
			chartId = selectedChart.id;
			chartSource = selectedChart.source;
		}

		await sendMessage(message, selectedPersona, chartId, chartSource);

		if ($currentMessage) {
			const now = new Date().toISOString();
			const formattedTimestamp = formatTimestamp(now);
			const messageId = $currentMessage.superjournal_id || crypto.randomUUID();

			allMessages = [...allMessages, {
				id: messageId,
				user_message: $currentMessage.boss,
				ai_response: $currentMessage.ai,
				persona_name: selectedPersona,
				created_at: now,
				formatted_timestamp: formattedTimestamp,
				model_identifier: $currentMessage.model_identifier
			}];

			currentMessage.set(null);

			const timeoutId = window.setTimeout(() => loadCharts(), 2000);
			pendingTimeouts.push(timeoutId);
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSend();
		}
	}

	function autoResize() {
		if (!textareaRef) return;
		textareaRef.style.height = 'auto';
		textareaRef.style.height = Math.min(textareaRef.scrollHeight, 200) + 'px';
	}

	function resetTextareaHeight() {
		if (!textareaRef) return;
		textareaRef.style.height = 'auto';
	}

	function handleMessageDeleteClick(messageId: string) {
		deleteConfirm.start(messageId, async () => {
			try {
				const response = await fetch(`/api/superjournal/${messageId}`, { method: 'DELETE' });
				if (!response.ok) throw new Error('Delete failed');
				allMessages = allMessages.filter(msg => msg.id !== messageId);
			} catch (err) {
				console.error('[Message] Delete failed:', err);
			}
		});
	}

	function handleAbortCurrentMessage() {
		abortCurrentMessage();
	}

	let copiedMessageId = $state<string | null>(null);

	async function handleCopyTurn(messageId: string, userMessage: string, aiResponse: string, personaName: string) {
		const cleanResponse = aiResponse.replace(/\n{2,}/g, '\n').trim();
		const cleanMessage = userMessage.trim();
		const displayName = PERSONAS[personaName]?.displayName || personaName;
		const text = `Boss: ${cleanMessage}\n\n${displayName}: ${cleanResponse}`;
		await navigator.clipboard.writeText(text);

		copiedMessageId = messageId;
		const timeoutId = window.setTimeout(() => {
			if (copiedMessageId === messageId) copiedMessageId = null;
		}, 1500);
		pendingTimeouts.push(timeoutId);
	}

	async function handleStarToggle(messageId: string) {
		const wasStarred = starredIds.has(messageId);
		if (wasStarred) {
			starredIds = new Set([...starredIds].filter(id => id !== messageId));
		} else {
			starredIds = new Set([...starredIds, messageId]);
		}

		fetch(`/api/superjournal/${messageId}`, { method: 'PATCH' })
			.then(response => response.json())
			.then(result => {
				if (result.is_starred !== undefined) {
					if (result.is_starred && !starredIds.has(messageId)) {
						starredIds = new Set([...starredIds, messageId]);
					} else if (!result.is_starred && starredIds.has(messageId)) {
						starredIds = new Set([...starredIds].filter(id => id !== messageId));
					}
				}
			})
			.catch(() => {
				if (wasStarred) {
					starredIds = new Set([...starredIds, messageId]);
				} else {
					starredIds = new Set([...starredIds].filter(id => id !== messageId));
				}
			});
	}

	function toggleNukeMenu() {
		showNukeMenu = !showNukeMenu;
	}

	function handleNukeComplete(bucket: string) {
		showNukeMenu = false;

		// Parse bucket to determine what to clear from UI
		const [bucketType, target] = bucket.split(':');

		switch (bucketType) {
			case 'persona':
				// Remove messages from this persona
				allMessages = allMessages.filter(m => m.persona_name !== target);
				// Reload charts (some may have been deleted)
				loadSuperjournalCharts();
				break;
			case 'content':
				// Reload files and file charts
				loadFiles();
				loadFileCharts();
				break;
			case 'productivity':
				// Nothing in main UI to clear - CalendarCanvas will refetch on its own
				break;
			default:
				// ALL - clear everything
				allMessages = [];
				superjournalCharts = [];
				fileCharts = [];
				files = [];
				currentMessage.set(null);
		}
	}

	// File paste handlers
	async function handlePaperclipClick() {
		showFileLibrary = false;
		showFilePaste = !showFilePaste;
		if (showFilePaste) {
			await tick();
			const pasteArea = document.querySelector('.paste-area') as HTMLElement;
			pasteArea?.focus();
		}
	}

	async function handleFolderClick() {
		showFilePaste = false;
		showFileLibrary = !showFileLibrary;
		if (showFileLibrary) {
			await loadFiles();
		}
	}

	async function loadFiles() {
		try {
			const response = await fetch('/api/chat/files');
			if (response.ok) {
				const data = await response.json();
				files = data.files || [];
			}
		} catch (error) {
			console.error('Failed to load files:', error);
		}
	}

	async function toggleFile(fileId: string, currentState: boolean) {
		files = files.map((f) => f.id === fileId ? { ...f, is_enabled: !currentState } : f);

		try {
			if (!currentState) {
				const response = await fetch(`/api/chat/files/${fileId}/open`, { method: 'POST' });
				if (!response.ok) {
					files = files.map((f) => f.id === fileId ? { ...f, is_enabled: currentState } : f);
				} else {
					const data = await response.json();
					allMessages = [...allMessages, data.message];
					await loadFileCharts();
					await tick();
					scrollToLastTurn(CHAT_CONFIG);
				}
			} else {
				const response = await fetch(`/api/chat/files/${fileId}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ is_enabled: false })
				});
				if (!response.ok) {
					files = files.map((f) => f.id === fileId ? { ...f, is_enabled: currentState } : f);
				} else {
					await loadFileCharts();
				}
			}
		} catch (error) {
			files = files.map((f) => f.id === fileId ? { ...f, is_enabled: currentState } : f);
		}
	}

	async function clearAllFiles() {
		const enabledFiles = files.filter(f => f.is_enabled);
		if (enabledFiles.length === 0) return;

		files = files.map(f => ({ ...f, is_enabled: false }));
		showFileLibrary = false;

		try {
			await Promise.all(
				enabledFiles.map(f =>
					fetch(`/api/chat/files/${f.id}`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ is_enabled: false })
					})
				)
			);
			await loadFileCharts();
		} catch (error) {
			console.error('Failed to clear files:', error);
			await loadFiles();
		}
	}

	async function renameFile(fileId: string, newTitle: string) {
		const oldTitle = files.find((f) => f.id === fileId)?.title;
		files = files.map((f) => f.id === fileId ? { ...f, title: newTitle } : f);

		try {
			const response = await fetch(`/api/chat/files/${fileId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: newTitle })
			});
			if (!response.ok) {
				files = files.map((f) => f.id === fileId ? { ...f, title: oldTitle || '' } : f);
			}
		} catch (error) {
			files = files.map((f) => f.id === fileId ? { ...f, title: oldTitle || '' } : f);
		}
	}

	function handleFileDeleteClick(fileId: string, event: MouseEvent) {
		event.stopPropagation();
		fileDeleteConfirm.start(fileId, async () => {
			isDeletingFile = true;
			const originalFiles = files;
			files = files.filter((f) => f.id !== fileId);

			try {
				const response = await fetch(`/api/chat/files/${fileId}`, { method: 'DELETE' });
				if (!response.ok) {
					files = originalFiles;
				} else {
					allMessages = allMessages.filter(m => !m.ai_response?.startsWith(`<!--content:${fileId}-->`));
					await loadFileCharts();
				}
			} catch (error) {
				files = originalFiles;
			} finally {
				isDeletingFile = false;
			}
		});
	}

	async function handleFilePasteSuccess(fileId: string, title: string, content: string, superjournalId?: string) {
		console.log('[Files] Saved:', title, fileId, superjournalId);

		if (superjournalId) {
			const now = new Date().toISOString();
			allMessages = [...allMessages, {
				id: superjournalId,
				user_message: `Boss uploaded ${title}`,
				ai_response: `<!--content:${fileId}-->\n${content}`,
				persona_name: selectedPersona,
				created_at: now,
				formatted_timestamp: formatTimestamp(now),
				model_identifier: 'file-upload'
			}];

			await tick();
			setTimeout(() => scrollToLastTurn(CHAT_CONFIG), 100);
		}

		if (showFileLibrary) loadFiles();
		await loadFileCharts();
	}

	function handleChartDeleteClick(chartId: string) {
		chartDeleteConfirm.start(chartId, async () => {
			const deletedIndex = allCharts.findIndex((c) => c.id === chartId);
			if (showLightbox && selectedChartIndex === deletedIndex) {
				showLightbox = false;
				selectedChartIndex = null;
			}

			const originalSuperjournalCharts = superjournalCharts;
			const originalFileCharts = fileCharts;
			superjournalCharts = superjournalCharts.filter((c) => c.id !== chartId);
			fileCharts = fileCharts.filter((c) => c.id !== chartId);

			try {
				const response = await fetch(`/api/superjournal/charts/${chartId}`, { method: 'DELETE' });
				if (!response.ok) {
					superjournalCharts = originalSuperjournalCharts;
					fileCharts = originalFileCharts;
				}
			} catch (error) {
				superjournalCharts = originalSuperjournalCharts;
				fileCharts = originalFileCharts;
			}
		});
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && showFileLibrary) {
			showFileLibrary = false;
			textareaRef?.focus();
			return;
		}
		if (event.key === 'Escape' && showFilePaste) {
			showFilePaste = false;
			textareaRef?.focus();
			return;
		}
		if (event.key === 'Escape') {
			const selection = window.getSelection();
			if (selection && selection.toString().length > 0) {
				selection.removeAllRanges();
				textareaRef?.focus();
				return;
			}
		}
	}

	function handleWindowFocus() {
		if (showFilePaste) {
			const pasteArea = document.querySelector('.paste-area') as HTMLElement;
			pasteArea?.focus();
		} else if (!showFileLibrary) {
			textareaRef?.focus();
		}
	}

	function refocusInput() {
		if (!showFilePaste && !showFileLibrary) {
			textareaRef?.focus();
		}
	}

	function handleGlobalClick(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (target.closest('.paste-area') || target.closest('textarea') || target.closest('input')) return;
		const selection = window.getSelection();
		if (selection && selection.toString().length > 0) return;
		setTimeout(refocusInput, 0);
	}
</script>

<div class="chat-container" style="--current-accent: {currentAccentColor}; --current-accent-bg: {currentAccentBg}">
	<!-- Messages Area -->
	<div class="messages-area">
		<div class="messages-content">
			{#if hasMore}
				<button class="load-more-btn" onclick={loadMoreMessages} disabled={isLoadingMore}>
					{isLoadingMore ? 'Loading...' : 'Load older messages'}
				</button>
			{/if}

			{#each allMessages as msg, index}
				{@const msgAccentColor = getPersonaAccentColor(msg.persona_name)}
				{@const msgAccentBg = getPersonaAccentBg(msg.persona_name)}
				<MessageGroup
					userMessage={msg.user_message}
					aiResponse={msg.ai_response}
					personaName={msg.persona_name}
					accentColor={msgAccentColor}
					accentBg={msgAccentBg}
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

			{#if $isLoading && $currentMessage}
				<MessageGroup
					userMessage={$currentMessage.boss}
					aiResponse={$currentMessage.ai}
					personaName={selectedPersona}
					accentColor={currentAccentColor}
					accentBg={currentAccentBg}
					turnNumber={allMessages.length + 1}
					timestamp={$currentMessage.timestamp}
					isLoading={true}
					showActions={true}
					onDelete={handleAbortCurrentMessage}
				/>
			{/if}

			<div bind:this={messagesEndRef}></div>
		</div>
	</div>

	<!-- Input Area -->
	<div class="input-area">
		<div class="input-container">
			<div class="input-field-wrapper">
				<div class="input-controls">
					<button
						class="control-btn hit-target"
						class:active={showFilePaste}
						title="Paste file content"
						onclick={handlePaperclipClick}
					>
						<Icon src={LuPaperclip} size="11" />
					</button>

					<div class="folder-wrapper">
						<button
							class="control-btn hit-target"
							class:active={showFileLibrary}
							title="File library"
							onclick={handleFolderClick}
						>
							<Icon src={LuFolder} size="11" />
						</button>
						{#if showFileLibrary}
							<ContentLibrary
								mode="chat"
								items={files}
								currentItemId={null}
								isDeleting={isDeletingFile}
								onToggle={toggleFile}
								onRename={renameFile}
								onDelete={handleFileDeleteClick}
								onClear={clearAllFiles}
							/>
						{/if}
					</div>

					<button class="control-btn hit-target" title="Download from cloud">
						<Icon src={LuCloudDownload} size="11" />
					</button>

					<PersonaDropdown
						selectedPersona={selectedPersona}
						onSelect={selectPersona}
					/>

					<div class="icon-group">
						<ScrollControls config={CHAT_CONFIG} />
					</div>

					<div class="nuke-wrapper">
						<button class="control-btn hit-target settings-btn" title="Nuke data" onclick={toggleNukeMenu} bind:this={nukeButtonRef}>
							<Icon src={LuFlame} size="11" />
						</button>
						<NukeMenu
							isOpen={showNukeMenu}
							onClose={() => showNukeMenu = false}
							onNukeComplete={handleNukeComplete}
							triggerRef={nukeButtonRef}
						/>
					</div>
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

	{#if showFilePaste}
		<PasteArea onClose={() => showFilePaste = false} onSuccess={handleFilePasteSuccess} />
	{/if}

	<ConfirmationModal
		isOpen={deleteConfirm.isActive}
		progress={deleteConfirm.progress}
		onCancel={() => deleteConfirm.cancel()}
		mode="chat"
	/>

	
	<ConfirmationModal
		isOpen={fileDeleteConfirm.isActive}
		progress={fileDeleteConfirm.progress}
		onCancel={() => fileDeleteConfirm.cancel()}
		mode="chat"
	/>

	<ConfirmationModal
		isOpen={chartDeleteConfirm.isActive}
		progress={chartDeleteConfirm.progress}
		onCancel={() => chartDeleteConfirm.cancel()}
		mode="chat"
	/>

	<CanvasContainer
		mode="chat"
		charts={allCharts}
		bind:selectedChartIndex
		bind:showLightbox
		enableDelete={true}
		onDelete={handleChartDeleteClick}
	/>
</div>

<svelte:window onkeydown={handleKeydown} onfocus={handleWindowFocus} onclick={handleGlobalClick} />

<style>
	.chat-container {
		display: grid;
		grid-template-rows: 1fr auto;
		grid-template-columns: var(--middle-section-width) 1fr;
		grid-template-areas:
			'messages canvas'
			'input canvas';
		height: 100vh;
		margin-left: var(--sidebar-width);
		overflow: hidden;
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		position: relative;
	}

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

	.messages-area {
		grid-area: messages;
		padding: var(--layout-padding);
		position: relative;
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.messages-content {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--message-gap);
	}

	.input-area {
		grid-area: input;
		background: hsl(var(--card));
		border-top: 1px solid hsl(var(--chat-border));
		border-right: 1px solid hsl(var(--chat-border));
		padding: 0 var(--layout-padding);
		min-height: var(--input-bar-height);
		box-sizing: border-box;
		position: sticky;
		bottom: 0;
		z-index: 10;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.input-controls {
		display: flex;
		align-items: center;
		gap: var(--action-icon-gap);
		margin-bottom: 0px;
		flex-wrap: nowrap;
		overflow: visible;
	}

	.folder-wrapper {
		position: relative;
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
		color: var(--current-accent);
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

	.nuke-wrapper {
		position: relative;
	}

	@media (min-width: 901px) {
		.nuke-wrapper {
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
		color: var(--current-accent);
		border: 1px solid var(--current-accent);
		border-radius: 6px;
		padding: 12px 24px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.send-button:hover {
		background: var(--current-accent);
		color: hsl(var(--background));
	}

	.messages-area::-webkit-scrollbar {
		display: none;
	}

	.messages-area {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}

	.message-input:disabled,
	.send-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.send-button:hover:not(:disabled) {
		background: var(--current-accent);
		color: hsl(var(--background));
	}

	.load-more-btn {
		background: transparent;
		border: 1px solid hsl(var(--border));
		border-radius: 6px;
		padding: 8px 16px;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.2s;
		margin: 0 auto 16px;
		display: block;
		font-size: 0.875rem;
	}

	.load-more-btn:hover:not(:disabled) {
		border-color: hsl(var(--foreground));
		color: hsl(var(--foreground));
	}

	.load-more-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
