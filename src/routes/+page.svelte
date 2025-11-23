<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	onMount(() => {
		// Redirect to chat (or last used mode from localStorage)
		const lastMode = typeof window !== 'undefined'
			? localStorage.getItem('asura_app_mode') || 'chat'
			: 'chat';
		goto(`/${lastMode}`, { replaceState: true });
	});
</script>

<div style="display: flex; align-items: center; justify-content: center; height: 100vh;">
	<p>Loading...</p>
</div>
