<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { Icon } from 'svelte-icons-pack';
	import { LuPaperclip, LuFolder, LuCloudDownload, LuFlame } from 'svelte-icons-pack/lu';
	import { READER_CONFIG, scrollToTurn, getTurns } from '$lib/ui/scroll';
	import { createConfirmation } from '$lib/composables';
	import ScrollControls from '$lib/components/ScrollControls.svelte';
	import MessageGroup from '$lib/components/MessageGroup.svelte';
	import ConfirmationModal from '$lib/components/ConfirmationModal.svelte';
	import PersonaDropdown from '$lib/components/PersonaDropdown.svelte';
	import { ArticlePasteArea, ArticleLibrary, ChartCarousel } from '$lib/components/reader';
	import { stripFigureCaptions } from '$lib/utils/strip-metadata';


	// Article state
	let currentArticle = $state<{
		id: string;
		title: string;
		content: string;
	} | null>(null);

	// Q&A state
	type ChatTurn = {
		role: 'user' | 'assistant';
		content: string;
	};
	let chatHistory = $state<ChatTurn[]>([]);
	let currentUserMessage = $state<string | null>(null);
	let streamingChatResponse = $state('');
	let isLoadingChat = $state(false);

	// UI state
	let selectedPersona = $state<'samara'>('samara');
	let inputMessage = $state('');
	let textareaRef: HTMLTextAreaElement;
	let showPasteArea = $state(false);
	let isProcessing = $state(false);
	let processingStatus = $state('');
	let processingError = $state<string | null>(null);
	let streamingContent = $state('');
	let currentRetryAttempt = $state(0);
	let abortController: AbortController | null = null;

	// Canvas carousel state
	let charts = $state<Array<{ id: string; thumbnail_url: string; full_url: string; alt: string }>>([]);
	let chatCharts = $state<Array<{ id: string; thumbnail_url: string; full_url: string; alt: string }>>([]);
	let chatChartsIds = $state<string[]>([]); // Track assistant message IDs
	let selectedChartIndex = $state<number | null>(null);
	let showLightbox = $state(false);

	// Combined charts for carousel (article charts + Q&A response charts)
	const allCharts = $derived([...charts, ...chatCharts]);

	// Messages container ref for auto-scroll
	let messagesContainer: HTMLDivElement | null = null;

	// Article library state
	let showArticleLibrary = $state(false);
	let articles = $state<Array<{ id: string; title: string; created_at: string }>>([]);

	// Confirmation composables (replaces manual timer state)
	const deleteConfirm = createConfirmation();
	const nukeConfirm = createConfirmation();
	let isDeleting = $state(false);

	// Save active article to user settings
	async function saveActiveArticle(articleId: string | null) {
		try {
			const response = await fetch('/api/settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ active_reader_article_id: articleId })
			});

			if (!response.ok) {
				console.error('[Settings] Failed to save active article:', response.statusText);
			}
		} catch (error) {
			console.error('[Settings] Error saving active article:', error);
		}
	}

	// Load active article from user settings
	async function loadActiveArticle() {
		try {
			const response = await fetch('/api/settings');
			if (!response.ok) {
				console.error('[Settings] Failed to load settings:', response.statusText);
				return;
			}

			const data = await response.json();

			if (data.active_reader_article_id) {
				await switchToArticle(data.active_reader_article_id, false);
			}
		} catch (error) {
			console.error('[Settings] Error loading active article:', error);
		}
	}

	// Load initial data on mount
	onMount(() => {
		if (typeof window !== 'undefined') {
			localStorage.setItem('asura_app_mode', 'reader');
			// Load articles from database
			loadArticles();
			// Load active article from settings
			loadActiveArticle();
		}
	});

	// Toggle paste area
	async function handlePaperclipClick() {
		showPasteArea = !showPasteArea;
		if (showPasteArea) {
			// Clear any existing article and charts
			currentArticle = null;
			streamingContent = '';
			processingError = null;
			charts = [];
			chatCharts = [];
			chatChartsIds = [];
			chatHistory = [];
			// Focus the paste area after DOM updates
			await tick();
			const pasteArea = document.querySelector('.paste-area') as HTMLElement;
			pasteArea?.focus();
		}
	}

	// Retry utility with exponential backoff
	async function retryWithBackoff<T>(
		fn: () => Promise<T>,
		maxRetries: number = 2,
		baseDelay: number = 1000,
		stepName: string = 'Operation'
	): Promise<T> {
		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				currentRetryAttempt = attempt;
				return await fn();
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				if (attempt < maxRetries) {
					const delay = baseDelay * Math.pow(2, attempt);
					processingStatus = `${stepName} (Retry ${attempt + 2}/${maxRetries + 1})`;
					await new Promise(resolve => setTimeout(resolve, delay));
				}
			}
		}

		throw lastError;
	}

	// Abort processing
	async function abortProcessing() {
		if (abortController) {
			abortController.abort();
			abortController = null;
		}
		isProcessing = false;
		processingStatus = '';

		// If we have a partial article, delete it from database
		if (currentArticle?.id) {
			try {
				await fetch('/api/reader/articles', {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ article_id: currentArticle.id })
				});
			} catch (error) {
				console.error('[Abort] Failed to delete partial article:', error);
			}
		}

		// Clear state and return to paste area
		currentArticle = null;
		streamingContent = '';
		processingError = null;
		showPasteArea = true;
	}

	// Process article through the pipeline
	async function processArticle(html: string) {
		isProcessing = true;
		processingError = null;
		streamingContent = '';
		abortController = new AbortController();
		currentRetryAttempt = 0;

		try {
			// Step 1: Upload article and extract title
			processingStatus = 'Creating article...';
			const uploadResult = await retryWithBackoff(async () => {
				const response = await fetch('/api/reader/upload', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ html }),
					signal: abortController?.signal
				});

				if (!response.ok) {
					const error = await response.json();
					throw new Error(error.error?.message || 'Upload failed');
				}

				return await response.json();
			}, 2, 1000, 'Creating article...');

			const articleId = uploadResult.article_id;
			const articleTitle = uploadResult.title;

			// Step 2: Extract images from HTML
			processingStatus = 'Extracting images...';
			await retryWithBackoff(async () => {
				const response = await fetch('/api/reader/extract-images', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ article_id: articleId, html }),
					signal: abortController?.signal
				});

				if (!response.ok) {
					const error = await response.json();
					throw new Error(error.error?.message || 'Image extraction failed');
				}

				return await response.json();
			}, 2, 1000, 'Extracting images...');

			// Step 3: Process article with AI (streaming)
			processingStatus = 'Processing with AI...';

			const response = await fetch('/api/reader/process-article', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ article_id: articleId }),
				signal: abortController?.signal
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error?.message || 'Article processing failed');
			}

			// Stream the response
			const reader = response.body?.getReader();
			const decoder = new TextDecoder();

			if (reader) {
				while (true) {
					// Check if aborted
					if (abortController?.signal.aborted) {
						reader.cancel();
						throw new Error('Processing cancelled by user');
					}

					const { done, value } = await reader.read();
					if (done) break;

					const chunk = decoder.decode(value);
					const lines = chunk.split('\n');

					for (const line of lines) {
						if (line.startsWith('data: ')) {
							const data = JSON.parse(line.slice(6));

							if (data.text) {
								// First text chunk arrives - Samara starts speaking
								if (streamingContent.length === 0) {
									showPasteArea = false; // Hide paste area now that content is streaming
									isProcessing = false;
									processingStatus = '';
								}
								streamingContent += data.text;
							}

							if (data.done) {
								// Validate streaming content before display
								if (streamingContent.trim().length === 0) {
									throw new Error('AI returned empty response');
								}

								currentArticle = {
									id: articleId,
									title: articleTitle,
									content: stripFigureCaptions(streamingContent)
								};
								abortController = null;

								// Load chat history for this article
								await loadChatHistory(articleId);

								// Load charts for this article
								await loadCharts(articleId);

								// Reload articles list to include the new article
								await loadArticles();

								// Save as active article
								await saveActiveArticle(articleId);

								return;
							}

							if (data.error) {
								throw new Error(data.error);
							}
						}
					}
				}
			}

		} catch (error) {
			console.error('[Pipeline] Error:', error);

			// Handle abort separately
			if (error instanceof Error && error.name === 'AbortError') {
				processingError = 'Processing cancelled by user';
			} else {
				processingError = error instanceof Error ? error.message : 'Unknown error';
			}

			isProcessing = false;
			processingStatus = '';
			showPasteArea = true; // Show paste area again on error
			abortController = null;
		}
	}

	// Retry manually after error
	function retryProcessing() {
		const pasteArea = document.querySelector('.paste-area') as HTMLElement;
		if (pasteArea && pasteArea.innerHTML) {
			processArticle(pasteArea.innerHTML);
		}
	}

	// Load chat history from database
	async function loadChatHistory(articleId: string) {
		try {
			const response = await fetch(`/api/reader/chat-history?article_id=${articleId}`);
			if (!response.ok) {
				console.error('[Chat History] Failed to load:', response.statusText);
				return;
			}

			const data = await response.json();
			if (data.history && Array.isArray(data.history)) {
				chatHistory = data.history;
			}
		} catch (error) {
			console.error('[Chat History] Error loading:', error);
		}
	}

	// Q&A Submit Handler
	async function handleSubmitQuestion() {
		if (!inputMessage.trim() || !currentArticle?.id || isLoadingChat) {
			return;
		}

		const userMessage = inputMessage.trim();
		const articleId = currentArticle.id;

		// Capture chart index at submit time
		const chartIndexAtSubmit = showLightbox ? selectedChartIndex : null;

		// Clear input immediately
		inputMessage = '';
		resetTextareaHeight();

		// Set current user message for display
		currentUserMessage = userMessage;
		streamingChatResponse = '';
		isLoadingChat = true;

		// Wait for Svelte to render the new Boss card, then scroll to it
		await tick();
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				const turns = getTurns(READER_CONFIG);
				if (turns.length > 0) {
					scrollToTurn(READER_CONFIG, turns[turns.length - 1]);
				}
			});
		});

		try {
			const response = await fetch('/api/reader/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					article_id: articleId,
					message: userMessage,
					chart_index: chartIndexAtSubmit
				})
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error?.message || 'Chat request failed');
			}

			// Stream the response
			const reader = response.body?.getReader();
			const decoder = new TextDecoder();

			if (reader) {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					const chunk = decoder.decode(value);
					const lines = chunk.split('\n');

					for (const line of lines) {
						if (line.startsWith('data: ')) {
							const data = JSON.parse(line.slice(6));

							if (data.text) {
								streamingChatResponse += data.text;
							}

							if (data.done) {
								// Add completed turn to history
								chatHistory = [
									...chatHistory,
									{ role: 'user', content: userMessage },
									{ role: 'assistant', content: streamingChatResponse }
								];

								// Track article_chat_id for chart fetching
								if (data.article_chat_id) {
									chatChartsIds = [...chatChartsIds, data.article_chat_id];
									// Fetch charts after delay (give background job time to run)
									setTimeout(() => {
										loadChatCharts(chatChartsIds);
									}, 2000);
								}

								// Reset streaming state
								currentUserMessage = null;
								streamingChatResponse = '';
								isLoadingChat = false;
								return;
							}

							if (data.error) {
								throw new Error(data.error);
							}
						}
					}
				}
			}
		} catch (error) {
			console.error('[Q&A] Error:', error);

			// Show error in chat
			chatHistory = [
				...chatHistory,
				{ role: 'user', content: userMessage },
				{ role: 'assistant', content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }
			];

			currentUserMessage = null;
			streamingChatResponse = '';
			isLoadingChat = false;
		}
	}

	// Handle Enter key in input
	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSubmitQuestion();
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

	// Keyboard navigation (lightbox nav handled by ChartCarousel component)
	function handleKeydown(event: KeyboardEvent) {
		// Close article library on Escape
		if (event.key === 'Escape' && showArticleLibrary) {
			showArticleLibrary = false;
		}

		// Close paste area on Escape
		if (event.key === 'Escape' && showPasteArea) {
			showPasteArea = false;
		}
	}

	// Auto-focus paste area when window regains focus
	function handleWindowFocus() {
		if (showPasteArea && !isProcessing) {
			const pasteArea = document.querySelector('.paste-area') as HTMLElement;
			pasteArea?.focus();
		}
	}

	// Toggle article library dropdown
	function toggleArticleLibrary(event: MouseEvent) {
		event.stopPropagation();
		showArticleLibrary = !showArticleLibrary;
		if (showArticleLibrary) {
			loadArticles();
		}
	}

	// Load articles from database
	async function loadArticles() {
		try {
			// Cache-bust to ensure fresh data
			const response = await fetch(`/api/reader/articles?_t=${Date.now()}`);
			if (!response.ok) {
				console.error('[Articles] Failed to load:', response.statusText);
				return;
			}

			const data = await response.json();
			if (data.articles && Array.isArray(data.articles)) {
				articles = data.articles;
			}
		} catch (error) {
			console.error('[Articles] Error loading:', error);
		}
	}

	// Switch to different article
	async function switchToArticle(articleId: string, scrollToTop: boolean = true) {
		showArticleLibrary = false;

		// Clear chat charts from previous article
		chatCharts = [];
		chatChartsIds = [];

		try {
			// Refresh article list to ensure dropdown is current
			await loadArticles();

			// Fetch article details
			const response = await fetch(`/api/reader/article?article_id=${articleId}`);
			if (!response.ok) {
				console.error('[Articles] Failed to load article:', response.statusText);
				return;
			}

			const data = await response.json();
			if (data.article) {
				currentArticle = {
					id: data.article.id,
					title: data.article.title,
					content: stripFigureCaptions(data.article.transformed_content || '')
				};

				// Load chat history for this article
				await loadChatHistory(articleId);

				// Load charts for this article
				await loadCharts(articleId);

				// Save as active article
				await saveActiveArticle(articleId);

				// Scroll to top (only when manually switching articles, not on initial load)
				if (scrollToTop) {
					setTimeout(() => {
						const container = document.querySelector('.reader-container') as HTMLElement | null;
						if (container) {
							container.scrollTo({ top: 0, behavior: 'smooth' });
						}
					}, 100);
				}
			}
		} catch (error) {
			console.error('[Articles] Error switching:', error);
		}
	}

	// Load charts for article
	async function loadCharts(articleId: string) {
		try {
			const response = await fetch(`/api/reader/charts?article_id=${articleId}`);
			if (!response.ok) {
				console.error('[Charts] Failed to load:', response.statusText);
				charts = []; // Clear charts on error
				return;
			}

			const data = await response.json();
			if (data.charts && Array.isArray(data.charts)) {
				charts = data.charts;
			}
		} catch (error) {
			console.error('[Charts] Error loading:', error);
			charts = [];
		}
	}

	// Load charts from Q&A responses
	async function loadChatCharts(articleChatIds: string[]) {
		if (articleChatIds.length === 0) {
			chatCharts = [];
			return;
		}

		try {
			const response = await fetch(`/api/reader/chat-charts?ids=${articleChatIds.join(',')}`);
			if (!response.ok) {
				console.error('[ChatCharts] Failed to load:', response.statusText);
				return;
			}

			const data = await response.json();
			if (data.charts) {
				// Flatten charts from all message IDs into single array
				const allChatCharts: typeof chatCharts = [];
				for (const charts of Object.values(data.charts)) {
					allChatCharts.push(...(charts as typeof chatCharts));
				}
				chatCharts = allChatCharts;
			}
		} catch (error) {
			console.error('[ChatCharts] Error loading:', error);
		}
	}

	// Delete article - show confirmation modal with 3s countdown
	function handleArticleDeleteClick(articleId: string, event: MouseEvent) {
		event.stopPropagation(); // Prevent switching to article
		// Keep dropdown open during delete so user can see articles disappear
		deleteConfirm.start(articleId, async () => {
			if (isDeleting) return;

			isDeleting = true;
			const maxRetries = 3;
			let lastError: Error | null = null;

			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				try {
					const response = await fetch('/api/reader/articles', {
						method: 'DELETE',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ article_id: articleId })
					});

					if (response.ok) {
						// If we deleted the current article, clear it
						if (currentArticle?.id === articleId) {
							currentArticle = null;
							chatHistory = [];
							charts = [];
							chatCharts = [];
							chatChartsIds = [];
						}

						// Reload articles list
						await loadArticles();
						isDeleting = false;
						return;
					}

					lastError = new Error(response.statusText);
					console.warn(`[Articles] Delete attempt ${attempt}/${maxRetries} failed:`, response.statusText);
				} catch (error) {
					lastError = error as Error;
					console.warn(`[Articles] Delete attempt ${attempt}/${maxRetries} error:`, error);
				}

				// Wait before retry (exponential backoff: 500ms, 1000ms, 2000ms)
				if (attempt < maxRetries) {
					await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, attempt - 1)));
				}
			}

			console.error('[Articles] Failed to delete after', maxRetries, 'attempts:', lastError);
			isDeleting = false;
		});
	}

	// Nuke all e-reader data - show confirmation modal with 3s countdown
	function handleNukeClick() {
		nukeConfirm.start('nuke', async () => {
			try {
				const response = await fetch('/api/reader/nuke', {
					method: 'POST'
				});

				if (!response.ok) {
					console.error('[Nuke] Failed:', response.statusText);
					return;
				}

				const result = await response.json();

				// Clear all local state
				articles = [];
				currentArticle = null;
				chatHistory = [];
				charts = [];
				chatCharts = [];
				chatChartsIds = [];
			} catch (error) {
				console.error('[Nuke] Error:', error);
			}
		});
	}

	// Handle clicks outside dropdown
	function handleClickOutside(event: MouseEvent) {
		if (!showArticleLibrary) return;
		const dropdown = document.querySelector('.article-library-dropdown');
		if (dropdown && !dropdown.contains(event.target as Node)) {
			showArticleLibrary = false;
		}
	}

	</script>

