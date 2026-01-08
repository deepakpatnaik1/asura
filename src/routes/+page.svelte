<script lang="ts">
	import { Icon } from 'svelte-icons-pack';
	import { LuPaperclip, LuFolder, LuFilePenLine } from 'svelte-icons-pack/lu';
	import { currentMessage, isLoading, sendMessage, abortCurrentMessage, lastMutations, lastWhiteboardMutations, lastCanvasMutations } from '$lib/stores/chat';
	import { tick, onMount, onDestroy } from 'svelte';
	import { DEFAULT_PERSONA, PERSONAS } from '$lib/config/personas';
	import { type CanvasType, getDefaultCanvasForPersona } from '$lib/config/canvases';
	import { getPersonaAccentColor, getPersonaAccentBg } from '$lib/config/colors';
	import { CHAT_CONFIG, scrollToTurn, scrollToLastTurn, getTurns } from '$lib/ui/scroll';
	import { createConfirmation } from '$lib/composables';
	import ScrollControls from '$lib/components/ScrollControls.svelte';
	import MessageGroup from '$lib/components/MessageGroup.svelte';
	import ConfirmationModal from '$lib/components/ConfirmationModal.svelte';
	import PersonaDropdown from '$lib/components/PersonaDropdown.svelte';
	import CanvasContainer from '$lib/components/CanvasContainer.svelte';
	import PasteArea from '$lib/components/PasteArea.svelte';
	import UnifiedLibrary from '$lib/components/UnifiedLibrary.svelte';
	import ServerStatusLED from '$lib/components/ServerStatusLED.svelte';
	
	// Receive loaded data from server
	let { data } = $props();

	// Unified conversation - ALL messages regardless of persona
	let allMessages = $state([...(data.messages || [])].reverse());
	let starredIds = $state(new Set<string>(data.starredIds || []));
	let hasMore = $state(data.hasMore || false);
	let isLoadingMore = $state(false);
	let currentOffset = $state(data.messages?.length || 0);
	let totalMessageCount = $state(data.totalCount || 0);

	// Calculate absolute turn number (turn 1 = oldest message ever)
	function getAbsoluteTurnNumber(index: number): number {
		return totalMessageCount - allMessages.length + index + 1;
	}

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
		chart_index?: number;
		superjournal_id?: string;
	}
	let superjournalCharts = $state<Chart[]>([]);
	let fileCharts = $state<Chart[]>([]);
	let allCharts = $derived([...fileCharts, ...superjournalCharts]);
	let selectedChartIndex = $state<number | null>(null);
	let showLightbox = $state(false);
	let forceCanvas = $state<CanvasType | null>(null);
	let calendarRefreshTrigger = $state(0);
	let whiteboardRefreshTrigger = $state(0);

	// Focus mode state (immersive single-turn reading)
	let focusedMessageId = $state<string | null>(null);
	let savedScrollPosition = $state<number>(0);

	// Whiteboard state for notes canvas
	import type { WhiteboardState } from '$lib/api/whiteboard-tools';
	interface Whiteboard {
		id: string;
		title: string;
		is_selected: boolean;
		state?: WhiteboardState;
		created_at: string;
		updated_at: string;
	}
	let whiteboards = $state<Whiteboard[]>([]);
	let viewingWhiteboardId = $state<string | null>(null); // Currently displayed in canvas

	// Derived: selected whiteboard IDs from is_selected field
	const selectedWhiteboardIds = $derived(whiteboards.filter(wb => wb.is_selected).map(wb => wb.id));

	// Designer canvas state for Eva
	import type { CanvasState } from '$lib/roles/design-lead/canvas';
	interface DesignerCanvasData {
		id: string;
		title: string;
		is_selected: boolean;
		state?: CanvasState;
		created_at: string;
		updated_at: string;
	}
	let designerCanvases = $state<DesignerCanvasData[]>([]);
	let viewingDesignerCanvasId = $state<string | null>(null); // Currently displayed in canvas

	// Persist active designer canvas to localStorage
	const ACTIVE_CANVAS_KEY = 'aether:activeDesignerCanvasId';
	$effect(() => {
		if (viewingDesignerCanvasId && typeof localStorage !== 'undefined') {
			localStorage.setItem(ACTIVE_CANVAS_KEY, viewingDesignerCanvasId);
		}
	});

	// Derived: selected designer canvas IDs from is_selected field
	const selectedDesignerCanvasIds = $derived(designerCanvases.filter(c => c.is_selected).map(c => c.id));
	let designerCanvasRefreshTrigger = $state(0);

	// Refresh calendar when any Alicja mutations occur (todos, tags, diary, calendar)
	$effect(() => {
		const mutations = $lastMutations;
		if (mutations) {
			// Check if any mutation arrays have data - refresh on ANY change
			const hasAnyMutation = Object.values(mutations).some(
				(arr) => Array.isArray(arr) && arr.length > 0
			);

			if (hasAnyMutation) {
				calendarRefreshTrigger++;
			}
			// Clear mutations after processing
			lastMutations.set(null);
		}
	});

	// Handle whiteboard mutations from Gunnar's tools
	$effect(() => {
		const mutations = $lastWhiteboardMutations;
		if (mutations) {
			// Handle created whiteboards - add to list with is_selected: false
			if (mutations.created_whiteboards && mutations.created_whiteboards.length > 0) {
				const newWhiteboards = mutations.created_whiteboards.map(wb => ({ ...wb, is_selected: false }));
				whiteboards = [...whiteboards, ...newWhiteboards];
			}

			// Handle renamed whiteboards - update titles
			if (mutations.renamed_whiteboards && mutations.renamed_whiteboards.length > 0) {
				for (const renamed of mutations.renamed_whiteboards) {
					whiteboards = whiteboards.map(wb =>
						wb.id === renamed.id ? { ...wb, title: renamed.title } : wb
					);
				}
			}

			// Handle deleted whiteboards - remove from list (selection auto-updates via derived)
			if (mutations.deleted_whiteboards && mutations.deleted_whiteboards.length > 0) {
				const deletedIds = new Set(mutations.deleted_whiteboards);
				whiteboards = whiteboards.filter(wb => !deletedIds.has(wb.id));
				// Clear viewing if it was deleted
				if (viewingWhiteboardId && deletedIds.has(viewingWhiteboardId)) {
					viewingWhiteboardId = whiteboards.length > 0 ? whiteboards[0].id : null;
				}
			}

			// Handle opened whiteboard - select it, view it, and switch canvas
			if (mutations.opened_whiteboard) {
				const openedId = mutations.opened_whiteboard;
				// Add to selection if not already selected (persist to DB)
				const wb = whiteboards.find(w => w.id === openedId);
				if (wb && !wb.is_selected) {
					whiteboards = whiteboards.map(w =>
						w.id === openedId ? { ...w, is_selected: true } : w
					);
					// Persist selection
					fetch(`/api/whiteboards/${openedId}`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ is_selected: true })
					}).catch(err => console.error('Failed to persist whiteboard selection:', err));
				}
				viewingWhiteboardId = openedId;
				forceCanvas = 'notes'; // Switch to notes canvas when whiteboard is opened
			}

			// Handle updated whiteboards - apply state changes and trigger refresh
			if (mutations.updated_whiteboards && mutations.updated_whiteboards.length > 0) {
				for (const updated of mutations.updated_whiteboards) {
					whiteboards = whiteboards.map(wb =>
						wb.id === updated.id ? ({ ...wb, state: updated.state } as Whiteboard) : wb
					);
				}
				whiteboardRefreshTrigger++;
			}

			// Clear mutations after processing
			lastWhiteboardMutations.set(null);
		}
	});

	// Handle designer canvas mutations from Eva's tools
	$effect(() => {
		const mutations = $lastCanvasMutations;
		if (mutations) {
			// Handle created canvases - add to list with is_selected: false
			if (mutations.created_canvases && mutations.created_canvases.length > 0) {
				const newCanvases = mutations.created_canvases.map(c => ({ ...c, is_selected: false }));
				designerCanvases = [...newCanvases, ...designerCanvases];
			}

			// Handle renamed canvases - update titles
			if (mutations.renamed_canvases && mutations.renamed_canvases.length > 0) {
				for (const renamed of mutations.renamed_canvases) {
					designerCanvases = designerCanvases.map(c =>
						c.id === renamed.id ? { ...c, title: renamed.title } : c
					);
				}
			}

			// Handle deleted canvases - remove from list (selection auto-updates via derived)
			if (mutations.deleted_canvases && mutations.deleted_canvases.length > 0) {
				const deletedIds = new Set(mutations.deleted_canvases);
				designerCanvases = designerCanvases.filter(c => !deletedIds.has(c.id));
				// Clear viewing if it was deleted
				if (viewingDesignerCanvasId && deletedIds.has(viewingDesignerCanvasId)) {
					viewingDesignerCanvasId = designerCanvases.length > 0 ? designerCanvases[0].id : null;
				}
			}

			// Handle opened canvas - select it, view it, and switch canvas
			if (mutations.opened_canvas) {
				const openedId = mutations.opened_canvas;
				// Add to selection if not already selected (persist to DB)
				const canvas = designerCanvases.find(c => c.id === openedId);
				if (canvas && !canvas.is_selected) {
					designerCanvases = designerCanvases.map(c =>
						c.id === openedId ? { ...c, is_selected: true } : c
					);
					// Persist selection
					fetch(`/api/canvases/${openedId}`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ is_selected: true })
					}).catch(err => console.error('Failed to persist canvas selection:', err));
				}
				viewingDesignerCanvasId = openedId;
				forceCanvas = 'designer'; // Switch to designer canvas when canvas is opened
			}

			// Handle closed canvas - deselect it (persist to DB)
			if (mutations.closed_canvas) {
				const closedId = mutations.closed_canvas;
				const canvas = designerCanvases.find(c => c.id === closedId);
				if (canvas && canvas.is_selected) {
					designerCanvases = designerCanvases.map(c =>
						c.id === closedId ? { ...c, is_selected: false } : c
					);
					// Persist deselection
					fetch(`/api/canvases/${closedId}`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ is_selected: false })
					}).catch(err => console.error('Failed to persist canvas deselection:', err));
				}
			}

			// Handle updated canvases - apply state changes and trigger refresh
			if (mutations.updated_canvases && mutations.updated_canvases.length > 0) {
				for (const updated of mutations.updated_canvases) {
					designerCanvases = designerCanvases.map(c =>
						c.id === updated.id ? { ...c, state: updated.state as CanvasState } : c
					);
				}
				designerCanvasRefreshTrigger++;
			}

			// Clear mutations after processing
			lastCanvasMutations.set(null);
		}
	});

	let inputMessage = $state('');
	let messagesEndRef: HTMLDivElement;
	let textareaRef: HTMLTextAreaElement;

	// Helper to get prefix for input field (persona name or annotation mode)
	function getPersonaPrefix(): string {
		if (annotationMode && annotationTarget) {
			return "Boss's Feedback: ";
		}
		const persona = PERSONAS[selectedPersona];
		return persona ? `${persona.displayName}, ` : '';
	}

	// Article paste and library state
	let showFilePaste = $state(false);
	let showLibrary = $state(false);

	// Annotation mode state (for write-back feature)
	let annotationMode = $state(false);
	interface AnnotationTarget {
		headerText: string;
		headerLevel: number;
		headerIndex: number;
		articleId: string;
		markerElement: HTMLElement | null;
	}
	let annotationTarget = $state<AnnotationTarget | null>(null);

	interface PendingAnnotation {
		headerText: string;
		headerLevel: number;
		headerIndex: number;
	}
	interface Article {
		id: string;
		title: string;
		is_enabled: boolean;
		tier?: string;
		pending_annotation?: PendingAnnotation | null;
		source_path?: string | null; // Set when linked to Obsidian file
		created_at: string;
	}
	let articles = $state<Article[]>([]);

	// Confirmation composables
	const deleteConfirm = createConfirmation();
	const articleDeleteConfirm = createConfirmation();
	const chartDeleteConfirm = createConfirmation();
	const whiteboardDeleteConfirm = createConfirmation();
	const designerCanvasDeleteConfirm = createConfirmation();

	// Total selections for library badge (exclude canon - always injected)
	const totalLibrarySelections = $derived(
		articles.filter(a => a.is_enabled && a.tier !== 'canon').length + selectedWhiteboardIds.length + selectedDesignerCanvasIds.length
	);

	// File watching for live-linked Obsidian files
	// STRICT: Only ONE file is watched at a time. Set via Content Library toggle.
	// Persisted to user_settings.watched_article_id
	let watchedArticleId: string | null = $state(data.watchedArticleId || null);
	let watchAbortController: AbortController | null = null;
	let watchRetryCount = 0;
	let lastOwnWriteTime = 0; // Track when we write to avoid echo chamber
	let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
	const HEARTBEAT_TIMEOUT_MS = 20000; // Server sends keep-alive every 10s, expect within 20s

	/**
	 * Set which article to watch. Only one at a time.
	 * Automatically restarts the file watcher.
	 * Persists to user_settings for page reload survival.
	 */
	function setWatchedArticle(articleId: string | null) {
		const wasWatching = watchedArticleId;
		watchedArticleId = articleId;
		console.log('[SSE] Watched article changed:', wasWatching?.slice(0,8), '->', articleId?.slice(0,8));

		// Persist to database (fire and forget)
		fetch('/api/settings', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ watched_article_id: articleId })
		}).catch(err => console.error('Failed to persist watched article:', err));

		// User intentionally changed target - reset backoff counter
		watchRetryCount = 0;

		// Restart watching with new target
		stopFileWatching();
		if (articleId) {
			startFileWatching();
		}
	}

	/**
	 * Mark that we just wrote to a file (to ignore the echo from file watcher)
	 */
	function markOwnWrite() {
		lastOwnWriteTime = Date.now();
	}

	/**
	 * Check if a file update is likely our own echo (within 2 seconds of our write)
	 */
	function isOwnWriteEcho(): boolean {
		return Date.now() - lastOwnWriteTime < 2000;
	}

	/**
	 * Reset the heartbeat timer. Called whenever data arrives from SSE.
	 * If no data arrives within HEARTBEAT_TIMEOUT_MS, connection is assumed dead.
	 */
	function resetHeartbeat() {
		if (heartbeatTimer) {
			clearTimeout(heartbeatTimer);
		}
		heartbeatTimer = setTimeout(() => {
			console.log('[SSE] No heartbeat received, connection presumed dead');
			// Use backoff to prevent reconnection storm if network is down
			watchRetryCount++;
			const backoffMs = Math.min(5000 * Math.pow(2, watchRetryCount - 1), 60000);
			console.log(`[SSE] Reconnecting in ${backoffMs / 1000}s (retry #${watchRetryCount})`);
			stopFileWatching();
			setTimeout(() => startFileWatching(), backoffMs);
		}, HEARTBEAT_TIMEOUT_MS);
	}

	/**
	 * Clear the heartbeat timer (called when stopping watch)
	 */
	function clearHeartbeat() {
		if (heartbeatTimer) {
			clearTimeout(heartbeatTimer);
			heartbeatTimer = null;
		}
	}

	/**
	 * Start watching the single watched file via SSE
	 * Connection stays open until explicitly stopped or server dies
	 * Only reconnects on actual network errors, with exponential backoff
	 */
	async function startFileWatching() {
		if (!watchedArticleId) {
			console.log('[SSE] No article to watch');
			return;
		}
		const articleIds = [watchedArticleId];
		console.log('[SSE] Starting watch for:', watchedArticleId.slice(0,8));

		// Abort any existing connection
		stopFileWatching();

		watchAbortController = new AbortController();
		const signal = watchAbortController.signal;

		try {
			const response = await fetch('/api/watch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ article_ids: articleIds }),
				signal,
				credentials: 'same-origin'
			});

			if (!response.ok || !response.body) return;

			// Connection successful - reset retry count
			watchRetryCount = 0;

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				// Data received - reset heartbeat timer (connection is alive)
				resetHeartbeat();

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (!line.trim() || line.startsWith(':')) continue;
					if (line.startsWith('data: ')) {
						try {
							const event = JSON.parse(line.slice(6));
							console.log('[SSE]', event.type, event.article_id?.slice(0,8) || '');
							if (event.type === 'update' && event.article_id && event.content) {
								// Skip updates that are echoes of our own writes
								if (isOwnWriteEcho()) {
									console.log('[SSE] Ignoring own write echo');
									continue;
								}
								// Update the message content in place
								allMessages = allMessages.map(msg => {
									if (msg.ai_response?.includes(`<!--content:${event.article_id}-->`)) {
										return {
											...msg,
											ai_response: `<!--content:${event.article_id}-->\n${event.content}`
										};
									}
									return msg;
								});
							}
						} catch {
							// Ignore parse errors
						}
					}
				}
			}

			// Stream ended - reconnect after delay (unless we intentionally stopped)
			if (!signal.aborted) {
				console.log('[SSE] Stream ended, reconnecting in 5s');
				setTimeout(() => startFileWatching(), 5000);
			}
		} catch (error) {
			// Connection failed - only reconnect if we didn't intentionally abort
			// Use the captured `signal` (not watchAbortController) to check THIS connection's state
			if (!signal.aborted) {
				// Exponential backoff: 5s, 10s, 20s, 40s, max 60s
				watchRetryCount++;
				const backoffMs = Math.min(5000 * Math.pow(2, watchRetryCount - 1), 60000);
				console.log(`[SSE] Connection error, retry #${watchRetryCount} in ${backoffMs/1000}s`);
				setTimeout(() => startFileWatching(), backoffMs);
			}
		}
	}

	/**
	 * Stop watching files
	 */
	function stopFileWatching() {
		clearHeartbeat();
		if (watchAbortController) {
			watchAbortController.abort();
			watchAbortController = null;
		}
		// Note: Don't reset watchRetryCount here - it's used for backoff across reconnects
		// Only reset on successful connection (line ~431)
	}

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

	// Fetch whiteboards for notes canvas
	async function loadWhiteboards() {
		try {
			const response = await fetch('/api/whiteboards');
			if (response.ok) {
				const data = await response.json();
				whiteboards = (data.whiteboards || []) as Whiteboard[];
				// Selection state comes from is_selected field (persisted in DB)
				// Auto-view first whiteboard (most recently updated) and fetch its full state
				if (whiteboards.length > 0 && !viewingWhiteboardId) {
					const firstId = whiteboards[0].id;
					viewingWhiteboardId = firstId;
					// Fetch full state for the viewing whiteboard
					const stateResponse = await fetch(`/api/whiteboards/${firstId}`);
					if (stateResponse.ok) {
						const stateData = await stateResponse.json();
						whiteboards = whiteboards.map(wb =>
							wb.id === firstId ? (stateData.whiteboard as Whiteboard) : wb
						);
					}
				}
			}
		} catch (error) {
			console.error('Failed to load whiteboards:', error);
		}
	}

	// Fetch designer canvases for Eva
	async function loadDesignerCanvases() {
		try {
			const response = await fetch('/api/canvases');
			if (response.ok) {
				const data = await response.json();
				designerCanvases = data.canvases || [];
				// Selection state comes from is_selected field (persisted in DB)
				// Restore last viewed canvas from localStorage, or default to first
				if (designerCanvases.length > 0 && !viewingDesignerCanvasId) {
					const savedId = typeof localStorage !== 'undefined'
						? localStorage.getItem(ACTIVE_CANVAS_KEY)
						: null;
					// Use saved ID if it exists in the list, otherwise use first
					const targetId = savedId && designerCanvases.some(c => c.id === savedId)
						? savedId
						: designerCanvases[0].id;
					viewingDesignerCanvasId = targetId;
					// Fetch full state for the viewing canvas
					const stateResponse = await fetch(`/api/canvases/${targetId}`);
					if (stateResponse.ok) {
						const stateData = await stateResponse.json();
						designerCanvases = designerCanvases.map(c =>
							c.id === targetId ? stateData.canvas : c
						);
					}
				}
			}
		} catch (error) {
			console.error('Failed to load designer canvases:', error);
		}
	}

	// Toggle designer canvas selection for context injection (persists to DB)
	async function toggleDesignerCanvasSelection(id: string) {
		const canvas = designerCanvases.find(c => c.id === id);
		if (!canvas) return;

		const newSelected = !canvas.is_selected;

		// Optimistic update
		designerCanvases = designerCanvases.map(c =>
			c.id === id ? { ...c, is_selected: newSelected } : c
		);

		// When selecting, also switch to designer canvas and view it
		if (newSelected) {
			viewingDesignerCanvasId = id;
			forceCanvas = 'designer';
			// Fetch full canvas state (preserve is_selected since we just set it)
			try {
				const response = await fetch(`/api/canvases/${id}`);
				if (response.ok) {
					const data = await response.json();
					designerCanvases = designerCanvases.map(c =>
						c.id === id ? { ...data.canvas, is_selected: true } : c
					);
				}
			} catch (error) {
				console.error('Failed to fetch designer canvas:', error);
			}
		}

		// Persist to database
		try {
			await fetch(`/api/canvases/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ is_selected: newSelected })
			});
		} catch (error) {
			// Revert on failure
			designerCanvases = designerCanvases.map(c =>
				c.id === id ? { ...c, is_selected: !newSelected } : c
			);
			console.error('Failed to update canvas selection:', error);
		}
	}

	// Handle designer canvas click - toggle selection AND view it
	async function handleDesignerCanvasSelect(id: string) {
		toggleDesignerCanvasSelection(id);
		viewingDesignerCanvasId = id;
		// Fetch full canvas state
		try {
			const response = await fetch(`/api/canvases/${id}`);
			if (response.ok) {
				const data = await response.json();
				designerCanvases = designerCanvases.map(c =>
					c.id === id ? data.canvas : c
				);
			}
		} catch (error) {
			console.error('Failed to fetch designer canvas:', error);
		}
	}

	// Debounced save for designer canvas state changes
	let designerCanvasSaveTimeout: ReturnType<typeof setTimeout> | null = null;
	function handleDesignerCanvasStateChange(id: string, state: CanvasState | undefined) {
		designerCanvases = designerCanvases.map(c =>
			c.id === id ? { ...c, state } : c
		);
		// Debounce save to prevent excessive API calls
		if (designerCanvasSaveTimeout) {
			clearTimeout(designerCanvasSaveTimeout);
		}
		designerCanvasSaveTimeout = setTimeout(async () => {
			try {
				await fetch(`/api/canvases/${id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ state })
				});
			} catch (error) {
				console.error('Failed to save designer canvas:', error);
			}
		}, 500);
	}

	// Clear all designer canvas selections (persists to DB)
	async function clearDesignerCanvasSelection() {
		const selectedCanvases = designerCanvases.filter(c => c.is_selected);
		if (selectedCanvases.length === 0) return;

		// Optimistic update
		designerCanvases = designerCanvases.map(c => ({ ...c, is_selected: false }));

		// Persist all changes
		try {
			await Promise.all(
				selectedCanvases.map(c =>
					fetch(`/api/canvases/${c.id}`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ is_selected: false })
					})
				)
			);
		} catch (error) {
			console.error('Failed to clear canvas selections:', error);
			// Reload to get correct state
			await loadDesignerCanvases();
		}
	}

	// Open designer canvas from library
	function handleOpenDesignerCanvas(id: string) {
		viewingDesignerCanvasId = id;
		forceCanvas = 'designer';
		showLibrary = false;
	}

	// Delete designer canvas from library
	function handleDesignerCanvasDeleteClick(canvasId: string, event: MouseEvent) {
		event.stopPropagation();
		designerCanvasDeleteConfirm.start(canvasId, async () => {
			const originalCanvases = designerCanvases;
			designerCanvases = designerCanvases.filter(c => c.id !== canvasId);
			if (viewingDesignerCanvasId === canvasId) {
				viewingDesignerCanvasId = designerCanvases.length > 0 ? designerCanvases[0].id : null;
			}

			try {
				const response = await fetch(`/api/canvases/${canvasId}`, { method: 'DELETE' });
				if (!response.ok) {
					designerCanvases = originalCanvases;
				}
			} catch (error) {
				designerCanvases = originalCanvases;
			}
		});
	}

	// Toggle whiteboard selection for context injection (persists to DB)
	async function toggleWhiteboardSelection(id: string) {
		const whiteboard = whiteboards.find(wb => wb.id === id);
		if (!whiteboard) return;

		const newSelected = !whiteboard.is_selected;

		// Optimistic update
		whiteboards = whiteboards.map(wb =>
			wb.id === id ? { ...wb, is_selected: newSelected } : wb
		);

		// When selecting, also switch to notes canvas and view the whiteboard
		if (newSelected) {
			viewingWhiteboardId = id;
			forceCanvas = 'notes';
			// Fetch full whiteboard state (preserve is_selected since we just set it)
			try {
				const response = await fetch(`/api/whiteboards/${id}`);
				if (response.ok) {
					const data = await response.json();
					whiteboards = whiteboards.map(wb =>
						wb.id === id ? { ...data.whiteboard, is_selected: true } : wb
					);
				}
			} catch (error) {
				console.error('Failed to fetch whiteboard:', error);
			}
		}

		// Persist to database
		try {
			await fetch(`/api/whiteboards/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ is_selected: newSelected })
			});
		} catch (error) {
			// Revert on failure
			whiteboards = whiteboards.map(wb =>
				wb.id === id ? { ...wb, is_selected: !newSelected } : wb
			);
			console.error('Failed to update whiteboard selection:', error);
		}
	}

	// Rename whiteboard
	async function renameWhiteboard(id: string, newTitle: string) {
		const oldTitle = whiteboards.find(wb => wb.id === id)?.title;
		whiteboards = whiteboards.map(wb => wb.id === id ? { ...wb, title: newTitle } : wb);

		try {
			const response = await fetch(`/api/whiteboards/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: newTitle })
			});
			if (!response.ok) {
				whiteboards = whiteboards.map(wb => wb.id === id ? { ...wb, title: oldTitle || '' } : wb);
			}
		} catch (error) {
			whiteboards = whiteboards.map(wb => wb.id === id ? { ...wb, title: oldTitle || '' } : wb);
		}
	}

	// Star/unstar whiteboard
	async function starWhiteboard(id: string, currentState: boolean) {
		whiteboards = whiteboards.map(wb => wb.id === id ? { ...wb, is_starred: !currentState } : wb);

		try {
			const response = await fetch(`/api/whiteboards/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ is_starred: !currentState })
			});
			if (!response.ok) {
				whiteboards = whiteboards.map(wb => wb.id === id ? { ...wb, is_starred: currentState } : wb);
			}
		} catch (error) {
			whiteboards = whiteboards.map(wb => wb.id === id ? { ...wb, is_starred: currentState } : wb);
		}
	}

	// Rename designer canvas
	async function renameDesignerCanvas(id: string, newTitle: string) {
		const oldTitle = designerCanvases.find(c => c.id === id)?.title;
		designerCanvases = designerCanvases.map(c => c.id === id ? { ...c, title: newTitle } : c);

		try {
			const response = await fetch(`/api/canvases/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: newTitle })
			});
			if (!response.ok) {
				designerCanvases = designerCanvases.map(c => c.id === id ? { ...c, title: oldTitle || '' } : c);
			}
		} catch (error) {
			designerCanvases = designerCanvases.map(c => c.id === id ? { ...c, title: oldTitle || '' } : c);
		}
	}

	// Star/unstar designer canvas
	async function starDesignerCanvas(id: string, currentState: boolean) {
		designerCanvases = designerCanvases.map(c => c.id === id ? { ...c, is_starred: !currentState } : c);

		try {
			const response = await fetch(`/api/canvases/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ is_starred: !currentState })
			});
			if (!response.ok) {
				designerCanvases = designerCanvases.map(c => c.id === id ? { ...c, is_starred: currentState } : c);
			}
		} catch (error) {
			designerCanvases = designerCanvases.map(c => c.id === id ? { ...c, is_starred: currentState } : c);
		}
	}

	// Handle whiteboard click from carousel - toggle selection AND view it
	async function handleWhiteboardSelect(id: string) {
		// Toggle selection
		toggleWhiteboardSelection(id);
		// Also set as viewing
		viewingWhiteboardId = id;
		// Fetch full whiteboard state
		try {
			const response = await fetch(`/api/whiteboards/${id}`);
			if (response.ok) {
				const data = await response.json();
				// Update the whiteboard in the list with full state
				whiteboards = whiteboards.map(wb =>
					wb.id === id ? data.whiteboard : wb
				);
			}
		} catch (error) {
			console.error('Failed to fetch whiteboard:', error);
		}
	}

	// Debounced save for whiteboard state changes
	let whiteboardSaveTimeout: ReturnType<typeof setTimeout> | null = null;
	function handleWhiteboardStateChange(id: string, state: Whiteboard['state']) {
		// Update local state immediately
		whiteboards = whiteboards.map(wb =>
			wb.id === id ? { ...wb, state } : wb
		);

		// Debounce save to API
		if (whiteboardSaveTimeout) {
			clearTimeout(whiteboardSaveTimeout);
		}
		whiteboardSaveTimeout = setTimeout(async () => {
			try {
				await fetch(`/api/whiteboards/${id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ state })
				});
			} catch (error) {
				console.error('Failed to save whiteboard:', error);
			}
		}, 1000); // Save after 1 second of no changes
	}

	onMount(() => {
		textareaRef?.focus();

		// Initialize canvas based on the loaded persona (persists across refresh)
		forceCanvas = getDefaultCanvasForPersona(selectedPersona);

		(async () => {
			inputMessage = getPersonaPrefix();
			await Promise.all([loadCharts(), loadWhiteboards(), loadDesignerCanvases(), loadArticles()]);
			// Ensure ALL articles have message turns (handles Gettysburg workflow, direct SQL inserts, etc.)
			await ensureAllArticlesHaveEntries();
			// Resume file watching if there's a persisted watched article
			if (watchedArticleId) {
				startFileWatching();
			}
			// Restore annotation marker if one was saved (must run after DOM is rendered)
			await tick();
			restoreAnnotationMarker();
		})();

		// Listen for nuke events from SettingsModal
		const handleNukeEvent = (e: CustomEvent<{ bucket: string }>) => {
			handleNukeComplete(e.detail.bucket);
		};
		window.addEventListener('nuke-complete', handleNukeEvent as EventListener);

		return () => {
			pendingTimeouts.forEach(clearTimeout);
			pendingTimeouts = [];
			if (whiteboardSaveTimeout) clearTimeout(whiteboardSaveTimeout);
			deleteConfirm.cleanup();
			articleDeleteConfirm.cleanup();
			chartDeleteConfirm.cleanup();
			whiteboardDeleteConfirm.cleanup();
			designerCanvasDeleteConfirm.cleanup();
			window.removeEventListener('nuke-complete', handleNukeEvent as EventListener);
			stopFileWatching();
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

		// Close library dropdown
		showLibrary = false;

		// Auto-switch canvas based on persona default
		forceCanvas = getDefaultCanvasForPersona(persona);

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

		// Don't send if input is just the persona prefix (e.g., "Samara," with no actual message)
		const prefix = getPersonaPrefix().trim();
		const trimmedInput = inputMessage.trim();
		if (trimmedInput === prefix || trimmedInput === prefix.replace(/,\s*$/, '')) return;

		// Exit focus mode before sending (restore normal conversation view)
		if (focusedMessageId) {
			focusedMessageId = null;
		}

		const message = inputMessage.trim();

		// Check if we're submitting an annotation (write-back mode)
		if (annotationMode && annotationTarget) {
			inputMessage = getPersonaPrefix();
			resetTextareaHeight();

			try {
				// Mark that we're about to write, so file watcher ignores the echo
				markOwnWrite();
				const response = await fetch(`/api/chat/files/${annotationTarget.articleId}/annotate`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						headerText: annotationTarget.headerText,
						headerLevel: annotationTarget.headerLevel,
						headerIndex: annotationTarget.headerIndex,
						feedback: message
					})
				});

				if (response.ok) {
					const result = await response.json();

					// Immediately update message content with the annotated file
					if (result.content && result.article_id) {
						allMessages = allMessages.map(msg => {
							if (msg.ai_response?.includes(`<!--content:${result.article_id}-->`)) {
								return {
									...msg,
									ai_response: `<!--content:${result.article_id}-->\n${result.content}`
								};
							}
							return msg;
						});
					}

					// Clear marker and exit annotation mode
					clearAnnotationMarker();
					annotationMode = false;
				} else {
					const error = await response.json();
					console.error('Annotation failed:', error);
				}
			} catch (err) {
				console.error('Annotation failed:', err);
			}
			return;
		}

		// Normal message flow
		inputMessage = getPersonaPrefix();
		resetTextareaHeight();

		let chartId: string | undefined;
		let chartSource: 'file' | 'superjournal' | undefined;
		if (showLightbox && selectedChartIndex !== null && allCharts[selectedChartIndex]) {
			const selectedChart = allCharts[selectedChartIndex];
			chartId = selectedChart.id;
			chartSource = selectedChart.source;
		}

		const enabledArticleIds = articles.filter(a => a.is_enabled).map(a => a.id);

		await sendMessage(
			message,
			selectedPersona,
			chartId,
			chartSource,
			enabledArticleIds.length > 0 ? enabledArticleIds : undefined,
			selectedWhiteboardIds.length > 0 ? selectedWhiteboardIds : undefined,
			selectedDesignerCanvasIds.length > 0 ? selectedDesignerCanvasIds : undefined
		);

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
			totalMessageCount++;

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
		textareaRef.style.height = Math.min(textareaRef.scrollHeight, 500) + 'px';
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
				totalMessageCount--;
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

	/**
	 * Toggle focus mode for a message (immersive single-turn reading)
	 */
	function handleFocusToggle(messageId: string) {
		if (focusedMessageId === messageId) {
			// Exit focus mode - scroll to latest message
			focusedMessageId = null;
			tick().then(() => {
				setTimeout(() => scrollToLastTurn(CHAT_CONFIG), 50);
			});
		} else {
			// Enter focus mode
			const container = document.querySelector('.messages-area') as HTMLElement;
			if (container) savedScrollPosition = container.scrollTop;
			focusedMessageId = messageId;
			// Scroll to top of focused message after DOM updates
			tick().then(() => {
				if (container) container.scrollTop = 0;
			});
		}
	}

	/**
	 * Handle table click in message - open corresponding chart in lightbox
	 */
	function handleTableClick(messageId: string | undefined, tableIndex: number) {
		if (!messageId) return;

		// Find the message
		const message = allMessages.find(m => m.id === messageId);
		if (!message) return;

		// Check if this is article content (has content marker)
		const contentMatch = message.ai_response?.match(/<!--content:([a-f0-9-]+)-->/);

		let matchingCharts: Chart[];
		if (contentMatch) {
			// Article content - find charts by file_id
			const fileId = contentMatch[1];
			matchingCharts = fileCharts.filter(c => c.file_id === fileId);
		} else {
			// AI response - find charts by superjournal_id
			matchingCharts = superjournalCharts.filter(c => c.superjournal_id === messageId);
		}

		// Sort by chart_index to match document order (tableIndex is 0-based from markdown)
		matchingCharts.sort((a, b) => (a.chart_index ?? 0) - (b.chart_index ?? 0));

		const targetChart = matchingCharts[tableIndex];
		if (!targetChart) return;

		// Find position in allCharts
		const chartIndex = allCharts.findIndex(c => c.id === targetChart.id);
		if (chartIndex === -1) return;

		// Open lightbox
		selectedChartIndex = chartIndex;
		showLightbox = true;
		forceCanvas = 'carousel';
	}

	/**
	 * Handle click in messages area when annotation mode is active.
	 * Finds the nearest following section boundary (header or divider) and places a marker there.
	 * If click is inside a fenced container (:::red/blue/boss), escapes to place marker after it.
	 */
	function handleAnnotationClick(event: MouseEvent) {
		if (!annotationMode) return;

		let target = event.target as HTMLElement;

		// Don't annotate if clicking on buttons, interactive elements, or dismiss button
		if (target.closest('button') || target.closest('a') || target.closest('.annotation-dismiss')) return;

		// Find the content container (.message-text inside .ai-message)
		const messageText = target.closest('.message-text');
		if (!messageText) return;

		// Find the message group to extract articleId from content marker
		const messageGroup = target.closest('[data-message-id]') as HTMLElement | null;
		if (!messageGroup) return;

		const messageId = messageGroup.dataset.messageId;
		const message = allMessages.find(m => m.id === messageId);
		if (!message) return;

		// Extract articleId from content marker
		const contentMatch = message.ai_response?.match(/<!--content:([a-f0-9-]+)-->/);
		if (!contentMatch) return; // Only allow annotations on linked articles

		const articleId = contentMatch[1];

		// Check if click is inside a fenced container (:::red/blue/boss)
		// If so, escape to the container itself so marker goes AFTER it
		const fencedContainer = target.closest('.fenced-container') as HTMLElement | null;
		let clickedFencedContainer: HTMLElement | null = null;
		if (fencedContainer && messageText.contains(fencedContainer)) {
			clickedFencedContainer = fencedContainer;
			// Use the fenced container as the reference point for finding boundaries
			target = fencedContainer;
		}

		// Get all section boundaries: headers, dividers, AND fenced containers
		const allBoundaries = messageText.querySelectorAll('h1, h2, h3, h4, h5, h6, hr, .flourish-divider, .fenced-container');
		if (allBoundaries.length === 0) return;

		// Find the NEXT boundary after the reference element in document order
		let boundary: HTMLElement | null = null;
		let isEndOfDocument = false;
		for (const b of allBoundaries) {
			// Skip the clicked fenced container itself when looking for next boundary
			if (b === clickedFencedContainer) continue;
			const position = target.compareDocumentPosition(b);
			if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
				boundary = b as HTMLElement;
				break;
			}
		}

		// If no boundary follows, this is the last section - marker goes after content
		if (!boundary) {
			isEndOfDocument = true;
		}

		// Remove existing marker if any
		clearAnnotationMarker();

		// Create marker element with dismiss button
		const marker = document.createElement('div');
		marker.className = 'annotation-marker';
		marker.innerHTML = `
			<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg>
			<button class="annotation-dismiss" title="Remove marker">×</button>
		`;

		// Add click handler for dismiss button
		const dismissBtn = marker.querySelector('.annotation-dismiss');
		dismissBtn?.addEventListener('click', (e) => {
			e.stopPropagation();
			clearAnnotationMarker();
		});

		// Insert marker: special handling for fenced containers, otherwise before boundary or at end
		if (clickedFencedContainer) {
			// Always insert marker immediately AFTER the clicked fenced container
			clickedFencedContainer.parentElement?.insertBefore(marker, clickedFencedContainer.nextSibling);
		} else if (isEndOfDocument) {
			// Find the last content element in the message
			const lastElement = messageText.lastElementChild as HTMLElement;
			if (lastElement) {
				// Insert after the last element
				lastElement.parentElement?.insertBefore(marker, lastElement.nextSibling);
			} else {
				messageText.appendChild(marker);
			}
		} else if (boundary) {
			// Insert marker directly before the found boundary (header or hr)
			boundary.parentElement?.insertBefore(marker, boundary);
		}

		// Set annotation target
		let headerText: string;
		let headerLevel: number;
		let headerIndex: number;

		if (clickedFencedContainer) {
			// Clicked on a fenced container - insert AFTER it
			// Count which fenced container this is (0-indexed)
			headerText = '__FENCED__';
			headerLevel = 0;
			headerIndex = 0;
			for (const b of allBoundaries) {
				if (b === clickedFencedContainer) break;
				if (b.classList.contains('fenced-container')) {
					headerIndex++;
				}
			}
		} else if (isEndOfDocument) {
			// Special marker for end-of-document: append to file
			headerText = '__END__';
			headerLevel = 0;
			headerIndex = 0;
		} else if (boundary?.tagName === 'HR' || boundary?.classList.contains('flourish-divider')) {
			// Divider boundary (hr or flourish-divider) - count which occurrence (0-indexed)
			headerText = '__DIVIDER__';
			headerLevel = 0;
			headerIndex = 0;
			for (const b of allBoundaries) {
				if (b === boundary) break;
				if (b.tagName === 'HR' || b.classList.contains('flourish-divider')) {
					headerIndex++;
				}
			}
		} else if (boundary?.classList.contains('fenced-container')) {
			// Next boundary is a fenced container - insert before it means after the previous content
			// For now, use the next fenced container as the target
			headerText = '__BEFORE_FENCED__';
			headerLevel = 0;
			headerIndex = 0;
			for (const b of allBoundaries) {
				if (b === boundary) break;
				if (b.classList.contains('fenced-container')) {
					headerIndex++;
				}
			}
		} else if (boundary) {
			// Header boundary
			// Header structure: <h3><span>H3</span><span>Tier 1 Facts</span></h3>
			// Get the content span (last child), not the label span
			const levelMatch = boundary.tagName.match(/H(\d)/);
			const contentSpan = boundary.querySelector('span:last-child');
			headerText = contentSpan?.textContent?.trim() || boundary.textContent?.trim() || '';
			headerLevel = levelMatch ? parseInt(levelMatch[1]) : 2;

			// Count which occurrence of this header (0-indexed)
			// Headers with same text and level may appear multiple times (e.g., "Tier 1 Facts" per turn)
			headerIndex = 0;
			for (const b of allBoundaries) {
				if (b === boundary) break;
				// Skip dividers and fenced containers when counting headers
				if (b.tagName === 'HR' || b.classList.contains('flourish-divider') || b.classList.contains('fenced-container')) continue;
				const bContentSpan = b.querySelector('span:last-child');
				const bText = bContentSpan?.textContent?.trim() || b.textContent?.trim();
				if (bText === headerText && b.tagName === boundary.tagName) {
					headerIndex++;
				}
			}
		} else {
			return; // No valid target
		}

		annotationTarget = {
			headerText,
			headerLevel,
			headerIndex,
			articleId,
			markerElement: marker
		};

		// Save to database for persistence
		fetch(`/api/chat/files/${articleId}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ pending_annotation: { headerText, headerLevel, headerIndex } })
		}).catch(err => console.error('Failed to save annotation:', err));

		// Update local articles state
		articles = articles.map(a =>
			a.id === articleId ? { ...a, pending_annotation: { headerText, headerLevel, headerIndex } } : a
		);

		// Update input to show annotation prefix and focus
		inputMessage = getPersonaPrefix();
		textareaRef?.focus();
	}

	/**
	 * Clear annotation marker from DOM and database
	 */
	function clearAnnotationMarker() {
		const articleId = annotationTarget?.articleId;

		if (annotationTarget?.markerElement) {
			annotationTarget.markerElement.remove();
		}
		annotationTarget = null;

		// Restore persona prefix in input (now that annotationTarget is null)
		inputMessage = getPersonaPrefix();

		// Clear from database
		if (articleId) {
			fetch(`/api/chat/files/${articleId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pending_annotation: null })
			}).catch(err => console.error('Failed to clear annotation:', err));

			// Update local articles state
			articles = articles.map(a =>
				a.id === articleId ? { ...a, pending_annotation: null } : a
			);
		}
	}

	/**
	 * Restore annotation marker from articles data on page load
	 */
	function restoreAnnotationMarker() {
		// Find article with pending annotation
		const articleWithAnnotation = articles.find(a => a.pending_annotation);
		if (!articleWithAnnotation?.pending_annotation) return;

		const { headerText, headerLevel, headerIndex } = articleWithAnnotation.pending_annotation;
		const articleId = articleWithAnnotation.id;

		// Find the message with this article
		const message = allMessages.find(m => m.ai_response?.includes(`<!--content:${articleId}-->`));
		if (!message) return;

		// Find the message element (AI response div with data-message-id)
		const messageElement = document.querySelector(`[data-message-id="${message.id}"]`);
		if (!messageElement) return;

		const messageText = messageElement.querySelector('.message-text');
		if (!messageText) return;

		// Create marker element with dismiss button
		const marker = document.createElement('div');
		marker.className = 'annotation-marker';
		marker.innerHTML = `
			<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg>
			<button class="annotation-dismiss" title="Remove marker">×</button>
		`;

		const dismissBtn = marker.querySelector('.annotation-dismiss');
		dismissBtn?.addEventListener('click', (e) => {
			e.stopPropagation();
			clearAnnotationMarker();
		});

		let targetElement: HTMLElement | null = null;
		let insertAfter = false;

		if (headerText === '__FENCED__') {
			// Find the Nth fenced container and insert marker after it
			const fencedContainers = messageText.querySelectorAll('.fenced-container');
			if (headerIndex < fencedContainers.length) {
				targetElement = fencedContainers[headerIndex] as HTMLElement;
				insertAfter = true;
			}
		} else if (headerText === '__BEFORE_FENCED__') {
			// Find the Nth fenced container and insert marker before it
			const fencedContainers = messageText.querySelectorAll('.fenced-container');
			if (headerIndex < fencedContainers.length) {
				targetElement = fencedContainers[headerIndex] as HTMLElement;
				insertAfter = false;
			}
		} else if (headerText === '__DIVIDER__') {
			// Find the Nth divider
			const dividers = messageText.querySelectorAll('hr, .flourish-divider');
			if (headerIndex < dividers.length) {
				targetElement = dividers[headerIndex] as HTMLElement;
				insertAfter = false;
			}
		} else if (headerText === '__END__') {
			// Insert at end of content
			const lastElement = messageText.lastElementChild as HTMLElement;
			if (lastElement) {
				targetElement = lastElement;
				insertAfter = true;
			}
		} else {
			// Header-based target
			const allHeaders = messageText.querySelectorAll(`h${headerLevel}`);
			let matchCount = 0;
			for (const h of allHeaders) {
				const contentSpan = h.querySelector('span:last-child');
				const hText = contentSpan?.textContent?.trim() || h.textContent?.trim();
				if (hText === headerText) {
					if (matchCount === headerIndex) {
						targetElement = h as HTMLElement;
						insertAfter = false;
						break;
					}
					matchCount++;
				}
			}
		}

		if (!targetElement) return;

		// Insert marker before or after target element
		if (insertAfter) {
			targetElement.parentElement?.insertBefore(marker, targetElement.nextSibling);
		} else {
			targetElement.parentElement?.insertBefore(marker, targetElement);
		}

		annotationTarget = {
			headerText,
			headerLevel,
			headerIndex,
			articleId,
			markerElement: marker
		};

		// Re-enable annotation mode since we have a marker
		annotationMode = true;
		inputMessage = getPersonaPrefix();
	}

	function handleNukeComplete(bucket: string) {
		// Parse bucket to determine what to clear from UI
		const [bucketType, target] = bucket.split(':');

		switch (bucketType) {
			case 'persona': {
				// Remove messages from this persona
				const beforeCount = allMessages.length;
				allMessages = allMessages.filter(m => m.persona_name !== target);
				totalMessageCount -= (beforeCount - allMessages.length);
				// Reload charts (some may have been deleted)
				loadSuperjournalCharts();
				break;
			}
			case 'content':
				// All content tiers (ephemeral, strategic, canon, gettysburg) are articles
				// Also reload messages since superjournal entries with content markers are deleted
				reloadMessages();
				loadArticles();
				loadFileCharts();
				break;
			case 'productivity':
				// Nothing in main UI to clear - CalendarCanvas will refetch on its own
				break;
			default:
				// ALL - clear everything
				allMessages = [];
				totalMessageCount = 0;
				superjournalCharts = [];
				fileCharts = [];
				articles = [];
				currentMessage.set(null);
		}
	}

	// File paste handlers
	async function handlePaperclipClick() {
		showLibrary = false;
		showFilePaste = !showFilePaste;
		if (showFilePaste) {
			await tick();
			const pasteArea = document.querySelector('.paste-area') as HTMLElement;
			pasteArea?.focus();
		}
	}

	async function handleLibraryClick() {
		showFilePaste = false;
		showLibrary = !showLibrary;
		if (showLibrary) {
			await loadArticles();
		}
	}

	// Clear all whiteboard selections (persists to DB)
	async function clearWhiteboardSelection() {
		const selectedWbs = whiteboards.filter(wb => wb.is_selected);
		if (selectedWbs.length === 0) return;

		// Optimistic update
		whiteboards = whiteboards.map(wb => ({ ...wb, is_selected: false }));

		// Persist all changes
		try {
			await Promise.all(
				selectedWbs.map(wb =>
					fetch(`/api/whiteboards/${wb.id}`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ is_selected: false })
					})
				)
			);
		} catch (error) {
			console.error('Failed to clear whiteboard selections:', error);
			// Reload to get correct state
			await loadWhiteboards();
		}
	}

	function handleOpenWhiteboard(id: string) {
		viewingWhiteboardId = id;
		forceCanvas = 'notes';
		showLibrary = false;
	}

	function handleWhiteboardDeleteClick(whiteboardId: string, event: MouseEvent) {
		event.stopPropagation();
		whiteboardDeleteConfirm.start(whiteboardId, async () => {
			const originalWhiteboards = whiteboards;
			whiteboards = whiteboards.filter(wb => wb.id !== whiteboardId);
			// Selection auto-updates via derived when whiteboard is removed from array
			if (viewingWhiteboardId === whiteboardId) {
				viewingWhiteboardId = whiteboards.length > 0 ? whiteboards[0].id : null;
			}

			try {
				const response = await fetch(`/api/whiteboards/${whiteboardId}`, { method: 'DELETE' });
				if (!response.ok) {
					whiteboards = originalWhiteboards;
				}
			} catch (error) {
				whiteboards = originalWhiteboards;
			}
		});
	}

	async function loadArticles() {
		try {
			const response = await fetch('/api/chat/files');
			if (response.ok) {
				const data = await response.json();
				articles = data.files || [];
			}
		} catch (error) {
			console.error('Failed to load articles:', error);
		}
	}

	/**
	 * Ensure ALL articles have corresponding superjournal entries.
	 * This handles articles created via SQL (Gettysburg workflow) or other paths
	 * that don't go through the normal upload flow.
	 *
	 * Uses /ensure-entry (not /open) to avoid modifying is_enabled state.
	 * Articles keep their current enabled/disabled state after page load.
	 */
	async function ensureAllArticlesHaveEntries() {
		if (articles.length === 0) return;

		const newMessages: typeof allMessages = [];

		for (const article of articles) {
			try {
				const response = await fetch(`/api/chat/files/${article.id}/ensure-entry`, { method: 'POST' });
				if (response.ok) {
					const data = await response.json();
					// Only add if a new entry was created (not already existing)
					if (data.message && !data.existed) {
						newMessages.push(data.message);
					}
				}
			} catch (error) {
				console.error(`Failed to ensure entry for article ${article.id}:`, error);
			}
		}

		// Append any new messages and scroll
		if (newMessages.length > 0) {
			allMessages = [...allMessages, ...newMessages];
			totalMessageCount += newMessages.length;
			await tick();
			scrollToLastTurn(CHAT_CONFIG);
		}
	}

	async function reloadMessages() {
		try {
			const response = await fetch('/api/superjournal?offset=0&limit=50');
			if (response.ok) {
				const result = await response.json();
				allMessages = [...result.messages].reverse();
				totalMessageCount = result.total || result.messages.length;
				hasMore = result.hasMore || false;
				currentOffset = result.messages.length;
			}
		} catch (error) {
			console.error('Failed to reload messages:', error);
		}
	}

	async function toggleArticle(articleId: string, currentState: boolean) {
		articles = articles.map((a) => a.id === articleId ? { ...a, is_enabled: !currentState } : a);

		try {
			if (!currentState) {
				// Enabling this article (does NOT auto-watch - user must click eye icon)
				const response = await fetch(`/api/chat/files/${articleId}/open`, { method: 'POST' });
				if (!response.ok) {
					articles = articles.map((a) => a.id === articleId ? { ...a, is_enabled: currentState } : a);
				} else {
					const data = await response.json();
					await loadFileCharts();
					forceCanvas = 'carousel';

					if (data.message) {
						// New entry created - append to messages and scroll
						allMessages = [...allMessages, data.message];
						totalMessageCount++;
						selectedPersona = 'system';
						await tick();
						scrollToLastTurn(CHAT_CONFIG);
					} else if (data.originalSuperjournalId) {
						// Entry already exists - scroll to it (top-aligned like turn navigation)
						selectedPersona = 'system';
						await tick();
						const element = document.getElementById(`message-${data.originalSuperjournalId}`);
						if (element) {
							scrollToTurn(CHAT_CONFIG, element, { behavior: 'smooth' });
						}
					}
				}
			} else {
				// Disabling this article - if it was being watched, stop watching
				if (watchedArticleId === articleId) {
					setWatchedArticle(null);
				}

				const response = await fetch(`/api/chat/files/${articleId}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ is_enabled: false })
				});
				if (!response.ok) {
					articles = articles.map((a) => a.id === articleId ? { ...a, is_enabled: currentState } : a);
				} else {
					await loadFileCharts();
				}
			}
		} catch (error) {
			articles = articles.map((a) => a.id === articleId ? { ...a, is_enabled: currentState } : a);
		}
	}

	async function scrollToArticle(articleId: string) {
		// Find the message that contains this article's content
		const message = allMessages.find(m => m.ai_response?.includes(`<!--content:${articleId}-->`));
		if (!message) return;

		// Scroll to the message element
		const element = document.getElementById(`message-${message.id}`);
		if (element) {
			scrollToTurn(CHAT_CONFIG, element, { behavior: 'smooth' });
		}
	}

	async function clearAllArticles() {
		const enabledArticles = articles.filter(a => a.is_enabled);
		if (enabledArticles.length === 0) return;

		// Stop watching
		setWatchedArticle(null);

		articles = articles.map(a => ({ ...a, is_enabled: false }));

		try {
			await Promise.all(
				enabledArticles.map(a =>
					fetch(`/api/chat/files/${a.id}`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ is_enabled: false })
					})
				)
			);
			await loadFileCharts();
		} catch (error) {
			console.error('Failed to clear articles:', error);
			await loadArticles();
		}
	}

	async function renameArticle(articleId: string, newTitle: string) {
		const oldTitle = articles.find((a) => a.id === articleId)?.title;
		articles = articles.map((a) => a.id === articleId ? { ...a, title: newTitle } : a);

		try {
			const response = await fetch(`/api/chat/files/${articleId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: newTitle })
			});
			if (!response.ok) {
				articles = articles.map((a) => a.id === articleId ? { ...a, title: oldTitle || '' } : a);
			}
		} catch (error) {
			articles = articles.map((a) => a.id === articleId ? { ...a, title: oldTitle || '' } : a);
		}
	}

	// Star/unstar article
	async function starArticle(articleId: string, currentState: boolean) {
		articles = articles.map((a) => a.id === articleId ? { ...a, is_starred: !currentState } : a);

		try {
			const response = await fetch(`/api/chat/files/${articleId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ is_starred: !currentState })
			});
			if (!response.ok) {
				articles = articles.map((a) => a.id === articleId ? { ...a, is_starred: currentState } : a);
			}
		} catch (error) {
			articles = articles.map((a) => a.id === articleId ? { ...a, is_starred: currentState } : a);
		}
	}

	function handleArticleDeleteClick(articleId: string, event: MouseEvent) {
		event.stopPropagation();
		articleDeleteConfirm.start(articleId, async () => {
			// If we're deleting the watched article, stop watching
			if (watchedArticleId === articleId) {
				setWatchedArticle(null);
			}

			const originalArticles = articles;
			articles = articles.filter((a) => a.id !== articleId);

			try {
				const response = await fetch(`/api/chat/files/${articleId}`, { method: 'DELETE' });
				if (!response.ok) {
					articles = originalArticles;
				} else {
					const beforeCount = allMessages.length;
					allMessages = allMessages.filter(m => !m.ai_response?.startsWith(`<!--content:${articleId}-->`));
					totalMessageCount -= (beforeCount - allMessages.length);
					await loadFileCharts();
				}
			} catch (error) {
				articles = originalArticles;
			}
		});
	}

	async function handleFilePasteSuccess(fileId: string, title: string, content: string, superjournalId?: string) {
		if (superjournalId) {
			const now = new Date().toISOString();
			allMessages = [...allMessages, {
				id: superjournalId,
				user_message: `Boss uploaded ${title}`,
				ai_response: `<!--content:${fileId}-->\n${content}`,
				persona_name: 'system',
				created_at: now,
				formatted_timestamp: formatTimestamp(now),
				model_identifier: 'file-upload'
			}];
			totalMessageCount++;
			selectedPersona = 'system';

			await tick();
			setTimeout(() => scrollToLastTurn(CHAT_CONFIG), 100);
		}

		await loadArticles(); // Always refresh to update badge count

		// Set the newly pasted file as THE watched file (single-file watching)
		setWatchedArticle(fileId);
		await loadFileCharts();
		forceCanvas = 'carousel'; // Switch to carousel when content is pasted
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
		// Focus mode has highest priority for Escape
		if (event.key === 'Escape' && focusedMessageId) {
			focusedMessageId = null;
			tick().then(() => {
				setTimeout(() => scrollToLastTurn(CHAT_CONFIG), 50);
			});
			return;
		}
		if (event.key === 'Escape' && showLibrary) {
			showLibrary = false;
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
		} else if (!showLibrary) {
			textareaRef?.focus();
		}
	}

	function refocusInput() {
		if (!showFilePaste && !showLibrary) {
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

<script context="module">
	import { BOSS_ACCENT, BOSS_ACCENT_BG } from '$lib/config/colors';
</script>

<div class="chat-container" style="--current-accent: {currentAccentColor}; --current-accent-bg: {currentAccentBg}; --boss-accent: {BOSS_ACCENT}; --boss-accent-bg: {BOSS_ACCENT_BG}">
	<!-- Messages Area -->
	<div class="messages-area" class:focus-mode={focusedMessageId}>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			class="messages-content"
			class:annotation-mode={annotationMode}
			onclick={handleAnnotationClick}
		>
			{#if hasMore && !focusedMessageId}
				<button class="load-more-btn" onclick={loadMoreMessages} disabled={isLoadingMore}>
					{isLoadingMore ? 'Loading...' : 'Load older messages'}
				</button>
			{/if}

			{#each allMessages as msg, index}
				{#if !focusedMessageId || focusedMessageId === msg.id}
					{@const msgAccentColor = getPersonaAccentColor(msg.persona_name)}
					{@const msgAccentBg = getPersonaAccentBg(msg.persona_name)}
					<MessageGroup
						messageId={msg.id}
						userMessage={msg.user_message}
						aiResponse={msg.ai_response}
						personaName={msg.persona_name}
						accentColor={msgAccentColor}
						accentBg={msgAccentBg}
						turnNumber={getAbsoluteTurnNumber(index)}
						timestamp={msg.formatted_timestamp}
						isStarred={starredIds.has(msg.id)}
						isCopied={copiedMessageId === msg.id}
						isFocused={focusedMessageId === msg.id}
						showActions={true}
						onStar={() => handleStarToggle(msg.id)}
						onCopy={() => handleCopyTurn(msg.id, msg.user_message, msg.ai_response, msg.persona_name)}
						onDelete={() => handleMessageDeleteClick(msg.id)}
						onFocus={() => handleFocusToggle(msg.id)}
						onTableClick={handleTableClick}
					/>
				{/if}
			{/each}

			{#if $isLoading && $currentMessage}
				<MessageGroup
					userMessage={$currentMessage.boss}
					aiResponse={$currentMessage.ai}
					personaName={selectedPersona}
					accentColor={currentAccentColor}
					accentBg={currentAccentBg}
					turnNumber={totalMessageCount + 1}
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

					<div class="library-wrapper">
						<button
							class="control-btn hit-target"
							class:active={showLibrary || totalLibrarySelections > 0}
							title="Library"
							onclick={handleLibraryClick}
						>
							<Icon src={LuFolder} size="11" />
							{#if totalLibrarySelections > 0}
								<span class="selection-badge">{totalLibrarySelections}</span>
							{/if}
						</button>
						{#if showLibrary}
							<UnifiedLibrary
								{articles}
								{watchedArticleId}
								onArticleToggle={toggleArticle}
								onArticleWatch={setWatchedArticle}
								onArticleSelect={scrollToArticle}
								onArticleRename={renameArticle}
								onArticleDelete={handleArticleDeleteClick}
								onArticleStar={starArticle}
								onArticleClear={clearAllArticles}

								{whiteboards}
								selectedWhiteboardIds={selectedWhiteboardIds}
								onWhiteboardToggle={toggleWhiteboardSelection}
								onWhiteboardOpen={handleOpenWhiteboard}
								onWhiteboardRename={renameWhiteboard}
								onWhiteboardDelete={handleWhiteboardDeleteClick}
								onWhiteboardStar={starWhiteboard}
								onWhiteboardClear={clearWhiteboardSelection}

								{designerCanvases}
								selectedDesignerCanvasIds={selectedDesignerCanvasIds}
								onDesignerCanvasToggle={toggleDesignerCanvasSelection}
								onDesignerCanvasOpen={handleOpenDesignerCanvas}
								onDesignerCanvasRename={renameDesignerCanvas}
								onDesignerCanvasDelete={handleDesignerCanvasDeleteClick}
								onDesignerCanvasStar={starDesignerCanvas}
								onDesignerCanvasClear={clearDesignerCanvasSelection}

								onClose={() => showLibrary = false}
							/>
						{/if}
					</div>

					<PersonaDropdown
						selectedPersona={selectedPersona}
						onSelect={selectPersona}
					/>

					<ScrollControls config={CHAT_CONFIG} />

					<button
						class="control-btn hit-target"
						class:active={annotationMode}
						title={annotationMode ? 'Exit annotation mode' : 'Annotate linked article'}
						onclick={() => {
							annotationMode = !annotationMode;
							if (!annotationMode) {
								clearAnnotationMarker();
							}
						}}
					>
						<Icon src={LuFilePenLine} size="11" />
					</button>

					<ServerStatusLED />
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
		<PasteArea
			onClose={() => showFilePaste = false}
			onSuccess={handleFilePasteSuccess}
			onImageUploaded={async () => {
				await loadFileCharts();
				forceCanvas = 'carousel';
			}}
		/>
	{/if}

	<ConfirmationModal
		isOpen={deleteConfirm.isActive}
		progress={deleteConfirm.progress}
		onCancel={() => deleteConfirm.cancel()}
	/>


	<ConfirmationModal
		isOpen={articleDeleteConfirm.isActive}
		progress={articleDeleteConfirm.progress}
		onCancel={() => articleDeleteConfirm.cancel()}
	/>

	<ConfirmationModal
		isOpen={chartDeleteConfirm.isActive}
		progress={chartDeleteConfirm.progress}
		onCancel={() => chartDeleteConfirm.cancel()}
	/>

	<ConfirmationModal
		isOpen={whiteboardDeleteConfirm.isActive}
		progress={whiteboardDeleteConfirm.progress}
		onCancel={() => whiteboardDeleteConfirm.cancel()}
	/>

	<ConfirmationModal
		isOpen={designerCanvasDeleteConfirm.isActive}
		progress={designerCanvasDeleteConfirm.progress}
		onCancel={() => designerCanvasDeleteConfirm.cancel()}
	/>

	<CanvasContainer
		persona={selectedPersona}
		charts={allCharts}
		bind:selectedChartIndex
		bind:showLightbox
		bind:forceCanvas
		{calendarRefreshTrigger}
		{whiteboardRefreshTrigger}
		enableDelete={true}
		onDelete={handleChartDeleteClick}
		{whiteboards}
		activeWhiteboardId={viewingWhiteboardId}
		{selectedWhiteboardIds}
		onWhiteboardSelect={handleWhiteboardSelect}
		onWhiteboardStateChange={handleWhiteboardStateChange}
		{designerCanvasRefreshTrigger}
		{designerCanvases}
		activeDesignerCanvasId={viewingDesignerCanvasId}
		{selectedDesignerCanvasIds}
		onDesignerCanvasSelect={handleDesignerCanvasSelect}
		onDesignerCanvasStateChange={handleDesignerCanvasStateChange}
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
		height: var(--input-bar-height);
		box-sizing: border-box;
		position: relative;
		z-index: 10;
	}

	.input-controls {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--action-icon-gap);
		margin-bottom: 0px;
		flex-wrap: nowrap;
		overflow: visible;
		position: relative;
	}

	.input-controls::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		width: 100%;
		background: hsl(var(--background));
		border-radius: 6px;
	}

	.library-wrapper {
		position: relative;
	}

	.selection-badge {
		position: absolute;
		top: -3px;
		right: -3px;
		background: var(--current-accent);
		color: hsl(var(--background));
		font-size: 0.5rem;
		font-weight: 600;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
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


	.input-container {
		position: absolute;
		bottom: 0;
		left: var(--layout-padding);
		right: var(--layout-padding);
		display: flex;
		gap: 12px;
		align-items: flex-end;
		max-width: var(--middle-section-width);
		margin: 0 auto;
		width: calc(100% - 2 * var(--layout-padding));
		padding-bottom: 16px;
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
		max-height: 500px;
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

	/* Annotation mode styles */
	.messages-content.annotation-mode {
		cursor: crosshair;
	}

	.messages-content.annotation-mode :global(.ai-message) {
		cursor: crosshair;
	}

	:global(.annotation-marker) {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		margin: 12px 0;
		background: var(--boss-accent-bg);
		border-left: 3px solid var(--boss-accent);
		border-radius: 0 6px 6px 0;
		color: var(--boss-accent);
		font-size: 0.85rem;
		animation: markerPulse 0.3s ease-out;
		position: relative;
	}

	:global(.annotation-marker svg) {
		flex-shrink: 0;
	}

	:global(.annotation-dismiss) {
		position: absolute;
		right: 8px;
		top: 50%;
		transform: translateY(-50%);
		background: transparent;
		border: none;
		color: var(--boss-accent);
		font-size: 1.2rem;
		font-weight: bold;
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.2s;
		padding: 4px 8px;
		line-height: 1;
	}

	:global(.annotation-marker:hover .annotation-dismiss) {
		opacity: 0.7;
	}

	:global(.annotation-dismiss:hover) {
		opacity: 1 !important;
	}

	@keyframes markerPulse {
		0% {
			opacity: 0;
			transform: translateX(-10px);
		}
		100% {
			opacity: 1;
			transform: translateX(0);
		}
	}
</style>
