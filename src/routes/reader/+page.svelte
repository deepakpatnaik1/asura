<script lang="ts">
	import { onMount } from 'svelte';

	onMount(() => {
		if (typeof window !== 'undefined') {
			localStorage.setItem('asura_app_mode', 'reader');
		}
	});
</script>

<div class="reader-container">
	<div class="placeholder">
		<p>Reader mode coming soon</p>
	</div>
</div>

<style>
	.reader-container {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100vh;
		margin-left: 60px;
		background: hsl(var(--background));
		color: hsl(var(--muted-foreground));
	}

	.placeholder {
		text-align: center;
		opacity: 0.5;
	}
</style>
