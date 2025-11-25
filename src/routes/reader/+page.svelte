<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { renderMarkdown } from '$lib/markdown-renderer';
	import { Icon } from 'svelte-icons-pack';
	import { LuPaperclip, LuFolder, LuCloudDownload, LuChevronDown, LuArrowDown, LuArrowUp, LuMessageSquare, LuFlame, LuTrash2 } from 'svelte-icons-pack/lu';
	import { TIMING } from '$lib/config/timing';


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

	// Article library state
	let showArticleLibrary = $state(false);
	let articles = $state<Array<{ id: string; title: string; preview_snippet: string }>>([]);
	let libraryDropdownRef: HTMLDivElement | null = null;
	let libraryButtonRef: HTMLButtonElement | null = null;

	// Article delete confirmation state
	let deleteArticleId = $state<string | null>(null);
	let deleteArticleProgress = $state(0);
	let deleteArticleTimer: number | null = null;
	let isDeleting = $state(false);

	// Nuke confirmation state
	let showNukeModal = $state(false);
	let nukeProgress = $state(0);
	let nukeTimer: number | null = null;

	// Auto-scroll state
	let isAutoScrolling = $state(false);
	let isPaused = $state(false);
	let pauseProgress = $state(0);
	let pauseStartTime = 0;
	let scrollAccumulator = 0;
	const scrollSpeed = 0.5; // pixels per frame

	// Mock data for testing (TODO: fetch from database)
	const MOCK_CHARTS = [
		{ id: '1', thumbnail_url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=150&h=150&fit=crop', full_url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&h=800&fit=crop', alt: 'Revenue growth analytics dashboard' },
		{ id: '2', thumbnail_url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=150&h=150&fit=crop', full_url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&h=800&fit=crop', alt: 'Market trends and projections' },
		{ id: '3', thumbnail_url: 'https://images.unsplash.com/photo-1543286386-713bdd548da4?w=150&h=150&fit=crop', full_url: 'https://images.unsplash.com/photo-1543286386-713bdd548da4?w=1200&h=800&fit=crop', alt: 'Data visualization pie chart' },
		{ id: '4', thumbnail_url: 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=150&h=150&fit=crop', full_url: 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=1200&h=800&fit=crop', alt: 'Statistical analysis graphs' },
		{ id: '5', thumbnail_url: 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=150&h=150&fit=crop', full_url: 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1200&h=800&fit=crop', alt: 'Performance metrics dashboard' },
		{ id: '6', thumbnail_url: 'https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=150&h=150&fit=crop', full_url: 'https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=1200&h=800&fit=crop', alt: 'Business intelligence charts' }
	];

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
				console.log('[Settings] Loading active article:', data.active_reader_article_id);
				await switchToArticle(data.active_reader_article_id);
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
			// Clear any existing article
			currentArticle = null;
			streamingContent = '';
			processingError = null;
			// Focus the paste area after DOM updates
			await tick();
			const pasteArea = document.querySelector('.paste-area') as HTMLElement;
			pasteArea?.focus();
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
	async function abortProcessing() {
		if (abortController) {
			abortController.abort();
			abortController = null;
		}
		isProcessing = false;
		processingStatus = '';

		// If we have a partial article, delete it from database
		if (currentArticle?.id) {
			console.log('[Abort] Deleting partial article:', currentArticle.id);
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

		console.log('[Abort] Processing cancelled, returning to paste area');
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

			console.log('[Pipeline] Images extracted');

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
									console.log('[Streaming] First text chunk arrived');
									showPasteArea = false; // Hide paste area now that content is streaming
									isProcessing = false;
									processingStatus = '';
									if (!isAutoScrolling) {
										console.log('[Auto-scroll] Starting auto-scroll');
										handleAutoScroll();
									}
								}
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
				console.log('[Chat History] Loaded', chatHistory.length, 'turns');

				// Only scroll to bottom if there's existing chat history (not for new articles)
				if (chatHistory.length > 0) {
					setTimeout(() => scrollToBottom(), 100);
				}
			}
		} catch (error) {
			console.error('[Chat History] Error loading:', error);
		}
	}

	// Auto-scroll to bottom of messages
	function scrollToBottom() {
		const container = document.querySelector('.reader-container') as HTMLElement | null;
		if (container) {
			container.scrollTo({
				top: container.scrollHeight,
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
		if (showLightbox) {
			if (event.key === 'Escape') {
				closeLightbox();
			} else if (event.key === 'ArrowLeft') {
				navigateChart('prev');
			} else if (event.key === 'ArrowRight') {
				navigateChart('next');
			}
		}

		// Close article library on Escape
		if (event.key === 'Escape' && showArticleLibrary) {
			showArticleLibrary = false;
		}
	}

	// Toggle article library dropdown
	function toggleArticleLibrary(event: MouseEvent) {
		event.stopPropagation(); // Prevent click from bubbling to window
		showArticleLibrary = !showArticleLibrary;
		console.log('[Article Library] Toggled to:', showArticleLibrary);
		console.log('[Article Library] Articles count:', articles.length);
		if (showArticleLibrary) {
			loadArticles();
			// Position dropdown above button
			setTimeout(() => {
				if (libraryButtonRef && libraryDropdownRef) {
					const buttonRect = libraryButtonRef.getBoundingClientRect();
					const dropdownHeight = libraryDropdownRef.offsetHeight;
					libraryDropdownRef.style.bottom = `${window.innerHeight - buttonRect.top + 8}px`;
					libraryDropdownRef.style.left = `${buttonRect.left}px`;
				}
			}, 0);
		}
	}

	// Load articles from database
	async function loadArticles() {
		try {
			const response = await fetch('/api/reader/articles');
			if (!response.ok) {
				console.error('[Articles] Failed to load:', response.statusText);
				return;
			}

			const data = await response.json();
			if (data.articles && Array.isArray(data.articles)) {
				articles = data.articles;
				console.log('[Articles] Loaded', articles.length, 'articles');
			}
		} catch (error) {
			console.error('[Articles] Error loading:', error);
		}
	}

	// Switch to different article
	async function switchToArticle(articleId: string) {
		showArticleLibrary = false;

		try {
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
					content: data.article.transformed_content
				};

				// Load chat history for this article
				await loadChatHistory(articleId);

				// Load charts for this article
				await loadCharts(articleId);

				// Save as active article
				await saveActiveArticle(articleId);

				// Scroll to top
				setTimeout(() => {
					const container = document.querySelector('.reader-container') as HTMLElement | null;
					if (container) {
						container.scrollTo({ top: 0, behavior: 'smooth' });
					}
				}, 100);
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
				console.log('[Charts] Loaded', charts.length, 'charts');
			}
		} catch (error) {
			console.error('[Charts] Error loading:', error);
			charts = [];
		}
	}

	// Delete article - show confirmation modal with 3s countdown
	function handleArticleDeleteClick(articleId: string, event: MouseEvent) {
		event.stopPropagation(); // Prevent switching to article
		// Keep dropdown open during delete so user can see articles disappear
		deleteArticleId = articleId;
		deleteArticleProgress = 0;

		// Auto-confirm after 3 seconds
		const duration = 3000;
		const interval = 50;
		const increment = (interval / duration) * 100;

		deleteArticleTimer = window.setInterval(() => {
			deleteArticleProgress += increment;
			if (deleteArticleProgress >= 100) {
				if (deleteArticleTimer) clearInterval(deleteArticleTimer);
				handleArticleDeleteConfirm();
			}
		}, interval);
	}

	function handleArticleDeleteCancel() {
		if (deleteArticleTimer) {
			clearInterval(deleteArticleTimer);
			deleteArticleTimer = null;
		}
		deleteArticleId = null;
		deleteArticleProgress = 0;
	}

	async function handleArticleDeleteConfirm() {
		if (deleteArticleTimer) {
			clearInterval(deleteArticleTimer);
			deleteArticleTimer = null;
		}
		const articleId = deleteArticleId;
		deleteArticleId = null;
		deleteArticleProgress = 0;

		if (!articleId || isDeleting) return;

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
					console.log('[Articles] Successfully deleted article:', articleId);

					// If we deleted the current article, clear it
					if (currentArticle?.id === articleId) {
						currentArticle = null;
						chatHistory = [];
						charts = [];
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
	}

	// Nuke all e-reader data - show confirmation modal with 3s countdown
	function handleNukeClick() {
		showNukeModal = true;
		nukeProgress = 0;

		const duration = 3000;
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
		showNukeModal = false;
		nukeProgress = 0;
	}

	async function handleNukeConfirm() {
		if (nukeTimer) {
			clearInterval(nukeTimer);
			nukeTimer = null;
		}
		showNukeModal = false;
		nukeProgress = 0;

		try {
			const response = await fetch('/api/reader/nuke', {
				method: 'POST'
			});

			if (!response.ok) {
				console.error('[Nuke] Failed:', response.statusText);
				return;
			}

			const result = await response.json();
			console.log('[Nuke] Successfully deleted', result.deleted, 'articles');

			// Clear all local state
			articles = [];
			currentArticle = null;
			chatHistory = [];
			charts = [];
		} catch (error) {
			console.error('[Nuke] Error:', error);
		}
	}

	// Handle clicks outside dropdown
	function handleClickOutside(event: MouseEvent) {
		if (showArticleLibrary && libraryDropdownRef && !libraryDropdownRef.contains(event.target as Node)) {
			showArticleLibrary = false;
		}
	}

	// Auto-scroll with pause-first pattern
	// Pattern: Pause 60s → Scroll 15s → Repeat
	function handleAutoScroll() {
		console.log('[E-Reader Auto-scroll] Button clicked, isAutoScrolling:', isAutoScrolling);
		if (isAutoScrolling) {
			// If auto-scroll is active (either scrolling or paused), turn it off
			isAutoScrolling = false;
			isPaused = false;
			pauseProgress = 0;
			scrollAccumulator = 0;
			return;
		}

		// Start with pause phase first
		isAutoScrolling = true;
		isPaused = true;
		pauseProgress = 0;
		scrollAccumulator = 0;
		const container = document.querySelector('.reader-container') as HTMLElement | null;
		console.log('[E-Reader Auto-scroll] Container:', container);
		if (!container) {
			console.log('[E-Reader Auto-scroll] No container found, aborting');
			return;
		}

		let scrollStartTime = Date.now();
		pauseStartTime = Date.now();

		function smoothScroll() {
			if (!isAutoScrolling || !container) return;

			const maxScroll = container.scrollHeight - container.clientHeight;
			const currentScroll = container.scrollTop;
			const now = Date.now();

			if (isPaused) {
				// Pause phase: pause for 60 seconds first
				const pauseElapsed = now - pauseStartTime;
				pauseProgress = Math.min(100, (pauseElapsed / TIMING.autoScrollPause) * 100);

				if (pauseElapsed >= TIMING.autoScrollPause) {
					// Switch to scrolling phase
					isPaused = false;
					scrollStartTime = now;
					pauseProgress = 0;
					scrollAccumulator = 0;
				}
			} else {
				// Scrolling phase: scroll for 30 seconds
				// Check if reached bottom (only during scroll phase, not pause)
				if (maxScroll > 0 && currentScroll >= maxScroll) {
					console.log('[Auto-scroll] Reached bottom, stopping');
					isAutoScrolling = false;
					isPaused = false;
					pauseProgress = 0;
					scrollAccumulator = 0;
					return;
				}

				pauseProgress = 0;
				const scrollElapsed = now - scrollStartTime;
				if (scrollElapsed < TIMING.autoScrollDuration) {
					scrollAccumulator += scrollSpeed;
					const pixelsToScroll = Math.floor(scrollAccumulator);
					if (pixelsToScroll > 0) {
						container.scrollTop = currentScroll + pixelsToScroll;
						scrollAccumulator -= pixelsToScroll;
					}
				} else {
					// Switch back to pause phase
					isPaused = true;
					pauseStartTime = now;
					scrollAccumulator = 0;
				}
			}

			requestAnimationFrame(smoothScroll);
		}

		smoothScroll();
	}
</script>

<svelte:window onkeydown={handleKeydown} onclick={handleClickOutside} />

<div class="reader-container">
	<!-- Messages Area -->
	<div class="messages-area" bind:this={messagesContainer}>
		<div class="messages-content">
			<!-- Paste Area Card -->
			{#if showPasteArea}
				<div class="paste-box" class:has-error={processingError}>
					{#if isProcessing}
						<!-- Frosted Glass Overlay -->
						<div class="processing-overlay"></div>

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
				<div class="message-group">
					<div class="boss-message">
						<div class="message-header">
							<span class="message-label boss-label">Boss</span>
						</div>
						<div class="message-text">
							Let's explore: {currentArticle?.title || 'Article'}
						</div>
					</div>
				</div>

				<div class="message-group">
					<div class="ai-message">
						<div class="message-header">
							<span class="message-label ai-label">Samara</span>
						</div>
						<div class="message-text">
							{@html renderMarkdown(currentArticle?.content || streamingContent, 'reader')}
						</div>
					</div>
				</div>

				<!-- Q&A History -->
				{#each chatHistory as turn}
					{#if turn.role === 'user'}
						<div class="message-group">
							<div class="boss-message">
								<div class="message-header">
									<span class="message-label boss-label">Boss</span>
								</div>
								<div class="message-text">
									{turn.content}
								</div>
							</div>
						</div>
					{:else}
						<div class="message-group">
							<div class="ai-message">
								<div class="message-header">
									<span class="message-label ai-label">Samara</span>
								</div>
								<div class="message-text">
									{@html renderMarkdown(turn.content, 'reader')}
								</div>
							</div>
						</div>
					{/if}
				{/each}

				<!-- Current Q&A Turn (streaming) -->
				{#if currentUserMessage}
					<div class="message-group">
						<div class="boss-message">
							<div class="message-header">
								<span class="message-label boss-label">Boss</span>
							</div>
							<div class="message-text">
								{currentUserMessage}
							</div>
						</div>
					</div>

					<div class="message-group">
						<div class="ai-message">
							<div class="message-header">
								<span class="message-label ai-label">Samara</span>
							</div>
							<div class="message-text">
								{#if isLoadingChat && !streamingChatResponse}
									Thinking<span class="dots"><span>.</span><span>.</span><span>.</span></span>
								{:else}
									{@html renderMarkdown(streamingChatResponse, 'reader')}
								{/if}
							</div>
						</div>
					</div>
				{/if}
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

					<!-- Folder icon (article library) -->
					<div class="article-library-wrapper">
						<button
							bind:this={libraryButtonRef}
							class="control-btn"
							class:active={showArticleLibrary}
							title="Article Library"
							onclick={toggleArticleLibrary}
						>
							<Icon src={LuFolder} size="11" />
						</button>

					</div>

					<!-- Article Library Dropdown (portal-style, outside wrapper) -->
					{#if showArticleLibrary}
						<div class="article-library-dropdown" bind:this={libraryDropdownRef}>
							{#if articles.length === 0}
								<div class="dropdown-empty">No articles yet</div>
							{:else}
								{#each articles as article}
									<div
										class="article-item"
										class:active={currentArticle?.id === article.id}
									>
										<button
											class="article-button"
											onclick={() => switchToArticle(article.id)}
										>
											<div class="article-content">
												<div class="article-title">{article.title}</div>
												<div class="article-preview">{article.preview_snippet}</div>
											</div>
										</button>
										<button
											class="delete-btn"
											onclick={(e) => handleArticleDeleteClick(article.id, e)}
											title="Delete article"
											disabled={isDeleting}
										>
											<Icon src={LuTrash2} size="12" />
										</button>
									</div>
								{/each}
							{/if}
						</div>
					{/if}

					<button class="control-btn" title="Download from cloud"><Icon src={LuCloudDownload} size="11" /></button>

					<div class="persona-dropdown">
						<span class="persona-name">{selectedPersona.charAt(0).toUpperCase() + selectedPersona.slice(1)}</span>
						<Icon src={LuChevronDown} size="11" />
					</div>

					<div class="icon-group">
						<button class="control-btn" class:active={isAutoScrolling} title="Auto-scroll" onclick={handleAutoScroll} style="position: relative;">
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
										fill="var(--reader-accent)"
									/>
								{/if}
							</svg>
							<!-- Red X badge when auto-scrolling is active -->
							{#if isAutoScrolling}
								<span style="position: absolute; top: -2px; right: -2px; width: 6px; height: 6px; background: red; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 5px; color: white; font-weight: bold; line-height: 1;">×</span>
							{/if}
						</button>
						<button class="control-btn" title="Next turn"><Icon src={LuArrowDown} size="11" /></button>
						<button class="control-btn" title="Previous turn"><Icon src={LuArrowUp} size="11" /></button>
						<button class="control-btn" title="Messages"><Icon src={LuMessageSquare} size="11" /></button>
					</div>

					<button class="control-btn settings-btn" title="Nuke all history" onclick={handleNukeClick}><Icon src={LuFlame} size="11" /></button>
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

<!-- Article Delete Confirmation Modal -->
{#if deleteArticleId}
	<div class="modal-overlay" onclick={handleArticleDeleteCancel}>
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<p class="modal-text">Hush... it'll all be over soon.</p>
			<div class="delete-progress-container">
				<div class="delete-progress-bar" style="width: {deleteArticleProgress}%"></div>
			</div>
			<div class="delete-actions">
				<button class="delete-cancel-btn" onclick={handleArticleDeleteCancel}>Cancel</button>
			</div>
		</div>
	</div>
{/if}

<!-- Nuke Confirmation Modal -->
{#if showNukeModal}
	<div class="modal-overlay" onclick={handleNukeCancel}>
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<p class="modal-text">Hush... it'll all be over soon.</p>
			<div class="delete-progress-container">
				<div class="delete-progress-bar" style="width: {nukeProgress}%"></div>
			</div>
			<div class="delete-actions">
				<button class="delete-cancel-btn" onclick={handleNukeCancel}>Cancel</button>
			</div>
		</div>
	</div>
{/if}

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
		position: sticky;
		top: 0;
		height: 100vh;
		align-self: start;
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
		background: hsl(var(--background));
		border: none;
		border-radius: 8px;
		overflow: hidden;
		cursor: pointer;
		transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.chart-thumbnail:hover {
		transform: scale(1.05);
	}

	.chart-thumbnail:active {
		transform: scale(0.98);
	}

	/* Active thumbnail state - highlighted when viewing full-size */
	.chart-thumbnail.active {
		outline: 2px solid var(--reader-accent);
		outline-offset: 2px;
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
		overflow: visible;
	}

	.input-controls {
		display: flex;
		align-items: center;
		gap: var(--action-icon-gap);
		margin-bottom: 0px;
		flex-wrap: nowrap;
		overflow-x: auto;
		overflow-y: visible;
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
		background: rgb(0, 0, 0);
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
		z-index: 20;
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

	/* Processing Overlay - Frosted Glass */
	.processing-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border-radius: var(--boss-card-border-radius);
		z-index: 25;
	}

	/* Loading Spinner */
	.spinner-container {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		transform: translate(-50%, -50%);
		z-index: 30; /* Above paste area (z-index: 20) */
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

	/* Article Library Dropdown */
	.article-library-wrapper {
		position: relative;
	}

	.control-btn.active {
		color: var(--reader-accent);
	}

	.article-library-dropdown {
		position: fixed;
		bottom: 140px;
		left: 84px;
		width: 320px;
		max-height: 450px;
		overflow-y: auto;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 6px;
		z-index: 99999;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	.dropdown-empty {
		padding: 24px 16px;
		text-align: center;
		color: hsl(var(--muted-foreground));
		font-size: 1em;
	}

	.article-item {
		width: 100%;
		display: flex;
		align-items: stretch;
		justify-content: space-between;
		border-left: 3px solid transparent;
		transition: all 0.2s ease;
		border-bottom: 1px solid hsl(var(--border) / 0.3);
	}

	.article-item:last-child {
		border-bottom: none;
	}

	.article-item:hover {
		background: hsl(var(--accent) / 0.5);
		border-left-color: var(--reader-accent);
	}

	.article-item.active {
		background: hsl(var(--accent) / 0.7);
		border-left-color: var(--reader-accent);
	}

	.article-button {
		flex: 1;
		display: flex;
		align-items: flex-start;
		padding: 12px 16px;
		background: transparent;
		border: none;
		color: hsl(var(--foreground));
		text-align: left;
		cursor: pointer;
		min-width: 0;
		transition: none;
	}

	.article-content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.article-title {
		font-size: 1em;
		font-weight: 500;
		color: hsl(var(--foreground));
		line-height: 1.4;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.article-preview {
		font-size: 1em;
		color: hsl(var(--muted-foreground));
		line-height: 1.5;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.delete-btn {
		flex-shrink: 0;
		width: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.2s ease;
		opacity: 0;
	}

	.article-item:hover .delete-btn {
		opacity: 1;
	}

	.delete-btn:hover {
		background: rgba(239, 68, 68, 0.1);
		color: rgb(239, 68, 68);
	}

	.delete-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	/* Delete Confirmation Modal */
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

	.delete-progress-bar {
		height: 100%;
		background: var(--reader-accent);
	}

	.delete-progress-container {
		width: 60%;
		height: 6px;
		background: hsl(var(--border));
		border-radius: 2px;
		overflow: hidden;
		margin: 0 auto 24px auto;
	}

	.delete-actions {
		display: flex;
		justify-content: center;
	}

	.delete-cancel-btn {
		background: transparent;
		color: var(--reader-accent);
		border: 1px solid var(--reader-accent);
		border-radius: 6px;
		padding: 12px 24px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.delete-cancel-btn:hover {
		background: var(--reader-accent);
		color: hsl(var(--background));
	}
</style>
