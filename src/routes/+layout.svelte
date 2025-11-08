<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	// Preload icon library to prevent FOUC
	import { Icon } from 'svelte-icons-pack';
	import { LuStar } from 'svelte-icons-pack/lu';

	let { children } = $props();

	// Force icon library initialization on mount
	onMount(() => {
		// This ensures the icon library is ready before rendering
	});
</script>

{@render children()}
