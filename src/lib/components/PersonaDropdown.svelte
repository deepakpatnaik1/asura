<script lang="ts">
	import { Icon } from 'svelte-icons-pack';
	import { LuChevronDown } from 'svelte-icons-pack/lu';

	interface Persona {
		name: string;
		display_name: string;
		mode: string;
	}

	interface Props {
		/** Currently selected persona name */
		selectedPersona: string;
		/** List of available personas from DB */
		personas: Persona[];
		/** Current mode: 'chat' or 'reader' */
		mode?: 'chat' | 'reader';
		/** Whether the dropdown is interactive (clickable) */
		interactive?: boolean;
		/** Callback when persona is selected */
		onSelect?: (persona: string) => void;
	}

	let {
		selectedPersona,
		personas,
		mode = 'chat',
		interactive = true,
		onSelect
	}: Props = $props();

	let isOpen = $state(false);

	// Get display name from personas data
	const displayName = $derived(
		personas.find(p => p.name === selectedPersona)?.display_name || selectedPersona
	);

	// Check if persona is available in current mode
	function isAvailable(personaName: string): boolean {
		const persona = personas.find(p => p.name === personaName);
		return persona?.mode === mode;
	}

	function handleToggle(event: Event) {
		if (interactive) {
			event.stopPropagation();
			isOpen = !isOpen;
		}
	}

	function handleSelect(persona: string) {
		if (!isAvailable(persona)) return;
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

<svelte:document onclick={handleClickOutside} />

<div class="persona-dropdown-container">
	<div
		class="persona-dropdown"
		class:interactive
		class:open={isOpen}
		onclick={handleToggle}
		onkeydown={(e) => e.key === 'Enter' && handleToggle(e)}
		role={interactive ? 'button' : undefined}
		tabindex={interactive ? 0 : undefined}
	>
		<span class="persona-name">{displayName}</span>
		{#if interactive}
			<Icon src={LuChevronDown} size="11" />
		{/if}
	</div>

	{#if isOpen && interactive}
		<div class="dropdown-menu">
			{#each personas as persona}
				<button
					class="dropdown-item"
					class:selected={persona.name === selectedPersona}
					class:disabled={!isAvailable(persona.name)}
					onclick={() => handleSelect(persona.name)}
					disabled={!isAvailable(persona.name)}
				>
					{persona.display_name}
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
		min-width: 120px;
		z-index: 100;
		overflow: hidden;
	}

	.dropdown-item {
		display: block;
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
		color: var(--chat-accent);
	}

	.dropdown-item.disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.dropdown-item.disabled:hover {
		background: none;
	}
</style>
