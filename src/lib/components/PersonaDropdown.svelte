<script lang="ts">
	import { Icon } from 'svelte-icons-pack';
	import { LuChevronDown } from 'svelte-icons-pack/lu';
	import { getPersonaAccentColor } from '$lib/config/colors';
	import { PERSONA_NAMES, PERSONAS } from '$lib/config/personas';

	interface Props {
		/** Currently selected persona name */
		selectedPersona: string;
		/** Whether the dropdown is interactive (clickable) */
		interactive?: boolean;
		/** Callback when persona is selected */
		onSelect?: (persona: string) => void;
	}

	let {
		selectedPersona,
		interactive = true,
		onSelect
	}: Props = $props();

	let isOpen = $state(false);

	// Get display name from persona config
	const displayName = $derived(
		PERSONAS[selectedPersona]?.displayName || selectedPersona
	);

	// Get accent color for selected persona
	const accentColor = $derived(getPersonaAccentColor(selectedPersona));

	function handleToggle(event: Event) {
		if (interactive) {
			event.stopPropagation();
			isOpen = !isOpen;
		}
	}

	function handleSelect(persona: string) {
		isOpen = false;
		onSelect?.(persona);
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.persona-dropdown-container')) {
			isOpen = false;
		}
	}
</script>

<svelte:document onclick={handleClickOutside} onkeydown={(e) => e.key === 'Escape' && isOpen && (isOpen = false)} />

<div class="persona-dropdown-container">
	<div
		class="persona-dropdown"
		class:interactive
		class:open={isOpen}
		onclick={handleToggle}
		onkeydown={(e) => e.key === 'Enter' && handleToggle(e)}
		role={interactive ? 'button' : undefined}
		tabindex={interactive ? 0 : undefined}
		style="--selected-accent: {accentColor}"
	>
		<span class="persona-name">{displayName}</span>
		{#if interactive}
			<Icon src={LuChevronDown} size="11" />
		{/if}
	</div>

	{#if isOpen && interactive}
		<div class="dropdown-menu">
			{#each PERSONA_NAMES as personaName}
				{@const persona = PERSONAS[personaName]}
				{@const isSelected = personaName === selectedPersona}
				<button
					class="dropdown-item"
					class:selected={isSelected}
					onclick={() => handleSelect(personaName)}
					style="--item-accent: {persona.accentColor}"
				>
					<span class="color-dot" style="background: {persona.accentColor}"></span>
					{persona.displayName}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.persona-dropdown-container {
		position: relative;
	}

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
		outline: none;
	}

	.persona-dropdown.interactive:hover,
	.persona-dropdown.open {
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

	.dropdown-menu {
		position: absolute;
		bottom: 100%;
		left: 0;
		margin-bottom: 4px;
		background: hsl(var(--background));
		border: 1px solid hsl(var(--border));
		border-radius: 6px;
		box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3);
		min-width: 140px;
		z-index: 100;
		overflow: hidden;
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 8px 12px;
		text-align: left;
		background: none;
		border: none;
		color: hsl(var(--foreground));
		font-size: 0.9em;
		cursor: pointer;
		transition: background 0.15s;
	}

	.dropdown-item:hover {
		background: hsl(var(--accent));
	}

	.dropdown-item.selected {
		color: var(--item-accent);
	}

	.color-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
</style>
