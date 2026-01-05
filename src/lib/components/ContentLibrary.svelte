<script lang="ts">
	/**
	 * ContentLibrary - Dropdown for managing pasted files/articles
	 *
	 * Unified content library:
	 * - Checkbox toggle for context injection (multi-select)
	 * - Files can be enabled/disabled independently
	 * - Canon files are always injected (no toggle)
	 */
	import { tick } from 'svelte';
	import { Icon } from 'svelte-icons-pack';
	import { LuTrash2, LuCheck } from 'svelte-icons-pack/lu';

	interface ContentItem {
		id: string;
		title: string;
		is_enabled?: boolean;
		tier?: string;
		created_at: string;
	}

	interface Props {
		items: ContentItem[];
		onToggle?: (itemId: string, currentState: boolean) => void;
		onRename?: (itemId: string, newTitle: string) => void;
		onDelete: (itemId: string, event: MouseEvent) => void;
		onClear?: () => void;
	}

	let { items, onToggle, onRename, onDelete, onClear }: Props = $props();

	// Check if there's anything to clear (any enabled items)
	const hasSelection = $derived(items.some(item => item.is_enabled));

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
		if (onToggle) {
			onToggle(item.id, item.is_enabled ?? false);
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
</script>

<div class="content-library-dropdown">
	{#if items.length === 0}
		<div class="dropdown-empty">No files yet</div>
	{:else}
		{#if onClear && hasSelection}
			<button class="clear-btn" onclick={onClear}>
				Clear selection
			</button>
		{/if}
		{#each items as item}
			<div
				class="content-item"
				class:active={item.is_enabled}
			>
				{#if item.tier === 'canon'}
					<!-- Canon: no toggle, always injected -->
					<span class="canon-spacer"></span>
				{:else}
					<!-- Checkbox for context injection toggle -->
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
		padding: 12px 12px;
		text-align: center;
		color: hsl(var(--muted-foreground));
		font-size: 1em;
	}

	.clear-btn {
		width: 100%;
		padding: 6px 12px;
		background: transparent;
		border: none;
		border-bottom: 1px solid hsl(var(--border));
		color: hsl(var(--muted-foreground));
		font-size: 0.85em;
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
		gap: 6px;
		border-left: 3px solid transparent;
		transition: all 0.2s ease;
		border-bottom: 1px solid hsl(var(--border) / 0.3);
	}

	.content-item:last-child {
		border-bottom: none;
	}

	.content-item:hover {
		background: hsl(var(--accent) / 0.5);
		border-left-color: var(--boss-accent);
	}

	.content-item.active {
		background: hsl(var(--accent) / 0.7);
		border-left-color: var(--boss-accent);
	}

	.toggle-btn {
		width: 13px;
		height: 13px;
		margin-left: 8px;
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

	/* Spacer for canon items (no toggle) */
	.canon-spacer {
		width: 13px;
		height: 13px;
		margin-left: 8px;
		flex-shrink: 0;
	}

	.content-info {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 0;
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
		border: 1px solid var(--boss-accent);
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
		width: 28px;
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
</style>
