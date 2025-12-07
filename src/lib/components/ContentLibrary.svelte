<script lang="ts">
	/**
	 * ContentLibrary - Unified dropdown for files (chat) and articles (reader)
	 *
	 * Chat mode:
	 * - Checkbox toggle for context injection (multi-select)
	 * - Files can be enabled/disabled independently
	 *
	 * Reader mode:
	 * - Radio button behavior (single select)
	 * - Clicking row selects that article as active content
	 * - Only one article can be active at a time
	 */
	import { tick } from 'svelte';
	import { Icon } from 'svelte-icons-pack';
	import { LuTrash2, LuCheck, LuCircle } from 'svelte-icons-pack/lu';
	import type { Mode } from '$lib/config/modes';

	interface ContentItem {
		id: string;
		title: string;
		is_enabled?: boolean;
		is_canon?: boolean;
		created_at: string;
	}

	interface Props {
		mode: Mode;
		items: ContentItem[];
		currentItemId: string | null;
		isDeleting: boolean;
		onToggle?: (itemId: string, currentState: boolean) => void;
		onSelect?: (itemId: string) => void;
		onRename?: (itemId: string, newTitle: string) => void;
		onDelete: (itemId: string, event: MouseEvent) => void;
		onClear?: () => void;
	}

	let { mode, items, currentItemId, isDeleting, onToggle, onSelect, onRename, onDelete, onClear }: Props = $props();

	// Check if there's anything to clear (reactive)
	const hasSelection = $derived(
		mode === 'reader'
			? currentItemId !== null
			: items.some(item => item.is_enabled)
	);

	const accentVar = mode === 'chat' ? 'var(--boss-accent)' : 'var(--reader-accent)';
	const emptyText = mode === 'chat' ? 'No files yet' : 'No articles yet';

	// Check if item is selected (different logic per mode)
	function isItemActive(item: ContentItem): boolean {
		if (mode === 'reader') {
			return item.id === currentItemId;
		}
		return item.is_enabled ?? false;
	}

	// Editing state
	let editingId = $state<string | null>(null);
	let editingTitle = $state('');
	let inputRef: HTMLInputElement | null = null;

	function formatDate(dateString: string) {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric'
		});
	}

	function handleToggleClick(item: ContentItem, event: MouseEvent) {
		event.stopPropagation();
		if (mode === 'reader') {
			// Reader mode: radio behavior - select this item
			if (onSelect) {
				onSelect(item.id);
			}
		} else {
			// Chat mode: checkbox behavior - toggle enabled state
			if (onToggle) {
				onToggle(item.id, item.is_enabled ?? false);
			}
		}
	}

	async function startEditing(item: ContentItem, event: MouseEvent) {
		event.stopPropagation();
		editingId = item.id;
		editingTitle = item.title;
		await tick();
		inputRef?.focus();
		inputRef?.select();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			saveEdit();
		} else if (event.key === 'Escape') {
			cancelEdit();
		}
	}

	function saveEdit() {
		if (editingId && editingTitle.trim() && onRename) {
			onRename(editingId, editingTitle.trim());
		}
		editingId = null;
		editingTitle = '';
	}

	function cancelEdit() {
		editingId = null;
		editingTitle = '';
	}

	function handleRowClick(item: ContentItem) {
		// In reader mode, clicking the row (outside title) selects the article
		if (mode === 'reader' && onSelect) {
			onSelect(item.id);
		}
	}
</script>

