<script lang="ts">
	/**
	 * UnifiedLibrary - Four-column dropdown for all selectable content
	 *
	 * Columns:
	 * 1. Artisan Cut - canon + strategic articles
	 * 2. Raw - ephemeral articles (no artisan cut)
	 * 3. Whiteboards - Gunnar's scratch pads
	 * 4. Designer Canvases - Eva's character canvases
	 *
	 * All selections go into AI context for next message turn.
	 */
	import { tick } from 'svelte';
	import { Icon } from 'svelte-icons-pack';
	import { LuTrash2, LuCheck, LuStar, LuEye, LuRefreshCw } from 'svelte-icons-pack/lu';

	// Types
	interface Article {
		id: string;
		title: string;
		is_enabled?: boolean;
		is_starred?: boolean;
		tier?: string;
		source_path?: string | null; // Set when linked to Obsidian file
		owner?: string | null; // Persona name if owner-assigned
		created_at: string;
	}

	interface Whiteboard {
		id: string;
		title: string;
		is_starred?: boolean;
		state?: unknown;
		created_at: string;
		updated_at: string;
	}

	interface DesignerCanvas {
		id: string;
		title: string;
		is_starred?: boolean;
		state?: unknown;
		created_at: string;
		updated_at: string;
	}

	interface Props {
		// Articles
		articles: Article[];
		watchedArticleId?: string | null; // Single article being watched for live updates
		onArticleToggle?: (id: string, currentState: boolean) => void;
		onArticleWatch?: (id: string | null) => void; // Set/clear watched article
		onArticleSelect?: (id: string) => void;
		onArticleRename?: (id: string, newTitle: string) => void;
		onArticleDelete: (id: string, event: MouseEvent) => void;
		onArticleStar?: (id: string, currentState: boolean) => void;
		onArticleRefresh?: (id: string) => Promise<void>; // Refresh artisan cut for linked files
		onArticleClear?: () => void;

		// Whiteboards
		whiteboards: Whiteboard[];
		selectedWhiteboardIds: string[];
		onWhiteboardToggle: (id: string) => void;
		onWhiteboardOpen: (id: string) => void;
		onWhiteboardRename?: (id: string, newTitle: string) => void;
		onWhiteboardDelete?: (id: string, event: MouseEvent) => void;
		onWhiteboardStar?: (id: string, currentState: boolean) => void;
		onWhiteboardClear?: () => void;

		// Designer Canvases
		designerCanvases?: DesignerCanvas[];
		selectedDesignerCanvasIds?: string[];
		onDesignerCanvasToggle?: (id: string) => void;
		onDesignerCanvasOpen?: (id: string) => void;
		onDesignerCanvasRename?: (id: string, newTitle: string) => void;
		onDesignerCanvasDelete?: (id: string, event: MouseEvent) => void;
		onDesignerCanvasStar?: (id: string, currentState: boolean) => void;
		onDesignerCanvasClear?: () => void;

		// Close handler for click-outside
		onClose?: () => void;
	}

	let {
		articles,
		watchedArticleId = null,
		onArticleToggle,
		onArticleWatch,
		onArticleSelect,
		onArticleRename,
		onArticleDelete,
		onArticleStar,
		onArticleRefresh,
		onArticleClear,

		whiteboards,
		selectedWhiteboardIds,
		onWhiteboardToggle,
		onWhiteboardOpen,
		onWhiteboardRename,
		onWhiteboardDelete,
		onWhiteboardStar,
		onWhiteboardClear,

		designerCanvases = [],
		selectedDesignerCanvasIds = [],
		onDesignerCanvasToggle,
		onDesignerCanvasOpen,
		onDesignerCanvasRename,
		onDesignerCanvasDelete,
		onDesignerCanvasStar,
		onDesignerCanvasClear,
		onClose
	}: Props = $props();

	// Split articles into curated (canon + strategic) and raw (ephemeral)
	// Canon always at bottom of curated pane
	const curatedArticles = $derived(
		articles
			.filter((a) => a.tier === 'canon' || a.tier === 'strategic')
			.sort((a, b) => {
				if (a.tier === 'canon' && b.tier !== 'canon') return 1;
				if (a.tier !== 'canon' && b.tier === 'canon') return -1;
				return 0; // Keep original order within same tier
			})
	);
	const rawArticles = $derived(articles.filter((a) => a.tier === 'ephemeral' || !a.tier));

	// Derived state
	const hasArticleSelection = $derived(articles.some((a) => a.is_enabled));
	const hasWhiteboardSelection = $derived(selectedWhiteboardIds.length > 0);
	const hasDesignerCanvasSelection = $derived(selectedDesignerCanvasIds.length > 0);
	const hasAnySelection = $derived(hasArticleSelection || hasWhiteboardSelection || hasDesignerCanvasSelection);

	// Clear all selections
	function clearAllSelections() {
		if (onArticleClear) onArticleClear();
		if (onWhiteboardClear) onWhiteboardClear();
		if (onDesignerCanvasClear) onDesignerCanvasClear();
	}

	// Article editing state
	let editingArticleId = $state<string | null>(null);
	let editingArticleTitle = $state('');
	let articleInputRef = $state<HTMLInputElement | null>(null);

	// Whiteboard editing state
	let editingWhiteboardId = $state<string | null>(null);
	let editingWhiteboardTitle = $state('');
	let whiteboardInputRef = $state<HTMLInputElement | null>(null);

	// Designer canvas editing state
	let editingDesignerCanvasId = $state<string | null>(null);
	let editingDesignerCanvasTitle = $state('');
	let designerCanvasInputRef = $state<HTMLInputElement | null>(null);

	// Refresh artisan cut state
	let refreshingArticleId = $state<string | null>(null);

	function formatDate(dateString: string) {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric'
		});
	}

	// Article handlers
	function handleArticleToggle(item: Article, event: MouseEvent) {
		event.stopPropagation();
		if (onArticleToggle) {
			onArticleToggle(item.id, item.is_enabled ?? false);
		}
	}

	function handleArticleRowClick(item: Article, event: MouseEvent) {
		// Don't trigger if clicking on interactive elements (they have their own handlers)
		const target = event.target as HTMLElement;
		if (target.closest('button') || target.closest('input')) return;

		if (onArticleSelect) {
			onArticleSelect(item.id);
		}
	}

	async function startArticleEdit(item: Article, event: MouseEvent) {
		event.stopPropagation();
		editingArticleId = item.id;
		editingArticleTitle = item.title;
		await tick();
		articleInputRef?.focus();
		articleInputRef?.select();
	}

	function handleArticleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			saveArticleEdit();
		} else if (event.key === 'Escape') {
			cancelArticleEdit();
		}
	}

	function saveArticleEdit() {
		if (editingArticleId && editingArticleTitle.trim() && onArticleRename) {
			onArticleRename(editingArticleId, editingArticleTitle.trim());
		}
		editingArticleId = null;
		editingArticleTitle = '';
	}

	function cancelArticleEdit() {
		editingArticleId = null;
		editingArticleTitle = '';
	}

	function handleArticleStar(item: Article, event: MouseEvent) {
		event.stopPropagation();
		if (onArticleStar) {
			onArticleStar(item.id, item.is_starred ?? false);
		}
	}

	function handleArticleWatch(item: Article, event: MouseEvent) {
		event.stopPropagation();
		if (onArticleWatch) {
			// Toggle: if already watched, stop; otherwise watch this one
			const newWatchId = watchedArticleId === item.id ? null : item.id;
			onArticleWatch(newWatchId);
		}
	}

	async function handleArticleRefresh(item: Article, event: MouseEvent) {
		event.stopPropagation();
		if (onArticleRefresh && !refreshingArticleId) {
			refreshingArticleId = item.id;
			try {
				await onArticleRefresh(item.id);
			} finally {
				refreshingArticleId = null;
			}
		}
	}

	// Whiteboard handlers
	function handleWhiteboardToggle(id: string, event: MouseEvent) {
		event.stopPropagation();
		onWhiteboardToggle(id);
	}

	function handleWhiteboardOpen(id: string, event: MouseEvent) {
		event.stopPropagation();
		onWhiteboardOpen(id);
	}

	async function startWhiteboardEdit(wb: Whiteboard, event: MouseEvent) {
		event.stopPropagation();
		editingWhiteboardId = wb.id;
		editingWhiteboardTitle = wb.title;
		await tick();
		whiteboardInputRef?.focus();
		whiteboardInputRef?.select();
	}

	function handleWhiteboardKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			saveWhiteboardEdit();
		} else if (event.key === 'Escape') {
			cancelWhiteboardEdit();
		}
	}

	function saveWhiteboardEdit() {
		if (editingWhiteboardId && editingWhiteboardTitle.trim() && onWhiteboardRename) {
			onWhiteboardRename(editingWhiteboardId, editingWhiteboardTitle.trim());
		}
		editingWhiteboardId = null;
		editingWhiteboardTitle = '';
	}

	function cancelWhiteboardEdit() {
		editingWhiteboardId = null;
		editingWhiteboardTitle = '';
	}

	function handleWhiteboardStar(wb: Whiteboard, event: MouseEvent) {
		event.stopPropagation();
		if (onWhiteboardStar) {
			onWhiteboardStar(wb.id, wb.is_starred ?? false);
		}
	}

	// Designer canvas handlers
	function handleDesignerCanvasToggle(id: string, event: MouseEvent) {
		event.stopPropagation();
		if (onDesignerCanvasToggle) onDesignerCanvasToggle(id);
	}

	function handleDesignerCanvasOpen(id: string, event: MouseEvent) {
		event.stopPropagation();
		if (onDesignerCanvasOpen) onDesignerCanvasOpen(id);
	}

	async function startDesignerCanvasEdit(canvas: DesignerCanvas, event: MouseEvent) {
		event.stopPropagation();
		editingDesignerCanvasId = canvas.id;
		editingDesignerCanvasTitle = canvas.title;
		await tick();
		designerCanvasInputRef?.focus();
		designerCanvasInputRef?.select();
	}

	function handleDesignerCanvasKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			saveDesignerCanvasEdit();
		} else if (event.key === 'Escape') {
			cancelDesignerCanvasEdit();
		}
	}

	function saveDesignerCanvasEdit() {
		if (editingDesignerCanvasId && editingDesignerCanvasTitle.trim() && onDesignerCanvasRename) {
			onDesignerCanvasRename(editingDesignerCanvasId, editingDesignerCanvasTitle.trim());
		}
		editingDesignerCanvasId = null;
		editingDesignerCanvasTitle = '';
	}

	function cancelDesignerCanvasEdit() {
		editingDesignerCanvasId = null;
		editingDesignerCanvasTitle = '';
	}

	function handleDesignerCanvasStar(canvas: DesignerCanvas, event: MouseEvent) {
		event.stopPropagation();
		if (onDesignerCanvasStar) {
			onDesignerCanvasStar(canvas.id, canvas.is_starred ?? false);
		}
	}
