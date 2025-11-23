<script lang="ts">
	import { onMount } from 'svelte';

	// Persist mode to localStorage
	onMount(() => {
		if (typeof window !== 'undefined') {
			localStorage.setItem('asura_app_mode', 'reader');
		}
	});
</script>

<div class="reader-container">
	<div class="reader-content">
		<h1>E-Reader Mode</h1>
		<p>Coming soon... The UI shell has been backed up and will be re-implemented.</p>
		<p>See <code>E_READER_UI_SHELL_BACKUP.md</code> for details.</p>
	</div>
</div>

<style>
	.reader-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100vh;
		padding: 24px;
	}

	.reader-content {
		max-width: 600px;
		text-align: center;
	}

	h1 {
		color: var(--reader-accent);
		margin-bottom: 16px;
	}

	code {
		background: hsl(var(--card));
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 14px;
	}
</style>
