<script lang="ts">
	/**
	 * BoardLibrary - Dropdown for managing whiteboards
	 *
	 * Similar to ContentLibrary:
	 * - Checkbox toggle for context injection (multi-select)
	 * - Whiteboards can be enabled/disabled independently
	 * - Click title to view/edit whiteboard
	 */
	import { Icon } from 'svelte-icons-pack';
	import { LuTrash2, LuCheck } from 'svelte-icons-pack/lu';

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

	interface Props {
		whiteboards: Whiteboard[];
		selectedIds: string[];
		isDeleting?: boolean;
		onToggle: (id: string) => void;
		onOpen: (id: string) => void;
		onDelete?: (id: string, event: MouseEvent) => void;
		onClear?: () => void;
	}

	let { whiteboards, selectedIds, isDeleting = false, onToggle, onOpen, onDelete, onClear }: Props = $props();

	// Check if there's anything to clear
	const hasSelection = $derived(selectedIds.length > 0);

	function formatDate(dateString: string) {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric'
		});
	}

	function handleToggleClick(id: string, event: MouseEvent) {
		event.stopPropagation();
		onToggle(id);
	}

	function handleOpenClick(id: string, event: MouseEvent) {
		event.stopPropagation();
		onOpen(id);
	}
</script>

<div class="board-library-dropdown">
	{#if whiteboards.length === 0}
		<div class="dropdown-empty">No whiteboards yet</div>
	{:else}
		{#if onClear && hasSelection}
			<button class="clear-btn" onclick={onClear}>
				Clear selection
			</button>
		{/if}
		{#each whiteboards as wb (wb.id)}
			{@const isSelected = selectedIds.includes(wb.id)}
			<div
				class="board-item"
				class:active={isSelected}
			>
				<!-- Checkbox for context injection toggle -->
				<button
					class="toggle-btn"
					class:active={isSelected}
					onclick={(e) => handleToggleClick(wb.id, e)}
					title={isSelected ? 'Remove from context' : 'Add to context'}
				>
					{#if isSelected}
						<Icon src={LuCheck} size="9" />
					{/if}
				</button>
				<div class="board-info">
					<button class="title-btn" onclick={(e) => handleOpenClick(wb.id, e)} title="Open whiteboard">
						<span class="board-title">{wb.title}</span>
					</button>
					<span class="board-date">{formatDate(wb.updated_at)}</span>
				</div>
				{#if onDelete}
					<button
						class="delete-btn"
						onclick={(e) => onDelete(wb.id, e)}
						title="Delete"
						disabled={isDeleting}
					>
						<Icon src={LuTrash2} size="11" />
					</button>
				{/if}
			</div>
		{/each}
	{/if}
</div>

<style>
	.board-library-dropdown {
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

	.board-item {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 6px;
		border-left: 3px solid transparent;
		transition: all 0.2s ease;
		border-bottom: 1px solid hsl(var(--border) / 0.3);
	}

	.board-item:last-child {
		border-bottom: none;
	}

	.board-item:hover {
		background: hsl(var(--accent) / 0.5);
		border-left-color: var(--boss-accent);
	}

	.board-item.active {
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

	.board-info {
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
		cursor: pointer;
		text-align: left;
	}

	.title-btn:hover .board-title {
		text-decoration: underline;
	}

	.board-title {
		font-size: 1em;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: block;
	}

	.board-date {
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

	.board-item:hover .delete-btn {
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