</script>

<!-- Invisible backdrop to catch outside clicks -->
{#if onClose}
	<button class="library-backdrop" onclick={onClose} aria-label="Close library"></button>
{/if}

<div class="unified-library-dropdown">
	{#if hasAnySelection}
		<div class="dropdown-header">
			<button class="clear-all-btn" onclick={clearAllSelections}>Clear all</button>
		</div>
	{/if}
	<div class="columns-container">
		<!-- Artisan Cut Articles Column (canon + strategic) -->
		<div class="column">
		<div class="column-header">Artisan Cut</div>
		{#if curatedArticles.length === 0}
			<div class="column-empty">No artisan cut articles</div>
		{:else}
			{#if onArticleClear && hasArticleSelection}
				<button class="clear-btn" onclick={onArticleClear}>Clear</button>
			{/if}
			<div class="column-items">
				{#each curatedArticles as item (item.id)}
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
					<div class="item" class:active={item.is_enabled} onclick={(e) => handleArticleRowClick(item, e)}>
						{#if item.tier === 'canon'}
							<span class="toggle-spacer"></span>
						{:else}
							<button
								class="toggle-btn"
								class:active={item.is_enabled}
								onclick={(e) => handleArticleToggle(item, e)}
								title={item.is_enabled ? 'Remove from context' : 'Add to context'}
							>
								{#if item.is_enabled}
									<Icon src={LuCheck} size="9" />
								{/if}
							</button>
						{/if}
						<div class="item-info">
							{#if editingArticleId === item.id}
								<input
									type="text"
									class="title-input"
									bind:value={editingArticleTitle}
									bind:this={articleInputRef}
									onkeydown={handleArticleKeydown}
									onblur={saveArticleEdit}
									onclick={(e) => e.stopPropagation()}
								/>
							{:else}
								<button class="title-btn" onclick={(e) => startArticleEdit(item, e)}>
									<span class="item-title">{item.title}</span>
								</button>
							{/if}
							<span class="item-date">{formatDate(item.created_at)}</span>
						</div>
						<button
							class="star-btn"
							class:active={item.is_starred}
							onclick={(e) => handleArticleStar(item, e)}
							title={item.is_starred ? 'Remove bookmark' : 'Bookmark'}
						>
							<Icon src={LuStar} size="11" />
						</button>
						{#if item.source_path}
							{#if item.owner}
								<span class="watch-spacer"></span>
							{:else}
								<button
									class="watch-btn"
									class:active={watchedArticleId === item.id}
									onclick={(e) => handleArticleWatch(item, e)}
									title={watchedArticleId === item.id ? 'Stop watching' : 'Watch for live updates'}
								>
									<Icon src={LuEye} size="11" />
								</button>
							{/if}
							<button
								class="refresh-btn"
								class:refreshing={refreshingArticleId === item.id}
								onclick={(e) => handleArticleRefresh(item, e)}
								title="Refresh artisan cut"
								disabled={refreshingArticleId === item.id}
							>
								<Icon src={LuRefreshCw} size="11" />
							</button>
						{:else}
							<span class="watch-spacer"></span>
							<span class="refresh-spacer"></span>
						{/if}
						<button
							class="delete-btn"
							onclick={(e) => onArticleDelete(item.id, e)}
							title="Delete"
						>
							<Icon src={LuTrash2} size="11" />
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Raw Articles Column (ephemeral) -->
	<div class="column">
		<div class="column-header">Raw</div>
		{#if rawArticles.length === 0}
			<div class="column-empty">No raw articles</div>
		{:else}
			<div class="column-items">
				{#each rawArticles as item (item.id)}
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
					<div class="item" class:active={item.is_enabled} onclick={(e) => handleArticleRowClick(item, e)}>
						<button
							class="toggle-btn"
							class:active={item.is_enabled}
							onclick={(e) => handleArticleToggle(item, e)}
							title={item.is_enabled ? 'Remove from context' : 'Add to context'}
						>
							{#if item.is_enabled}
								<Icon src={LuCheck} size="9" />
							{/if}
						</button>
						<div class="item-info">
							{#if editingArticleId === item.id}
								<input
									type="text"
									class="title-input"
									bind:value={editingArticleTitle}
									bind:this={articleInputRef}
									onkeydown={handleArticleKeydown}
									onblur={saveArticleEdit}
									onclick={(e) => e.stopPropagation()}
								/>
							{:else}
								<button class="title-btn" onclick={(e) => startArticleEdit(item, e)}>
									<span class="item-title">{item.title}</span>
								</button>
							{/if}
							<span class="item-date">{formatDate(item.created_at)}</span>
						</div>
						<button
							class="star-btn"
							class:active={item.is_starred}
							onclick={(e) => handleArticleStar(item, e)}
							title={item.is_starred ? 'Remove bookmark' : 'Bookmark'}
						>
							<Icon src={LuStar} size="11" />
						</button>
						{#if item.source_path && !item.owner}
							<button
								class="watch-btn"
								class:active={watchedArticleId === item.id}
								onclick={(e) => handleArticleWatch(item, e)}
								title={watchedArticleId === item.id ? 'Stop watching' : 'Watch for live updates'}
							>
								<Icon src={LuEye} size="11" />
							</button>
						{:else}
							<span class="watch-spacer"></span>
						{/if}
						<!-- Raw articles don't have artisan cuts, so no refresh button - just spacer -->
						<span class="refresh-spacer"></span>
						<button
							class="delete-btn"
							onclick={(e) => onArticleDelete(item.id, e)}
							title="Delete"
						>
							<Icon src={LuTrash2} size="11" />
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Whiteboards Column -->
	<div class="column">
		<div class="column-header">Whiteboards</div>
		{#if whiteboards.length === 0}
			<div class="column-empty">No whiteboards</div>
		{:else}
			{#if onWhiteboardClear && hasWhiteboardSelection}
				<button class="clear-btn" onclick={onWhiteboardClear}>Clear</button>
			{/if}
			<div class="column-items">
				{#each whiteboards as wb (wb.id)}
					{@const isSelected = selectedWhiteboardIds.includes(wb.id)}
					<div class="item" class:active={isSelected}>
						<button
							class="toggle-btn"
							class:active={isSelected}
							onclick={(e) => handleWhiteboardToggle(wb.id, e)}
							title={isSelected ? 'Remove from context' : 'Add to context'}
						>
							{#if isSelected}
								<Icon src={LuCheck} size="9" />
							{/if}
						</button>
						<div class="item-info">
							{#if editingWhiteboardId === wb.id}
								<input
									type="text"
									class="title-input"
									bind:value={editingWhiteboardTitle}
									bind:this={whiteboardInputRef}
									onkeydown={handleWhiteboardKeydown}
									onblur={saveWhiteboardEdit}
									onclick={(e) => e.stopPropagation()}
								/>
							{:else}
								<button class="title-btn" onclick={(e) => startWhiteboardEdit(wb, e)}>
									<span class="item-title">{wb.title}</span>
								</button>
							{/if}
							<span class="item-date">{formatDate(wb.updated_at)}</span>
						</div>
						<button
							class="star-btn"
							class:active={wb.is_starred}
							onclick={(e) => handleWhiteboardStar(wb, e)}
							title={wb.is_starred ? 'Remove bookmark' : 'Bookmark'}
						>
							<Icon src={LuStar} size="11" />
						</button>
						{#if onWhiteboardDelete}
							<button
								class="delete-btn"
								onclick={(e) => onWhiteboardDelete(wb.id, e)}
								title="Delete"
							>
								<Icon src={LuTrash2} size="11" />
							</button>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Designer Canvases Column -->
	<div class="column">
		<div class="column-header">Designer Canvases</div>
		{#if designerCanvases.length === 0}
			<div class="column-empty">No canvases</div>
		{:else}
			{#if onDesignerCanvasClear && hasDesignerCanvasSelection}
				<button class="clear-btn" onclick={onDesignerCanvasClear}>Clear</button>
			{/if}
			<div class="column-items">
				{#each designerCanvases as canvas (canvas.id)}
					{@const isSelected = selectedDesignerCanvasIds.includes(canvas.id)}
					<div class="item" class:active={isSelected}>
						<button
							class="toggle-btn"
							class:active={isSelected}
							onclick={(e) => handleDesignerCanvasToggle(canvas.id, e)}
							title={isSelected ? 'Remove from context' : 'Add to context'}
						>
							{#if isSelected}
								<Icon src={LuCheck} size="9" />
							{/if}
						</button>
						<div class="item-info">
							{#if editingDesignerCanvasId === canvas.id}
								<input
									type="text"
									class="title-input"
									bind:value={editingDesignerCanvasTitle}
									bind:this={designerCanvasInputRef}
									onkeydown={handleDesignerCanvasKeydown}
									onblur={saveDesignerCanvasEdit}
									onclick={(e) => e.stopPropagation()}
								/>
							{:else}
								<button class="title-btn" onclick={(e) => startDesignerCanvasEdit(canvas, e)}>
									<span class="item-title">{canvas.title}</span>
								</button>
							{/if}
							<span class="item-date">{formatDate(canvas.updated_at)}</span>
						</div>
						<button
							class="star-btn"
							class:active={canvas.is_starred}
							onclick={(e) => handleDesignerCanvasStar(canvas, e)}
							title={canvas.is_starred ? 'Remove bookmark' : 'Bookmark'}
						>
							<Icon src={LuStar} size="11" />
						</button>
						{#if onDesignerCanvasDelete}
							<button
								class="delete-btn"
								onclick={(e) => onDesignerCanvasDelete(canvas.id, e)}
								title="Delete"
							>
								<Icon src={LuTrash2} size="11" />
							</button>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
	</div>
</div>

<style>
	.library-backdrop {
		position: fixed;
		inset: 0;
		z-index: 99998;
		background: transparent;
		border: none;
		cursor: default;
	}

	.unified-library-dropdown {
		position: fixed;
		bottom: 80px;
		left: 72px;
		width: min(1100px, calc(100vw - 144px));
		max-height: 400px;
		display: flex;
		flex-direction: column;
		background: hsl(var(--background));
		border: 1px solid hsl(var(--border));
		border-radius: 6px;
		z-index: 99999;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	.dropdown-header {
		border-bottom: 1px solid hsl(var(--border) / 0.5);
		flex-shrink: 0;
	}

	.clear-all-btn {
		width: 100%;
		padding: 4px 12px;
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		font-size: 0.8em;
		cursor: pointer;
		text-align: left;
		transition: all 0.15s;
	}

	.clear-all-btn:hover {
		background: hsl(var(--accent) / 0.3);
		color: hsl(var(--foreground));
	}

	.columns-container {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		flex: 1;
		min-height: 0;
	}

	.column {
		display: flex;
		flex-direction: column;
		border-right: 1px solid hsl(var(--border) / 0.5);
		min-height: 0;
	}

	.column:last-child {
		border-right: none;
	}

	.column-header {
		padding: 8px 12px;
		font-size: 0.75em;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: hsl(var(--muted-foreground));
		border-bottom: 1px solid hsl(var(--border) / 0.5);
		flex-shrink: 0;
	}

	.column-empty {
		padding: 12px;
		text-align: center;
		color: hsl(var(--muted-foreground));
		font-size: 0.9em;
		opacity: 0.6;
	}

	.column-items {
		overflow-y: auto;
		flex: 1;
	}

	.clear-btn {
		width: 100%;
		padding: 4px 12px;
		background: transparent;
		border: none;
		border-bottom: 1px solid hsl(var(--border) / 0.3);
		color: hsl(var(--muted-foreground));
		font-size: 0.8em;
		cursor: pointer;
		text-align: left;
		transition: all 0.15s;
		flex-shrink: 0;
	}

	.clear-btn:hover {
		background: hsl(var(--accent) / 0.3);
		color: hsl(var(--foreground));
	}

	.item {
		display: flex;
		align-items: center;
		gap: 4px;
		padding-right: 6px;
		border-left: 2px solid transparent;
		transition: all 0.15s ease;
		border-bottom: 1px solid hsl(var(--border) / 0.2);
		cursor: pointer;
	}

	.item:last-child {
		border-bottom: none;
	}

	.item:hover {
		background: hsl(var(--accent) / 0.5);
		border-left-color: var(--boss-accent);
	}

	.item.active {
		background: hsl(var(--accent) / 0.7);
		border-left-color: var(--boss-accent);
	}

	.toggle-btn {
		width: 12px;
		height: 12px;
		margin-left: 6px;
		border-radius: 2px;
		border: 1px solid hsl(var(--border));
		background: transparent;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		color: hsl(var(--foreground));
		opacity: 0.7;
		transition: all 0.15s;
		flex-shrink: 0;
	}

	.toggle-btn:hover {
		opacity: 1;
	}

	.toggle-btn.active {
		background: var(--boss-accent);
		border-color: var(--boss-accent);
		color: black;
		opacity: 1;
	}

	.toggle-spacer {
		width: 12px;
		height: 12px;
		margin-left: 6px;
		flex-shrink: 0;
	}

	.item-info {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 5px 4px 5px 0;
	}

	.title-btn {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		padding: 0;
		cursor: text;
		text-align: left;
	}

	.item-title {
		font-size: 0.9em;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: block;
	}

	.title-input {
		flex: 1;
		min-width: 0;
		font-size: 0.9em;
		color: hsl(var(--foreground));
		background: hsl(var(--input));
		border: 1px solid var(--boss-accent);
		border-radius: 3px;
		padding: 1px 4px;
		outline: none;
	}

	.item-date {
		font-size: 0.8em;
		color: hsl(var(--muted-foreground));
		flex-shrink: 0;
		min-width: 45px;
		text-align: right;
		opacity: 0.7;
	}

	.star-btn {
		flex-shrink: 0;
		width: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s ease;
		opacity: 0.4;
	}

	.star-btn:hover {
		opacity: 1;
		color: var(--boss-accent);
	}

	.star-btn.active {
		opacity: 1;
		color: var(--boss-accent);
	}

	.star-btn.active :global(svg) {
		fill: var(--boss-accent);
	}

	.watch-btn {
		flex-shrink: 0;
		width: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s ease;
		opacity: 0.4;
	}

	.watch-btn:hover {
		opacity: 1;
		color: var(--boss-accent);
	}

	.watch-btn.active {
		opacity: 1;
		color: var(--boss-accent);
	}

	.watch-btn.active :global(svg) {
		fill: var(--boss-accent);
	}

	.watch-spacer {
		flex-shrink: 0;
		width: 20px;
	}

	.refresh-btn {
		flex-shrink: 0;
		width: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s ease;
		opacity: 0.4;
	}

	.refresh-btn:hover {
		opacity: 1;
		color: var(--boss-accent);
	}

	.refresh-btn.refreshing {
		opacity: 1;
		color: var(--boss-accent);
		animation: spin 1s linear infinite;
	}

	.refresh-btn:disabled {
		cursor: wait;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.refresh-spacer {
		flex-shrink: 0;
		width: 20px;
	}

	.delete-btn {
		flex-shrink: 0;
		width: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s ease;
		opacity: 0.4;
	}

	.delete-btn:hover {
		background: rgba(239, 68, 68, 0.1);
		color: rgb(239, 68, 68);
	}
</style>
