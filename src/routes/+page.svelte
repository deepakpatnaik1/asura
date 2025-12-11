<script lang="ts">
	import { Icon } from 'svelte-icons-pack';
	import { LuPaperclip, LuFolder, LuStickyNote, LuPalette } from 'svelte-icons-pack/lu';
	import { currentMessage, isLoading, sendMessage, abortCurrentMessage, lastMutations, lastWhiteboardMutations, lastCanvasMutations } from '$lib/stores/chat';
	import { tick, onMount } from 'svelte';
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
	import ContentLibrary from '$lib/components/ContentLibrary.svelte';
	import BoardLibrary from '$lib/components/BoardLibrary.svelte';
	import CanvasLibrary from '$lib/components/CanvasLibrary.svelte';
	
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
	let forceCanvas = $state<CanvasType | null>(null);
	let calendarRefreshTrigger = $state(0);
	let whiteboardRefreshTrigger = $state(0);

	// Whiteboard state for notes canvas
	interface Whiteboard {
		id: string;
		title: string;
		state?: {
			notes: Array<{ id: string; x: number; y: number; text: string; fill: string; width: number; height: number }>;
			viewport: { x: number; y: number; scale: number };
		};
		created_at: string;
		updated_at: string;
	}
	let whiteboards = $state<Whiteboard[]>([]);
	let selectedWhiteboardIds = $state<string[]>([]); // Whiteboards selected for context injection
	let viewingWhiteboardId = $state<string | null>(null); // Currently displayed in canvas

	// Canvas state for Eva's character design workspace (separate from Gunnar's whiteboards)
	interface EvaCanvas {
		id: string;
		title: string;
		state?: {
			render: Array<{ id: string; type: 'note' | 'label' | 'line' | 'arrow' | 'group' | 'image'; x?: number; y?: number; text?: string; fill?: string; width?: number; height?: number; src?: string }>;
			semantic: Record<string, unknown>;
			viewport: { x: number; y: number; scale: number };
		};
		created_at: string;
		updated_at: string;
	}
	let evaCanvases = $state<EvaCanvas[]>([]);
	let selectedCanvasIds = $state<string[]>([]); // Canvases selected for context injection
	let viewingCanvasId = $state<string | null>(null); // Currently displayed canvas

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
			// Handle created whiteboards - add to list
			if (mutations.created_whiteboards && mutations.created_whiteboards.length > 0) {
				whiteboards = [...whiteboards, ...mutations.created_whiteboards];
			}

			// Handle renamed whiteboards - update titles
			if (mutations.renamed_whiteboards && mutations.renamed_whiteboards.length > 0) {
				for (const renamed of mutations.renamed_whiteboards) {
					whiteboards = whiteboards.map(wb =>
						wb.id === renamed.id ? { ...wb, title: renamed.title } : wb
					);
				}
			}

			// Handle deleted whiteboards - remove from list and selection
			if (mutations.deleted_whiteboards && mutations.deleted_whiteboards.length > 0) {
				const deletedIds = new Set(mutations.deleted_whiteboards);
				whiteboards = whiteboards.filter(wb => !deletedIds.has(wb.id));
				// Remove deleted from selection
				selectedWhiteboardIds = selectedWhiteboardIds.filter(id => !deletedIds.has(id));
				// Clear viewing if it was deleted
				if (viewingWhiteboardId && deletedIds.has(viewingWhiteboardId)) {
					viewingWhiteboardId = whiteboards.length > 0 ? whiteboards[0].id : null;
				}
			}

			// Handle opened whiteboard - select it, view it, and switch canvas
			if (mutations.opened_whiteboard) {
				const openedId = mutations.opened_whiteboard;
				// Add to selection if not already selected
				if (!selectedWhiteboardIds.includes(openedId)) {
					selectedWhiteboardIds = [...selectedWhiteboardIds, openedId];
				}
				viewingWhiteboardId = openedId;
				forceCanvas = 'notes'; // Switch to notes canvas when whiteboard is opened
			}

			// Handle updated whiteboards - apply state changes and trigger refresh
			if (mutations.updated_whiteboards && mutations.updated_whiteboards.length > 0) {
				for (const updated of mutations.updated_whiteboards) {
					whiteboards = whiteboards.map(wb =>
						wb.id === updated.id ? { ...wb, state: updated.state } : wb
					);
				}
				whiteboardRefreshTrigger++;
			}

			// Clear mutations after processing
			lastWhiteboardMutations.set(null);
		}
	});

	// Handle canvas mutations from Eva's tools
	$effect(() => {
		const mutations = $lastCanvasMutations;
		if (mutations) {
			// Handle created canvases - add to list
			if (mutations.created_canvases && mutations.created_canvases.length > 0) {
				evaCanvases = [...evaCanvases, ...mutations.created_canvases];
			}

			// Handle renamed canvases - update titles
			if (mutations.renamed_canvases && mutations.renamed_canvases.length > 0) {
				for (const renamed of mutations.renamed_canvases) {
					evaCanvases = evaCanvases.map(c =>
						c.id === renamed.id ? { ...c, title: renamed.title } : c
					);
				}
			}

			// Handle deleted canvases - remove from list and selection
			if (mutations.deleted_canvases && mutations.deleted_canvases.length > 0) {
				const deletedIds = new Set(mutations.deleted_canvases);
				evaCanvases = evaCanvases.filter(c => !deletedIds.has(c.id));
				// Remove deleted from selection
				selectedCanvasIds = selectedCanvasIds.filter(id => !deletedIds.has(id));
				// Clear viewing if it was deleted
				if (viewingCanvasId && deletedIds.has(viewingCanvasId)) {
					viewingCanvasId = evaCanvases.length > 0 ? evaCanvases[0].id : null;
				}
			}

			// Handle updated canvases - apply state changes
			if (mutations.updated_canvases && mutations.updated_canvases.length > 0) {
				for (const updated of mutations.updated_canvases) {
					evaCanvases = evaCanvases.map(c =>
						c.id === updated.id ? { ...c, state: updated.state } : c
					);
				}
			}

			// Handle opened canvas - select it, view it, and switch canvas view
			if (mutations.opened_canvas) {
				const openedId = mutations.opened_canvas;
				// Add to selection if not already selected
				if (!selectedCanvasIds.includes(openedId)) {
					selectedCanvasIds = [...selectedCanvasIds, openedId];
				}
				viewingCanvasId = openedId;
				forceCanvas = 'design'; // Switch to design canvas when canvas is opened
			}

			// Clear mutations after processing
			lastCanvasMutations.set(null);
		}
	});

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
	let showBoardLibrary = $state(false);
	let showCanvasLibrary = $state(false);
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
	const whiteboardDeleteConfirm = createConfirmation();
	let isDeletingWhiteboard = $state(false);
	const canvasDeleteConfirm = createConfirmation();
	let isDeletingCanvas = $state(false);

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
				whiteboards = data.whiteboards || [];
				// Auto-select all whiteboards for context injection (Gunnar should see what he created)
				selectedWhiteboardIds = whiteboards.map(wb => wb.id);
				// Auto-view first whiteboard (most recently updated) and fetch its full state
				if (whiteboards.length > 0 && !viewingWhiteboardId) {
					const firstId = whiteboards[0].id;
					viewingWhiteboardId = firstId;
					// Fetch full state for the viewing whiteboard
					const stateResponse = await fetch(`/api/whiteboards/${firstId}`);
					if (stateResponse.ok) {
						const stateData = await stateResponse.json();
						whiteboards = whiteboards.map(wb =>
							wb.id === firstId ? stateData.whiteboard : wb
						);
					}
				}
			}
		} catch (error) {
			console.error('Failed to load whiteboards:', error);
		}
	}

	// Fetch canvases for Eva's character design workspace
	async function loadCanvases() {
		try {
			const response = await fetch('/api/canvases');
			if (response.ok) {
				const data = await response.json();
				evaCanvases = data.canvases || [];
				// Auto-select all canvases for context injection
				selectedCanvasIds = evaCanvases.map(c => c.id);
				// Auto-view first canvas (most recently updated) and fetch its full state
				if (evaCanvases.length > 0 && !viewingCanvasId) {
					const firstId = evaCanvases[0].id;
					viewingCanvasId = firstId;
					// Fetch full state for the viewing canvas
					const stateResponse = await fetch(`/api/canvases/${firstId}`);
					if (stateResponse.ok) {
						const stateData = await stateResponse.json();
						evaCanvases = evaCanvases.map(c =>
							c.id === firstId ? stateData.canvas : c
						);
					}
				}
			}
		} catch (error) {
			console.error('Failed to load canvases:', error);
		}
	}

	// Toggle whiteboard selection for context injection
	function toggleWhiteboardSelection(id: string) {
		if (selectedWhiteboardIds.includes(id)) {
			selectedWhiteboardIds = selectedWhiteboardIds.filter(wid => wid !== id);
		} else {
			selectedWhiteboardIds = [...selectedWhiteboardIds, id];
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

	// Toggle canvas selection for context injection (Eva)
	function toggleCanvasSelection(id: string) {
		if (selectedCanvasIds.includes(id)) {
			selectedCanvasIds = selectedCanvasIds.filter(cid => cid !== id);
		} else {
			selectedCanvasIds = [...selectedCanvasIds, id];
		}
	}

	// Handle canvas click from library - toggle selection AND view it
	async function handleCanvasSelect(id: string) {
		// Toggle selection
		toggleCanvasSelection(id);
		// Also set as viewing
		viewingCanvasId = id;
		// Fetch full canvas state
		try {
			const response = await fetch(`/api/canvases/${id}`);
			if (response.ok) {
				const data = await response.json();
				// Update the canvas in the list with full state
				evaCanvases = evaCanvases.map(c =>
					c.id === id ? data.canvas : c
				);
			}
		} catch (error) {
			console.error('Failed to fetch canvas:', error);
		}
	}

	// Open canvas for viewing (without toggling selection)
	async function handleOpenCanvas(id: string) {
		viewingCanvasId = id;
		// Fetch full canvas state
		try {
			const response = await fetch(`/api/canvases/${id}`);
			if (response.ok) {
				const data = await response.json();
				evaCanvases = evaCanvases.map(c =>
					c.id === id ? data.canvas : c
				);
			}
		} catch (error) {
			console.error('Failed to fetch canvas:', error);
		}
	}

	// Debounced save for canvas state changes
	let canvasSaveTimeout: ReturnType<typeof setTimeout> | null = null;
	function handleCanvasStateChange(id: string, state: EvaCanvas['state']) {
		// Update local state immediately
		evaCanvases = evaCanvases.map(c =>
			c.id === id ? { ...c, state } : c
		);

		// Debounce save to API
		if (canvasSaveTimeout) {
			clearTimeout(canvasSaveTimeout);
		}
		canvasSaveTimeout = setTimeout(async () => {
			try {
				await fetch(`/api/canvases/${id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ state })
				});
			} catch (error) {
				console.error('Failed to save canvas:', error);
			}
		}, 1000); // Save after 1 second of no changes
	}

	// Clear all canvas selections
	function clearCanvasSelection() {
		selectedCanvasIds = [];
	}

	// Delete canvas with confirmation
	function handleCanvasDeleteClick(canvasId: string, event: MouseEvent) {
		event.stopPropagation();
		canvasDeleteConfirm.start(async () => {
			isDeletingCanvas = true;
			try {
				const response = await fetch(`/api/canvases/${canvasId}`, {
					method: 'DELETE'
				});
				if (response.ok) {
					evaCanvases = evaCanvases.filter(c => c.id !== canvasId);
					selectedCanvasIds = selectedCanvasIds.filter(id => id !== canvasId);
					if (viewingCanvasId === canvasId) {
						viewingCanvasId = evaCanvases.length > 0 ? evaCanvases[0].id : null;
					}
				}
			} catch (error) {
				console.error('Failed to delete canvas:', error);
			} finally {
				isDeletingCanvas = false;
			}
		});
	}

	// Toggle canvas library dropdown
	function handleCanvasLibraryClick() {
		showCanvasLibrary = !showCanvasLibrary;
		if (showCanvasLibrary) {
			showFileLibrary = false;
			showBoardLibrary = false;
		}
	}

	onMount(() => {
		textareaRef?.focus();

		// Initialize canvas based on the loaded persona (persists across refresh)
		forceCanvas = getDefaultCanvasForPersona(selectedPersona);

		(async () => {
			inputMessage = getPersonaPrefix();
			await Promise.all([loadCharts(), loadWhiteboards(), loadCanvases()]);
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
			if (canvasSaveTimeout) clearTimeout(canvasSaveTimeout);
			deleteConfirm.cleanup();
			fileDeleteConfirm.cleanup();
			chartDeleteConfirm.cleanup();
			whiteboardDeleteConfirm.cleanup();
			canvasDeleteConfirm.cleanup();
			window.removeEventListener('nuke-complete', handleNukeEvent as EventListener);
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

		// Close persona-specific library dropdowns
		showBoardLibrary = false;
		showCanvasLibrary = false;

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

		await sendMessage(
			message,
			selectedPersona,
			chartId,
			chartSource,
			undefined,
			selectedWhiteboardIds.length > 0 ? selectedWhiteboardIds : undefined,
			selectedCanvasIds.length > 0 ? selectedCanvasIds : undefined
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

	function handleNukeComplete(bucket: string) {
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
		showBoardLibrary = false;
		showFilePaste = !showFilePaste;
		if (showFilePaste) {
			await tick();
			const pasteArea = document.querySelector('.paste-area') as HTMLElement;
			pasteArea?.focus();
		}
	}

	async function handleFolderClick() {
		showFilePaste = false;
		showBoardLibrary = false;
		showFileLibrary = !showFileLibrary;
		if (showFileLibrary) {
			await loadFiles();
		}
	}

	async function handleBoardLibraryClick() {
		showFilePaste = false;
		showFileLibrary = false;
		showBoardLibrary = !showBoardLibrary;
	}

	function clearWhiteboardSelection() {
		selectedWhiteboardIds = [];
		showBoardLibrary = false;
	}

	function handleOpenWhiteboard(id: string) {
		viewingWhiteboardId = id;
		forceCanvas = 'notes';
		showBoardLibrary = false;
	}

	function handleWhiteboardDeleteClick(whiteboardId: string, event: MouseEvent) {
		event.stopPropagation();
		whiteboardDeleteConfirm.start(whiteboardId, async () => {
			isDeletingWhiteboard = true;
			const originalWhiteboards = whiteboards;
			whiteboards = whiteboards.filter(wb => wb.id !== whiteboardId);
			selectedWhiteboardIds = selectedWhiteboardIds.filter(id => id !== whiteboardId);
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
			} finally {
				isDeletingWhiteboard = false;
			}
		});
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
					forceCanvas = 'carousel'; // Switch to carousel when content is selected
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
		if (event.key === 'Escape' && showBoardLibrary) {
			showBoardLibrary = false;
			textareaRef?.focus();
			return;
		}
		if (event.key === 'Escape' && showCanvasLibrary) {
			showCanvasLibrary = false;
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
		if (!showFilePaste && !showFileLibrary && !showBoardLibrary && !showCanvasLibrary) {
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
								items={files}
								isDeleting={isDeletingFile}
								onToggle={toggleFile}
								onRename={renameFile}
								onDelete={handleFileDeleteClick}
								onClear={clearAllFiles}
							/>
						{/if}
					</div>

					<div class="board-wrapper">
						<button
							class="control-btn hit-target"
							class:active={showBoardLibrary || selectedWhiteboardIds.length > 0}
							title="Board library"
							onclick={handleBoardLibraryClick}
						>
							<Icon src={LuStickyNote} size="11" />
							{#if selectedWhiteboardIds.length > 0}
								<span class="selection-badge">{selectedWhiteboardIds.length}</span>
							{/if}
						</button>
						{#if showBoardLibrary}
							<BoardLibrary
								{whiteboards}
								selectedIds={selectedWhiteboardIds}
								isDeleting={isDeletingWhiteboard}
								onToggle={toggleWhiteboardSelection}
								onOpen={handleOpenWhiteboard}
								onDelete={handleWhiteboardDeleteClick}
								onClear={clearWhiteboardSelection}
							/>
						{/if}
					</div>

					<div class="canvas-wrapper">
						<button
							class="control-btn hit-target"
							class:active={showCanvasLibrary || selectedCanvasIds.length > 0}
							title="Canvas library"
							onclick={handleCanvasLibraryClick}
						>
							<Icon src={LuPalette} size="11" />
							{#if selectedCanvasIds.length > 0}
								<span class="selection-badge">{selectedCanvasIds.length}</span>
							{/if}
						</button>
						{#if showCanvasLibrary}
							<CanvasLibrary
								canvases={evaCanvases}
								selectedIds={selectedCanvasIds}
								isDeleting={isDeletingCanvas}
								onToggle={toggleCanvasSelection}
								onOpen={handleOpenCanvas}
								onDelete={handleCanvasDeleteClick}
								onClear={clearCanvasSelection}
							/>
						{/if}
					</div>

					<PersonaDropdown
						selectedPersona={selectedPersona}
						onSelect={selectPersona}
					/>

					<div class="icon-group">
						<ScrollControls config={CHAT_CONFIG} />
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
		isOpen={fileDeleteConfirm.isActive}
		progress={fileDeleteConfirm.progress}
		onCancel={() => fileDeleteConfirm.cancel()}
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
		isOpen={canvasDeleteConfirm.isActive}
		progress={canvasDeleteConfirm.progress}
		onCancel={() => canvasDeleteConfirm.cancel()}
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
		canvases={evaCanvases}
		activeCanvasId={viewingCanvasId}
		{selectedCanvasIds}
		onCanvasSelect={handleCanvasSelect}
		onCanvasStateChange={handleCanvasStateChange}
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

	.folder-wrapper,
	.board-wrapper,
	.canvas-wrapper {
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

	.icon-group {
		display: flex;
		align-items: center;
		gap: var(--action-icon-gap);
		margin-left: 12px;
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
</style>
