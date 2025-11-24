<script lang="ts">
	import { onMount } from 'svelte';
	import { renderMarkdown } from '$lib/markdown-renderer';
	import { Icon } from 'svelte-icons-pack';
	import { LuPaperclip, LuFolder, LuCloudDownload, LuChevronDown, LuArrowDown, LuArrowUp, LuMessageSquare, LuFlame } from 'svelte-icons-pack/lu';


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
	let selectedPersona = $state<'gunnar' | 'kirby'>('gunnar');
	let inputMessage = $state('');
	let showPasteArea = $state(false);
	let isProcessing = $state(false);
	let processingStatus = $state('');
	let processingError = $state<string | null>(null);
	let streamingContent = $state('');
	let currentRetryAttempt = $state(0);
	let abortController: AbortController | null = null;

	// Canvas carousel state
	let charts = $state<Array<{ id: string; thumbnail_url: string; full_url: string; alt: string }>>([]);
	let selectedChartIndex = $state<number | null>(null);
	let showLightbox = $state(false);

	// Messages container ref for auto-scroll
	let messagesContainer: HTMLDivElement | null = null;

	// Mock data for testing (TODO: fetch from database)
	const MOCK_CHARTS = [
		{ id: '1', thumbnail_url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=150&h=150&fit=crop', full_url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&h=800&fit=crop', alt: 'Revenue growth analytics dashboard' },
		{ id: '2', thumbnail_url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=150&h=150&fit=crop', full_url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&h=800&fit=crop', alt: 'Market trends and projections' },
		{ id: '3', thumbnail_url: 'https://images.unsplash.com/photo-1543286386-713bdd548da4?w=150&h=150&fit=crop', full_url: 'https://images.unsplash.com/photo-1543286386-713bdd548da4?w=1200&h=800&fit=crop', alt: 'Data visualization pie chart' },
		{ id: '4', thumbnail_url: 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=150&h=150&fit=crop', full_url: 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=1200&h=800&fit=crop', alt: 'Statistical analysis graphs' },
		{ id: '5', thumbnail_url: 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=150&h=150&fit=crop', full_url: 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1200&h=800&fit=crop', alt: 'Performance metrics dashboard' },
		{ id: '6', thumbnail_url: 'https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=150&h=150&fit=crop', full_url: 'https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=1200&h=800&fit=crop', alt: 'Business intelligence charts' }
	];

	// Load mock charts on mount (for demo)
	onMount(() => {
		if (typeof window !== 'undefined') {
			localStorage.setItem('asura_app_mode', 'reader');
			// Load mock data after a short delay to simulate article processing
			setTimeout(() => {
				charts = MOCK_CHARTS;
				// Don't auto-select any chart - let user click to view
				selectedChartIndex = null;
				showLightbox = false;
			}, 1000);
		}
	});

	// Toggle paste area
	function handlePaperclipClick() {
		showPasteArea = !showPasteArea;
		if (showPasteArea) {
			// Clear any existing article
			currentArticle = null;
			streamingContent = '';
			processingError = null;
		}
	}

	// Handle paste event
	function handlePaste(event: ClipboardEvent) {
		event.preventDefault();

		const html = event.clipboardData?.getData('text/html');
		if (html) {
			console.log('[Paste] HTML content received:', html.substring(0, 200));

			// Create a temporary div to parse the HTML
			const temp = document.createElement('div');
			temp.innerHTML = html;

			// Remove all style attributes and color-related inline styles
			const allElements = temp.querySelectorAll('*');
			allElements.forEach((el) => {
				el.removeAttribute('style');
				el.removeAttribute('color');
				el.removeAttribute('bgcolor');
			});

			// Insert the cleaned HTML
			const pasteArea = event.target as HTMLElement;
			if (pasteArea) {
				pasteArea.innerHTML = temp.innerHTML;
			}

			// Start processing pipeline automatically
			processArticle(html);
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
					console.log(`[Retry] ${stepName} - Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
					processingStatus = `${stepName} (Retry ${attempt + 2}/${maxRetries + 1})`;
					await new Promise(resolve => setTimeout(resolve, delay));
				}
			}
		}

		throw lastError;
	}

	// Abort processing
	function abortProcessing() {
		if (abortController) {
			abortController.abort();
			abortController = null;
		}
		isProcessing = false;
		processingStatus = '';
		processingError = 'Processing cancelled by user';
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
			console.log('[Pipeline] Article created:', articleId, articleTitle);

			// Step 2: Convert to PDF and extract images
			processingStatus = 'Converting to PDF...';
			await retryWithBackoff(async () => {
				const response = await fetch('/api/reader/convert-pdf', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ article_id: articleId, html }),
					signal: abortController?.signal
				});

				if (!response.ok) {
					const error = await response.json();
					throw new Error(error.error?.message || 'PDF conversion failed');
				}

				return await response.json();
			}, 2, 1000, 'Converting to PDF...');

			console.log('[Pipeline] PDF converted');

			// Step 3: Filter charts
			processingStatus = 'Filtering charts...';
			await retryWithBackoff(async () => {
				const response = await fetch('/api/reader/filter-charts', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ article_id: articleId }),
					signal: abortController?.signal
				});

				if (!response.ok) {
					const error = await response.json();
					throw new Error(error.error?.message || 'Chart filtering failed');
				}

				return await response.json();
			}, 2, 1000, 'Filtering charts...');

			console.log('[Pipeline] Charts filtered');

			// Step 4: Process article with AI (streaming)
			processingStatus = 'Processing with AI...';
			showPasteArea = false; // Hide paste area when streaming starts

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
								streamingContent += data.text;
							}

							if (data.done) {
								console.log('[Pipeline] Processing complete');

								// Validate streaming content before display
								if (streamingContent.trim().length === 0) {
									throw new Error('AI returned empty response');
								}

								currentArticle = {
									id: articleId,
									title: articleTitle,
									content: streamingContent
								};
								isProcessing = false;
								processingStatus = '';
								abortController = null;

								// Load chat history for this article
								await loadChatHistory(articleId);
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
				console.log('[Chat History] Loaded', chatHistory.length, 'turns');

				// Auto-scroll to bottom after loading history
				setTimeout(() => scrollToBottom(), 100);
			}
		} catch (error) {
			console.error('[Chat History] Error loading:', error);
		}
	}

	// Auto-scroll to bottom of messages
	function scrollToBottom() {
		if (messagesContainer) {
			messagesContainer.scrollTo({
				top: messagesContainer.scrollHeight,
				behavior: 'smooth'
			});
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

		// Set current user message for display
		currentUserMessage = userMessage;
		streamingChatResponse = '';
		isLoadingChat = true;

		// Scroll to show user's message
		setTimeout(() => scrollToBottom(), 100);

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
								console.log('[Q&A] Response complete');

								// Add completed turn to history
								chatHistory = [
									...chatHistory,
									{ role: 'user', content: userMessage },
									{ role: 'assistant', content: streamingChatResponse }
								];

								// Reset streaming state
								currentUserMessage = null;
								streamingChatResponse = '';
								isLoadingChat = false;

								// Auto-scroll to bottom
								setTimeout(() => scrollToBottom(), 100);
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

	// Canvas carousel functions
	function openLightbox(index: number) {
		selectedChartIndex = index;
		showLightbox = true;
	}

	function closeLightbox() {
		showLightbox = false;
		selectedChartIndex = null;
	}

	function navigateChart(direction: 'prev' | 'next') {
		if (selectedChartIndex === null) return;

		if (direction === 'prev') {
			selectedChartIndex = selectedChartIndex > 0 ? selectedChartIndex - 1 : charts.length - 1;
		} else {
			selectedChartIndex = selectedChartIndex < charts.length - 1 ? selectedChartIndex + 1 : 0;
		}
	}

	// Keyboard navigation
	function handleKeydown(event: KeyboardEvent) {
		if (!showLightbox) return;

		if (event.key === 'Escape') {
			closeLightbox();
		} else if (event.key === 'ArrowLeft') {
			navigateChart('prev');
		} else if (event.key === 'ArrowRight') {
			navigateChart('next');
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="reader-container">
	<!-- Messages Area -->
	<div class="messages-area" bind:this={messagesContainer}>
		<div class="messages-content">
			<!-- Paste Area Card -->
			{#if showPasteArea}
				<div class="paste-box" class:has-error={processingError}>
					{#if isProcessing}
						<!-- Loading Spinner -->
						<div class="spinner-container">
							<div class="spinner">
								<div class="spinner-bar" style="--bar-index: 0"></div>
								<div class="spinner-bar" style="--bar-index: 1"></div>
								<div class="spinner-bar" style="--bar-index: 2"></div>
								<div class="spinner-bar" style="--bar-index: 3"></div>
								<div class="spinner-bar" style="--bar-index: 4"></div>
								<div class="spinner-bar" style="--bar-index: 5"></div>
								<div class="spinner-bar" style="--bar-index: 6"></div>
								<div class="spinner-bar" style="--bar-index: 7"></div>
								<div class="spinner-bar" style="--bar-index: 8"></div>
								<div class="spinner-bar" style="--bar-index: 9"></div>
								<div class="spinner-bar" style="--bar-index: 10"></div>
								<div class="spinner-bar" style="--bar-index: 11"></div>
							</div>
							{#if processingStatus}
								<div class="processing-status">{processingStatus}</div>
							{/if}
							<button class="abort-button" onclick={abortProcessing}>
								Cancel
							</button>
						</div>
					{/if}

					{#if processingError}
						<!-- Error State -->
						<div class="error-container">
							<div class="error-message">
								<strong>Error:</strong> {processingError}
							</div>
							<button class="retry-button" onclick={retryProcessing}>
								Retry
							</button>
						</div>
					{:else}
						<!-- Paste Area -->
						<div
							class="paste-area"
							contenteditable="true"
							onpaste={handlePaste}
							data-placeholder="Paste article here..."
						></div>
					{/if}
				</div>
			{/if}

			<!-- Article Display -->
			{#if currentArticle || streamingContent}
				<div class="message-group" data-role="boss">
					<div class="boss-message" data-mode="reader">
						<div class="message-header">
							<span class="boss-label" data-mode="reader">BOSS</span>
						</div>
						<div class="message-text">
							Let's explore: {currentArticle?.title || 'Article'}
						</div>
					</div>
				</div>

				<div class="message-group" data-role="gunnar">
					<div class="gunnar-message">
						<div class="message-header">
							<span class="gunnar-label">GUNNAR</span>
						</div>
						<div class="message-text">
							{@html renderMarkdown(currentArticle?.content || streamingContent)}
						</div>
					</div>
				</div>

				<!-- Q&A History -->
				{#each chatHistory as turn}
					{#if turn.role === 'user'}
						<div class="message-group" data-role="boss">
							<div class="boss-message" data-mode="reader">
								<div class="message-header">
									<span class="boss-label" data-mode="reader">BOSS</span>
								</div>
								<div class="message-text">
									{turn.content}
								</div>
							</div>
						</div>
					{:else}
						<div class="message-group" data-role="gunnar">
							<div class="gunnar-message">
								<div class="message-header">
									<span class="gunnar-label">GUNNAR</span>
								</div>
								<div class="message-text">
									{@html renderMarkdown(turn.content)}
								</div>
							</div>
						</div>
					{/if}
				{/each}

				<!-- Current Q&A Turn (streaming) -->
				{#if currentUserMessage}
					<div class="message-group" data-role="boss">
						<div class="boss-message" data-mode="reader">
							<div class="message-header">
								<span class="boss-label" data-mode="reader">BOSS</span>
							</div>
							<div class="message-text">
								{currentUserMessage}
							</div>
						</div>
					</div>

					<div class="message-group" data-role="gunnar">
						<div class="gunnar-message">
							<div class="message-header">
								<span class="gunnar-label">GUNNAR</span>
								{#if isLoadingChat && !streamingChatResponse}
									<span class="loading-indicator">●</span>
								{/if}
							</div>
							<div class="message-text">
								{@html renderMarkdown(streamingChatResponse || '')}
							</div>
						</div>
					</div>
				{/if}
			{:else if !showPasteArea}
				<!-- Placeholder content -->
				<div class="placeholder-content">
					<h1>E-Reader Mode</h1>
					<p>Click the paperclip to paste an article.</p>
				</div>
			{/if}
		</div>
	</div>

	<!-- Canvas Area - Chart Carousel -->
	<div class="canvas-area">
		{#if charts.length > 0}
			{#if showLightbox && selectedChartIndex !== null}
				<!-- Full-size chart view (takes remaining space above thumbnails) -->
				<div class="canvas-chart-view">
					<div class="chart-view-header">
						<div class="chart-view-info">
							<span class="chart-counter">{selectedChartIndex + 1} / {charts.length}</span>
							<span class="chart-title">{charts[selectedChartIndex].alt}</span>
						</div>
						<button class="chart-view-close" onclick={closeLightbox} title="Close (Esc)">
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
						</button>
					</div>

					<div class="chart-view-image">
						<button class="chart-nav chart-nav-prev" onclick={() => navigateChart('prev')} title="Previous (←)">
							<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
						</button>

						<img src={charts[selectedChartIndex].full_url} alt={charts[selectedChartIndex].alt} />

						<button class="chart-nav chart-nav-next" onclick={() => navigateChart('next')} title="Next (→)">
							<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
						</button>
					</div>
				</div>
			{/if}

			<!-- Thumbnail grid (always visible when charts exist) -->
			<div class="chart-grid">
				{#each charts as chart, index}
					<button
						class="chart-thumbnail"
						class:active={showLightbox && selectedChartIndex === index}
						onclick={() => openLightbox(index)}
						title={chart.alt}
					>
						<img src={chart.thumbnail_url} alt={chart.alt} />
						<div class="chart-overlay">
							<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
						</div>
					</button>
				{/each}
			</div>
		{:else}
			<div class="canvas-empty">
				<p>No charts found in this article</p>
			</div>
		{/if}
	</div>

	<!-- Input Area -->
	<div class="input-area" data-mode="reader">
		<div class="input-container">
			<div class="input-field-wrapper">
				<div class="input-controls">
					<!-- Paperclip icon (active - triggers paste area) -->
					<button class="control-btn" title="Paste article" onclick={handlePaperclipClick}>
						<Icon src={LuPaperclip} size="11" />
					</button>

					<!-- Folder icon (decorative only) -->
					<button class="control-btn" title="Files (disabled)" disabled>
						<Icon src={LuFolder} size="11" />
					</button>

					<button class="control-btn" title="Download from cloud"><Icon src={LuCloudDownload} size="11" /></button>

					<div class="persona-dropdown">
						<span class="persona-name">{selectedPersona.charAt(0).toUpperCase() + selectedPersona.slice(1)}</span>
						<Icon src={LuChevronDown} size="11" />
					</div>

					<div class="icon-group">
						<button class="control-btn" title="Auto-scroll">
							<svg width="11" height="11" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
								<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/>
							</svg>
						</button>
						<button class="control-btn" title="Next turn"><Icon src={LuArrowDown} size="11" /></button>
						<button class="control-btn" title="Previous turn"><Icon src={LuArrowUp} size="11" /></button>
						<button class="control-btn" title="Messages"><Icon src={LuMessageSquare} size="11" /></button>
					</div>

					<button class="control-btn settings-btn" title="Nuke all history"><Icon src={LuFlame} size="11" /></button>
				</div>
				<input
					type="text"
					placeholder="Type your message..."
					class="message-input"
					bind:value={inputMessage}
					onkeypress={handleKeyPress}
					disabled={isLoadingChat}
				/>
			</div>
			<button class="send-button" onclick={handleSubmitQuestion} disabled={isLoadingChat || !inputMessage.trim()}>
				Send
			</button>
		</div>
	</div>
</div>

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

	/* Canvas area - Chart carousel */
	.canvas-area {
		grid-area: canvas;
		background: hsl(var(--background));
		border-left: 1px solid hsl(var(--border) / 0.3);
		display: flex;
		flex-direction: column;
		justify-content: flex-end; /* Push thumbnails to bottom */
		overflow: hidden; /* Prevent overflow, let child containers handle scrolling */
	}

	/* Chart Grid - macOS style (fixed height container at bottom, aligned with input bar) */
	.chart-grid {
		display: flex;
		flex-direction: row;
		gap: 8px;
		width: 100%;
		padding: 12px 16px; /* Reduced top/bottom padding to align with input bar */
		justify-content: center;
		flex-wrap: nowrap;
		overflow-x: auto;
		flex-shrink: 0; /* Don't shrink this container */
		height: 104px; /* Fixed height: 80px thumbnails + 12px padding top/bottom */
		align-items: center;
		background: hsl(var(--background));
	}

	.chart-thumbnail {
		position: relative;
		flex-shrink: 0;
		width: auto;
		height: 80px;
		aspect-ratio: 1;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border) / 0.2);
		border-radius: 8px;
		overflow: hidden;
		cursor: pointer;
		transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08), 0 1px 1px rgba(0, 0, 0, 0.06);
	}

	.chart-thumbnail:hover {
		transform: scale(1.05);
		box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2), 0 4px 8px rgba(0, 0, 0, 0.15);
		border-color: var(--reader-accent);
	}

	.chart-thumbnail:active {
		transform: scale(0.98);
	}

	/* Active thumbnail state - highlighted when viewing full-size */
	.chart-thumbnail.active {
		border-color: var(--reader-accent);
		border-width: 2px;
		box-shadow: 0 0 0 2px var(--reader-accent-alpha);
	}

	.chart-thumbnail img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		background: hsl(var(--background));
	}

	.chart-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(16, 185, 129, 0.9);
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.2s ease;
		color: white;
	}

	.chart-thumbnail:hover .chart-overlay {
		opacity: 1;
	}

	/* Empty state */
	.canvas-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 200px;
		color: hsl(var(--muted-foreground));
		font-size: 10pt;
		text-align: center;
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

	/* Message Groups (for future use) */
	.message-group {
		position: relative;
		margin-bottom: 16px;
	}

	/* Boss Message - reader mode styling */
	.boss-message[data-mode="reader"] {
		background: var(--reader-bg);
		padding: var(--boss-card-padding-y) var(--boss-card-padding-x);
		margin-left: var(--boss-card-margin-x);
		margin-right: var(--boss-card-margin-x);
		border-radius: var(--boss-card-border-radius);
		border-left: 3px solid var(--reader-accent);
	}

	/* Boss label - reader mode color */
	.boss-label[data-mode="reader"] {
		color: var(--reader-accent);
		border-bottom: 1px solid var(--reader-accent);
		font-size: 8pt;
		font-weight: 600;
		letter-spacing: 0.05em;
		padding-bottom: 2px;
	}

	/* Gunnar Message - reader mode styling */
	.gunnar-message {
		background: transparent;
		padding: var(--boss-card-padding-y) var(--boss-card-padding-x);
		margin-left: var(--boss-card-margin-x);
		margin-right: var(--boss-card-margin-x);
	}

	/* Gunnar label */
	.gunnar-label {
		color: var(--reader-accent);
		border-bottom: 1px solid var(--reader-accent);
		font-size: 8pt;
		font-weight: 600;
		letter-spacing: 0.05em;
		padding-bottom: 2px;
	}

	/* Loading indicator for Q&A streaming */
	.loading-indicator {
		color: var(--reader-accent);
		font-size: 12pt;
		margin-left: 8px;
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 0.3;
		}
		50% {
			opacity: 1;
		}
	}

	/* Message Header */
	.message-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}

	.message-text {
		line-height: 1.6;
		color: hsl(var(--foreground));
		white-space: normal;
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

	/* Paste Area Box - styled for reader mode */
	.paste-box {
		background: rgba(10, 10, 10, 0.85);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid var(--reader-accent);
		padding: var(--boss-card-padding-y) var(--boss-card-padding-x);
		margin-left: var(--boss-card-margin-x);
		margin-right: var(--boss-card-margin-x);
		border-radius: var(--boss-card-border-radius);
		min-height: 300px;
		position: absolute;
		bottom: 80px;
		left: 24px;
		right: 24px;
	}

	/* Frosted glass overlay */
	.paste-box::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(255, 255, 255, 0.03);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border-radius: var(--boss-card-border-radius);
		pointer-events: none;
		z-index: 10;
	}

	/* Paste Area - contenteditable div */
	.paste-area {
		height: 260px;
		overflow-y: auto;
		color: hsl(var(--foreground));
		font-size: 8pt;
		line-height: 1.6;
		outline: none;
		white-space: normal;
		position: relative;
		z-index: 1;
	}

	.paste-area:empty:before {
		content: attr(data-placeholder);
		color: hsl(var(--foreground));
		opacity: 0.5;
		font-size: 8pt;
	}

	/* Override all inline styles for pasted content */
	.paste-area *,
	.paste-area span,
	.paste-area p,
	.paste-area div,
	.paste-area a {
		color: hsl(var(--foreground)) !important;
		background-color: transparent !important;
		font-size: 8pt !important;
		line-height: 1.6 !important;
		font-family: "iA Writer Quattro V", system-ui, -apple-system, sans-serif !important;
	}

	/* Style pasted images */
	.paste-area img {
		max-width: 100%;
		height: auto;
		display: block;
		margin: 12px 0;
		border-radius: 4px;
	}

	/* Loading Spinner */
	.spinner-container {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 11; /* Above frosted glass overlay (z-index: 10) */
		pointer-events: none;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
	}

	.processing-status {
		color: var(--reader-accent);
		font-size: 10pt;
		font-weight: 500;
		text-align: center;
		white-space: nowrap;
	}

	.spinner {
		width: 36px;
		height: 36px;
		position: relative;
		animation: spin 1.2s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.spinner-bar {
		position: absolute;
		width: 2px;
		height: 10px;
		background: var(--reader-accent);
		border-radius: 1.5px;
		top: 5px;
		left: 50%;
		margin-left: -1px;
		transform-origin: center 13px;
		transform: rotate(calc(var(--bar-index) * 30deg));
		opacity: calc(0.2 + (var(--bar-index) / 12) * 0.8);
	}

	/* Gradient effect through opacity */
	.spinner-bar:nth-child(1) { opacity: 0.2; }
	.spinner-bar:nth-child(2) { opacity: 0.27; }
	.spinner-bar:nth-child(3) { opacity: 0.34; }
	.spinner-bar:nth-child(4) { opacity: 0.41; }
	.spinner-bar:nth-child(5) { opacity: 0.48; }
	.spinner-bar:nth-child(6) { opacity: 0.55; }
	.spinner-bar:nth-child(7) { opacity: 0.62; }
	.spinner-bar:nth-child(8) { opacity: 0.69; }
	.spinner-bar:nth-child(9) { opacity: 0.76; }
	.spinner-bar:nth-child(10) { opacity: 0.83; }
	.spinner-bar:nth-child(11) { opacity: 0.90; }
	.spinner-bar:nth-child(12) { opacity: 1.0; }

	/* Error State */
	.paste-box.has-error {
		border-color: rgb(239, 68, 68);
	}

	.error-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding: 40px;
		text-align: center;
	}

	.error-message {
		color: rgb(239, 68, 68);
		font-size: 10pt;
		line-height: 1.6;
	}

	.error-message strong {
		display: block;
		margin-bottom: 8px;
		font-size: 11pt;
	}

	.retry-button {
		background: transparent;
		color: var(--reader-accent);
		border: 1px solid var(--reader-accent);
		border-radius: 6px;
		padding: 10px 24px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.retry-button:hover {
		background: var(--reader-accent);
		color: hsl(var(--background));
	}

	/* Abort Button */
	.abort-button {
		background: transparent;
		color: rgb(239, 68, 68);
		border: 1px solid rgb(239, 68, 68);
		border-radius: 6px;
		padding: 8px 20px;
		font-size: 9pt;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
		pointer-events: all;
		margin-top: 8px;
	}

	.abort-button:hover {
		background: rgb(239, 68, 68);
		color: hsl(var(--background));
	}

	/* Canvas Chart View - Full-size image display (takes remaining space above thumbnails) */
	.canvas-chart-view {
		flex: 1; /* Take remaining vertical space */
		width: 100%;
		display: flex;
		flex-direction: column;
		animation: fadeIn 0.2s ease;
		overflow: hidden;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.chart-view-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px;
		border-bottom: 1px solid hsl(var(--border) / 0.3);
	}

	.chart-view-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.chart-counter {
		font-size: 9pt;
		color: hsl(var(--muted-foreground));
		font-weight: 500;
	}

	.chart-title {
		font-size: 10pt;
		color: hsl(var(--foreground));
		font-weight: 500;
	}

	.chart-view-close {
		background: transparent;
		border: 1px solid hsl(var(--border) / 0.3);
		border-radius: 6px;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: hsl(var(--muted-foreground));
		transition: all 0.2s;
	}

	.chart-view-close:hover {
		background: hsl(var(--accent));
		border-color: hsl(var(--accent));
		color: hsl(var(--accent-foreground));
	}

	.chart-view-image {
		flex: 1;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		overflow: hidden;
	}

	.chart-view-image img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.chart-nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 40px;
		height: 40px;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border) / 0.3);
		border-radius: 8px;
		color: hsl(var(--foreground));
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.chart-nav:hover {
		background: hsl(var(--accent));
		border-color: hsl(var(--accent));
		color: hsl(var(--accent-foreground));
		transform: translateY(-50%) scale(1.05);
	}

	.chart-nav-prev {
		left: 16px;
	}

	.chart-nav-next {
		right: 16px;
	}
</style>
