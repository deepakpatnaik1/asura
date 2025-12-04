<script lang="ts">
	/**
	 * CalendarCanvas - Placeholder for calendar/schedule view
	 */

	import { Icon } from 'svelte-icons-pack';
	import { LuCalendar } from 'svelte-icons-pack/lu';
	import type { Mode } from '$lib/config/modes';

	interface Props {
		mode: Mode;
	}

	let { mode }: Props = $props();

	function getModeAccentVar(mode: Mode): string {
		switch (mode) {
			case 'chat':
				return 'var(--boss-accent)';
			case 'reader':
				return 'var(--reader-accent)';
			case 'todo':
				return 'var(--todo-accent)';
			default:
				return 'var(--boss-accent)';
		}
	}
</script>

<div class="calendar-canvas" style:--accent={getModeAccentVar(mode)}>
	<div class="placeholder">
		<Icon src={LuCalendar} size="48" />
		<h3>Calendar</h3>
		<p>Schedule view coming soon</p>
	</div>
</div>

<style>
	.calendar-canvas {
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.placeholder {
		text-align: center;
		color: hsl(var(--muted-foreground));
		opacity: 0.6;
	}

	.placeholder h3 {
		margin: 16px 0 8px;
		font-size: 1.1rem;
		font-weight: 500;
		color: var(--accent);
	}

	.placeholder p {
		font-size: 0.875rem;
	}
</style>
