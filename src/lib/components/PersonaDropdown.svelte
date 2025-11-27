<script lang="ts">
	import { Icon } from 'svelte-icons-pack';
	import { LuChevronDown } from 'svelte-icons-pack/lu';

	interface Props {
		/** Currently selected persona name */
		selectedPersona: string;
		/** Whether the dropdown is interactive (clickable) */
		interactive?: boolean;
		/** Click handler for when dropdown is clicked */
		onClick?: () => void;
	}

	let {
		selectedPersona,
		interactive = true,
		onClick
	}: Props = $props();

	// Capitalize persona name for display
	const displayName = $derived(selectedPersona.charAt(0).toUpperCase() + selectedPersona.slice(1));
</script>

<div
	class="persona-dropdown"
	class:interactive
	onclick={interactive ? onClick : undefined}
	role={interactive ? 'button' : undefined}
	tabindex={interactive ? 0 : undefined}
>
	<span class="persona-name">{displayName}</span>
	{#if interactive}
		<Icon src={LuChevronDown} size="11" />
	{/if}
</div>

<style>
	.persona-dropdown {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-left: 4px;
		opacity: 0.7;
		transition: opacity 0.2s;
		padding: 4px;
		flex-shrink: 0;
	}

	.persona-dropdown.interactive {
		cursor: pointer;
	}

	.persona-dropdown.interactive:hover {
		opacity: 1;
	}

	.persona-name {
		font-size: 1em;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 80px;
	}
</style>
