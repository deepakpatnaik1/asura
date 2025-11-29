<script lang="ts">
	/**
	 * FileLibrary - Dropdown showing user's saved files
	 *
	 * Allows toggling files for context injection and deleting files.
	 */
	import { Icon } from 'svelte-icons-pack';
	import { LuTrash2, LuCheck } from 'svelte-icons-pack/lu';

	interface FileItem {
		id: string;
		title: string;
		is_enabled: boolean;
		created_at: string;
	}

	interface Props {
		files: FileItem[];
		currentFileId: string | null;
		isDeleting: boolean;
		onToggle: (fileId: string, currentState: boolean) => void;
		onDelete: (fileId: string, event: MouseEvent) => void;
	}

	let { files, currentFileId, isDeleting, onToggle, onDelete }: Props = $props();

	function formatDate(dateString: string) {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<div class="file-library-dropdown">
	{#if files.length === 0}
		<div class="dropdown-empty">No files yet</div>
	{:else}
		{#each files as file}
			<div
				class="file-item"
				class:active={file.is_enabled}
			>
				<button
					class="toggle-btn"
					class:active={file.is_enabled}
					onclick={() => onToggle(file.id, file.is_enabled)}
					title={file.is_enabled ? 'Disable context injection' : 'Enable context injection'}
				>
					{#if file.is_enabled}
						<Icon src={LuCheck} size="11" />
					{/if}
				</button>
				<div class="file-content">
					<span class="file-title">{file.title}</span>
					<span class="file-date">{formatDate(file.created_at)}</span>
				</div>
				<button
					class="delete-btn"
					onclick={(e) => onDelete(file.id, e)}
					title="Delete file"
					disabled={isDeleting}
				>
					<Icon src={LuTrash2} size="11" />
				</button>
			</div>
		{/each}
	{/if}
</div>

<style>
	.file-library-dropdown {
		position: fixed;
		bottom: 80px;
		left: 100px;
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

	.file-item {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		border-left: 3px solid transparent;
		transition: all 0.2s ease;
		border-bottom: 1px solid hsl(var(--border) / 0.3);
	}

	.file-item:last-child {
		border-bottom: none;
	}

	.file-item:hover {
		background: hsl(var(--accent) / 0.5);
		border-left-color: var(--boss-accent);
	}

	.file-item.active {
		background: hsl(var(--accent) / 0.7);
		border-left-color: var(--boss-accent);
	}

	.toggle-btn {
		width: 20px;
		height: 20px;
		margin-left: 12px;
		border-radius: 4px;
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

	.file-content {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 0;
	}

	.file-title {
		flex: 1;
		font-size: 1em;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.file-date {
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

	.file-item:hover .delete-btn {
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
