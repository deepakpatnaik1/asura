<script lang="ts">
	/**
	 * UnifiedLibrary - Two-column dropdown for all selectable content
	 *
	 * Columns:
	 * 1. Files - pasted articles/content
	 * 2. Whiteboards - Gunnar's scratch pads
	 *
	 * All selections go into AI context for next message turn.
	 */
	import { tick } from 'svelte';
	import { Icon } from 'svelte-icons-pack';
	import { LuTrash2, LuCheck } from 'svelte-icons-pack/lu';

	// Types
	interface ContentItem {
		id: string;
		title: string;
		is_enabled?: boolean;
		is_canon?: boolean;
		created_at: string;
	}

	interface Whiteboard {
		id: string;
		title: string;
		state?: unknown;
		created_at: string;
		updated_at: string;
	}

	interface Props {
		// Files
		files: ContentItem[];
		onFileToggle?: (id: string, currentState: boolean) => void;
		onFileRename?: (id: string, newTitle: string) => void;
		onFileDelete: (id: string, event: MouseEvent) => void;
		onFileClear?: () => void;
		isDeletingFile?: boolean;

		// Whiteboards
		whiteboards: Whiteboard[];
		selectedWhiteboardIds: string[];
		onWhiteboardToggle: (id: string) => void;
		onWhiteboardOpen: (id: string) => void;
		onWhiteboardDelete?: (id: string, event: MouseEvent) => void;
		onWhiteboardClear?: () => void;
		isDeletingWhiteboard?: boolean;
	}

	let {
		files,
		onFileToggle,
		onFileRename,
		onFileDelete,
		onFileClear,
		isDeletingFile = false,

		whiteboards,
		selectedWhiteboardIds,
		onWhiteboardToggle,
		onWhiteboardOpen,
		onWhiteboardDelete,
		onWhiteboardClear,
		isDeletingWhiteboard = false
	}: Props = $props();

	// Derived state
	const hasFileSelection = $derived(files.some((f) => f.is_enabled));
	const hasWhiteboardSelection = $derived(selectedWhiteboardIds.length > 0);
	const hasAnySelection = $derived(hasFileSelection || hasWhiteboardSelection);

	// Clear all selections
	function clearAllSelections() {
		if (onFileClear) onFileClear();
		if (onWhiteboardClear) onWhiteboardClear();
	}

	// File editing state
	let editingFileId = $state<string | null>(null);
	let editingFileTitle = $state('');
	let fileInputRef = $state<HTMLInputElement | null>(null);

	function formatDate(dateString: string) {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric'
		});
	}

	// File handlers
	function handleFileToggle(item: ContentItem, event: MouseEvent) {
		event.stopPropagation();
		if (onFileToggle) {
			onFileToggle(item.id, item.is_enabled ?? false);
		}
	}

	async function startFileEdit(item: ContentItem, event: MouseEvent) {
		event.stopPropagation();
		editingFileId = item.id;
		editingFileTitle = item.title;
		await tick();
		fileInputRef?.focus();
		fileInputRef?.select();
	}

	function handleFileKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			saveFileEdit();
		} else if (event.key === 'Escape') {
			cancelFileEdit();
		}
	}

	function saveFileEdit() {
		if (editingFileId && editingFileTitle.trim() && onFileRename) {
			onFileRename(editingFileId, editingFileTitle.trim());
		}
		editingFileId = null;
		editingFileTitle = '';
	}

	function cancelFileEdit() {
		editingFileId = null;
		editingFileTitle = '';
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
</script>

<div class="unified-library-dropdown">
	{#if hasAnySelection}
		<div class="dropdown-header">
			<button class="clear-all-btn" onclick={clearAllSelections}>Clear all</button>
		</div>
	{/if}
	<div class="columns-container">
		<!-- Files Column -->
		<div class="column">
		<div class="column-header">Articles</div>
		{#if files.length === 0}
			<div class="column-empty">No files</div>
		{:else}
			{#if onFileClear && hasFileSelection}
				<button class="clear-btn" onclick={onFileClear}>Clear</button>
			{/if}
			<div class="column-items">
				{#each files as item (item.id)}
					<div class="item" class:active={item.is_enabled}>
						{#if item.is_canon}
							<span class="toggle-spacer"></span>
						{:else}
							<button
								class="toggle-btn"
								class:active={item.is_enabled}
								onclick={(e) => handleFileToggle(item, e)}
								title={item.is_enabled ? 'Remove from context' : 'Add to context'}
							>
								{#if item.is_enabled}
									<Icon src={LuCheck} size="9" />
								{/if}
							</button>
						{/if}
						<div class="item-info">
							{#if editingFileId === item.id}
								<input
									type="text"
									class="title-input"
									bind:value={editingFileTitle}
									bind:this={fileInputRef}
									onkeydown={handleFileKeydown}
									onblur={saveFileEdit}
									onclick={(e) => e.stopPropagation()}
								/>
							{:else}
								<button class="title-btn" onclick={(e) => startFileEdit(item, e)}>
									<span class="item-title">{item.title}</span>
								</button>
							{/if}
							<span class="item-date">{formatDate(item.created_at)}</span>
						</div>
						<button
							class="delete-btn"
							onclick={(e) => onFileDelete(item.id, e)}
							title="Delete"
							disabled={isDeletingFile}
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
							<button
								class="title-btn openable"
								onclick={(e) => handleWhiteboardOpen(wb.id, e)}
								title="Open whiteboard"
							>
								<span class="item-title">{wb.title}</span>
							</button>
							<span class="item-date">{formatDate(wb.updated_at)}</span>
						</div>
						{#if onWhiteboardDelete}
							<button
								class="delete-btn"
								onclick={(e) => onWhiteboardDelete(wb.id, e)}
								title="Delete"
								disabled={isDeletingWhiteboard}
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
	.unified-library-dropdown {
		position: fixed;
		bottom: 80px;
		left: 72px;
		width: min(900px, calc(100vw - 144px));
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
		grid-template-columns: repeat(2, minmax(0, 1fr));
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
		border-left: 2px solid transparent;
		transition: all 0.15s ease;
		border-bottom: 1px solid hsl(var(--border) / 0.2);
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
		opacity: 0.4;
		transition: all 0.15s;
		flex-shrink: 0;
	}

	.toggle-btn:hover {
		opacity: 0.8;
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
		gap: 4px;
		padding: 5px 0;
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

	.title-btn.openable {
		cursor: pointer;
	}

	.title-btn.openable:hover .item-title {
		text-decoration: underline;
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
		opacity: 0.7;
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
		opacity: 0;
	}

	.item:hover .delete-btn {
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
</style>
