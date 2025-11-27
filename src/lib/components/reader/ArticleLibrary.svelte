<script lang="ts">
	/**
	 * ArticleLibrary - Dropdown list of saved articles
	 *
	 * Shows all user's articles with ability to switch or delete.
	 */

	import { Icon } from 'svelte-icons-pack';
	import { LuTrash2 } from 'svelte-icons-pack/lu';

	interface Article {
		id: string;
		title: string;
		preview_snippet: string;
	}

	interface Props {
		articles: Article[];
		currentArticleId: string | null;
		isDeleting: boolean;
		onSelect: (articleId: string) => void;
		onDelete: (articleId: string, event: MouseEvent) => void;
	}

	let { articles, currentArticleId, isDeleting, onSelect, onDelete }: Props = $props();
</script>

<div class="article-library-dropdown">
	{#if articles.length === 0}
		<div class="dropdown-empty">No articles yet</div>
	{:else}
		{#each articles as article}
			<div
				class="article-item"
				class:active={currentArticleId === article.id}
			>
				<button
					class="article-button"
					onclick={() => onSelect(article.id)}
				>
					<div class="article-content">
						<div class="article-title">{article.title}</div>
						<div class="article-preview">{article.preview_snippet}</div>
					</div>
				</button>
				<button
					class="delete-btn"
					onclick={(e) => onDelete(article.id, e)}
					title="Delete article"
					disabled={isDeleting}
				>
					<Icon src={LuTrash2} size="12" />
				</button>
			</div>
		{/each}
	{/if}
</div>

<style>
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
</style>