<div class="content-library-dropdown" style="--accent: {accentVar}">
	{#if items.length === 0}
		<div class="dropdown-empty">{emptyText}</div>
	{:else}
		{#if onClear && hasSelection}
			<button class="clear-btn" onclick={onClear}>
				Clear selection
			</button>
		{/if}
		{#each items as item}
			<div
				class="content-item"
				class:active={isItemActive(item)}
				onclick={() => handleRowClick(item)}
			>
				{#if item.is_canon}
					<!-- Canon: no toggle, always injected -->
					<span class="canon-spacer"></span>
				{:else if mode === 'reader'}
					<!-- Reader mode: Radio button (single select) -->
					<button
						class="radio-btn"
						class:active={item.id === currentItemId}
						onclick={(e) => handleToggleClick(item, e)}
						title="Select this article"
					>
						<span class="radio-dot"></span>
					</button>
				{:else}
					<!-- Chat mode: Checkbox (multi-select toggle) -->
					<button
						class="toggle-btn"
						class:active={item.is_enabled}
						onclick={(e) => handleToggleClick(item, e)}
						title={item.is_enabled ? 'Disable context injection' : 'Enable context injection'}
					>
						{#if item.is_enabled}
							<Icon src={LuCheck} size="9" />
						{/if}
					</button>
				{/if}
				<div class="content-info">
					{#if editingId === item.id}
						<input
							type="text"
							class="title-input"
							bind:value={editingTitle}
							bind:this={inputRef}
							onkeydown={handleKeydown}
							onblur={saveEdit}
							onclick={(e) => e.stopPropagation()}
						/>
					{:else}
						<button class="title-btn" onclick={(e) => startEditing(item, e)}>
							<span class="content-title">{item.title}</span>
						</button>
					{/if}
					<span class="content-date">{formatDate(item.created_at)}</span>
				</div>
				<button
					class="delete-btn"
					onclick={(e) => onDelete(item.id, e)}
					title="Delete"
					disabled={isDeleting}
				>
					<Icon src={LuTrash2} size="11" />
				</button>
			</div>
		{/each}
	{/if}
</div>

<style>
	.content-library-dropdown {
		position: fixed;
		bottom: 80px;
		left: 100px;
		width: 320px;
		max-height: 450px;
		overflow-y: auto;
		background: hsl(var(--background));
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

	.clear-btn {
		width: 100%;
		padding: 10px 16px;
		background: transparent;
		border: none;
		border-bottom: 1px solid hsl(var(--border));
		color: hsl(var(--muted-foreground));
		font-size: 0.9em;
		cursor: pointer;
		text-align: left;
		transition: all 0.15s;
	}

	.clear-btn:hover {
		background: hsl(var(--accent) / 0.3);
		color: hsl(var(--foreground));
	}

	.content-item {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		border-left: 3px solid transparent;
		transition: all 0.2s ease;
		border-bottom: 1px solid hsl(var(--border) / 0.3);
	}

	.content-item:last-child {
		border-bottom: none;
	}

	.content-item:hover {
		background: hsl(var(--accent) / 0.5);
		border-left-color: var(--accent);
	}

	.content-item.active {
		background: hsl(var(--accent) / 0.7);
		border-left-color: var(--accent);
	}

	.content-item.clickable {
		cursor: pointer;
	}

	.toggle-btn {
		width: 13px;
		height: 13px;
		margin-left: 12px;
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
		background: var(--accent);
		border-color: var(--accent);
		color: black;
		opacity: 1;
	}

	/* Radio button for reader mode (single select) */
	.radio-btn {
		width: 13px;
		height: 13px;
		margin-left: 12px;
		border-radius: 50%;
		border: 1px solid hsl(var(--border));
		background: transparent;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0.4;
		transition: all 0.15s;
		flex-shrink: 0;
		padding: 0;
	}

	.radio-btn:hover {
		opacity: 0.8;
		border-color: var(--accent);
	}

	.radio-btn .radio-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: transparent;
		transition: background 0.15s;
	}

	.radio-btn.active {
		border-color: var(--accent);
		opacity: 1;
	}

	.radio-btn.active .radio-dot {
		background: var(--accent);
	}

	/* Spacer for canon items (no toggle) */
	.canon-spacer {
		width: 13px;
		height: 13px;
		margin-left: 12px;
		flex-shrink: 0;
	}

	.content-info {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 0;
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

	.content-title {
		font-size: 1em;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: block;
	}

	.title-input {
		flex: 1;
		min-width: 0;
		font-size: 1em;
		color: hsl(var(--foreground));
		background: hsl(var(--input));
		border: 1px solid var(--accent);
		border-radius: 3px;
		padding: 2px 6px;
		outline: none;
	}

	.content-date {
		font-size: 1em;
		color: hsl(var(--muted-foreground));
		flex-shrink: 0;
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

	.content-item:hover .delete-btn {
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
