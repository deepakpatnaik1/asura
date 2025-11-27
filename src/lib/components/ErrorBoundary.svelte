<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		/** Mode for accent color styling */
		mode?: 'chat' | 'reader';
		/** Content to render */
		children: import('svelte').Snippet;
		/** Optional fallback to render on error */
		fallback?: import('svelte').Snippet<[Error | null, () => void]>;
	}

	let { mode = 'chat', children, fallback }: Props = $props();

	let hasError = $state(false);
	let error = $state<Error | null>(null);

	function reset() {
		hasError = false;
		error = null;
	}

	onMount(() => {
		const handleError = (event: ErrorEvent) => {
			hasError = true;
			error = event.error instanceof Error ? event.error : new Error(String(event.error));
			event.preventDefault();
		};

		const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
			hasError = true;
			error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
			event.preventDefault();
		};

		window.addEventListener('error', handleError);
		window.addEventListener('unhandledrejection', handleUnhandledRejection);

		return () => {
			window.removeEventListener('error', handleError);
			window.removeEventListener('unhandledrejection', handleUnhandledRejection);
		};
	});
</script>

{#if hasError}
	{#if fallback}
		{@render fallback(error, reset)}
	{:else}
		<div class="error-boundary" class:chat={mode === 'chat'} class:reader={mode === 'reader'}>
			<div class="error-icon">⚠</div>
			<h3 class="error-title">Something went wrong</h3>
			<p class="error-message">{error?.message || 'An unexpected error occurred'}</p>
			<button class="retry-btn" class:chat={mode === 'chat'} class:reader={mode === 'reader'} onclick={reset}>
				Try Again
			</button>
		</div>
	{/if}
{:else}
	{@render children()}
{/if}

<style>
	.error-boundary {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 48px 24px;
		text-align: center;
		min-height: 200px;
	}

	.error-icon {
		font-size: 48px;
		margin-bottom: 16px;
		opacity: 0.6;
	}

	.error-title {
		font-family: "iA Writer Quattro V", system-ui, -apple-system, sans-serif;
		font-size: 14pt;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0 0 8px 0;
	}

	.error-message {
		font-family: "iA Writer Quattro V", system-ui, -apple-system, sans-serif;
		font-size: 9pt;
		color: hsl(var(--muted-foreground));
		margin: 0 0 24px 0;
		max-width: 400px;
	}

	.retry-btn {
		background: transparent;
		border: 1px solid;
		border-radius: 6px;
		padding: 12px 24px;
		font-family: "iA Writer Quattro V", system-ui, -apple-system, sans-serif;
		font-size: 9pt;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.retry-btn.chat {
		color: var(--boss-accent);
		border-color: var(--boss-accent);
	}

	.retry-btn.chat:hover {
		background: var(--boss-accent);
		color: hsl(var(--background));
	}

	.retry-btn.reader {
		color: var(--reader-accent);
		border-color: var(--reader-accent);
	}

	.retry-btn.reader:hover {
		background: var(--reader-accent);
		color: hsl(var(--background));
	}
</style>