<svelte:window onkeydown={handleKeydown} onclick={handleClickOutside} onfocus={handleWindowFocus} />

<div class="reader-container">
	<!-- Messages Area -->
	<div class="messages-area" bind:this={messagesContainer}>
		<div class="messages-content">
			<!-- Paste Area Card -->
			{#if showPasteArea}
				<ArticlePasteArea
					{isProcessing}
					{processingStatus}
					{processingError}
					onPaste={processArticle}
					onAbort={abortProcessing}
					onRetry={retryProcessing}
				/>
			{/if}

			<!-- Article Display -->
			{#if currentArticle || streamingContent}
				<MessageGroup
					userMessage={`Let's explore: ${currentArticle?.title || 'Article'}`}
					aiResponse={currentArticle?.content || streamingContent}
					personaName="samara"
					mode="reader"
				/>

				<!-- Q&A History - render as pairs based on role -->
				{#each chatHistory as turn, i}
					{#if turn.role === 'user'}
						{@const nextTurn = chatHistory[i + 1]}
						{#if nextTurn && nextTurn.role === 'assistant'}
							<MessageGroup
								userMessage={turn.content}
								aiResponse={nextTurn.content}
								personaName="samara"
								mode="reader"
							/>
						{/if}
					{/if}
				{/each}

				<!-- Current Q&A Turn (streaming) -->
				{#if currentUserMessage}
					<MessageGroup
						userMessage={currentUserMessage}
						aiResponse={streamingChatResponse}
						personaName="samara"
						mode="reader"
						isLoading={isLoadingChat && !streamingChatResponse}
					/>
				{/if}
			{/if}
		</div>
	</div>

	<!-- Canvas Area - Chart Carousel (article charts + Q&A response charts) -->
	<ChartCarousel charts={allCharts} bind:selectedChartIndex bind:showLightbox />

	<!-- Input Area -->
	<div class="input-area" data-mode="reader">
		<div class="input-container">
			<div class="input-field-wrapper">
				<div class="input-controls">
					<!-- Paperclip icon (active - triggers paste area) -->
					<button class="control-btn" title="Paste article" onclick={handlePaperclipClick}>
						<Icon src={LuPaperclip} size="11" />
					</button>

					<!-- Folder icon (article library) -->
					<div class="article-library-wrapper">
						<button
							class="control-btn"
							class:active={showArticleLibrary}
							title="Article Library"
							onclick={toggleArticleLibrary}
						>
							<Icon src={LuFolder} size="11" />
						</button>
					</div>

					<!-- Article Library Dropdown -->
					{#if showArticleLibrary}
						<ArticleLibrary
							{articles}
							currentArticleId={currentArticle?.id ?? null}
							{isDeleting}
							onSelect={(id) => switchToArticle(id)}
							onDelete={handleArticleDeleteClick}
						/>
					{/if}

					<button class="control-btn" title="Download from cloud"><Icon src={LuCloudDownload} size="11" /></button>

					<PersonaDropdown
						selectedPersona={selectedPersona}
						interactive={false}
					/>

					<div class="icon-group">
						<ScrollControls config={READER_CONFIG} />
					</div>

					<button class="control-btn settings-btn" title="Nuke all history" onclick={handleNukeClick}><Icon src={LuFlame} size="11" /></button>
				</div>
				<textarea
					placeholder="Type your message..."
					class="message-input"
					rows="1"
					bind:this={textareaRef}
					bind:value={inputMessage}
					onkeypress={handleKeyPress}
					oninput={autoResize}
					disabled={isLoadingChat}
				></textarea>
			</div>
			<button class="send-button" onclick={handleSubmitQuestion} disabled={isLoadingChat || !inputMessage.trim()}>
				Send
			</button>
		</div>
	</div>
</div>

<!-- Article Delete Confirmation Modal -->
<ConfirmationModal
	isOpen={deleteConfirm.isActive}
	progress={deleteConfirm.progress}
	onCancel={() => deleteConfirm.cancel()}
	mode="reader"
/>

<!-- Nuke Confirmation Modal -->
<ConfirmationModal
	isOpen={nukeConfirm.isActive}
	progress={nukeConfirm.progress}
	onCancel={() => nukeConfirm.cancel()}
	mode="reader"
/>

<style>
	/* Main Layout - Two-column grid (reader left, canvas right) */
	.reader-container {
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

	/* Responsive adjustments for narrow screens */
	@media (max-width: 900px) {
		.reader-container {
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

	/* Message Groups */
	.message-group {
		position: relative;
		margin-bottom: 16px;
	}

	/* Boss Message - with background card (uses reader accent bg) */
	.boss-message {
		background: var(--reader-bg);
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
		color: var(--reader-accent);
		border-bottom: 1px solid var(--reader-accent);
		position: relative;
		top: -1px;
	}

	.ai-label {
		color: hsl(var(--foreground));
		border-bottom: 1px solid hsl(var(--border));
	}

	/* Message Text */
	.message-text {
		line-height: 1.6;
		color: hsl(var(--foreground));
		white-space: normal;
	}

	/* Loading animation for thinking dots */
	.loading-text {
		color: hsl(var(--muted-foreground));
	}

	.dots span {
		animation: blink 1.4s infinite;
		animation-fill-mode: both;
	}

	.dots span:nth-child(2) {
		animation-delay: 0.2s;
	}

	.dots span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes blink {
		0%, 80%, 100% {
			opacity: 0;
		}
		40% {
			opacity: 1;
		}
	}

	/* Input Area - reader mode styling */
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

	/* Article Library */
	.article-library-wrapper {
		position: relative;
	}

	.control-btn.active {
		color: var(--reader-accent);
	}
</style>
