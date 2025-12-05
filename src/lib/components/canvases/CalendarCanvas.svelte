<script lang="ts">
	/**
	 * CalendarCanvas - Three-pane productivity workspace
	 *
	 * Calendar | Todos | Done
	 *
	 * Things 3 inspired calendar pane with big dates.
	 * Flat chronological accomplishments list.
	 */

	import type { Mode } from '$lib/config/modes';
	import CanvasFrame from '$lib/components/CanvasFrame.svelte';

	interface Props {
		mode: Mode;
	}

	let { mode }: Props = $props();

	// Mock data - will be replaced with real data from database
	const mockCalendar = [
		{
			date: 4,
			day: 'Wednesday',
			month: 'December',
			events: [
				{ time: '10am', title: 'Standup', type: 'calendar' as const },
				{ time: '2pm', title: 'Board prep', type: 'calendar' as const },
				{ time: null, title: 'Ship auth fix', type: 'todo' as const }
			]
		},
		{
			date: 5,
			day: 'Thursday',
			month: 'December',
			events: [
				{ time: '9am', title: 'Investor call', type: 'calendar' as const },
				{ time: '3pm', title: 'Design review', type: 'calendar' as const }
			]
		},
		{
			date: 6,
			day: 'Friday',
			month: 'December',
			events: []
		}
	];

	const mockTodos = [
		{ id: '1', text: 'Write investor update', tag: 'investor' },
		{ id: '2', text: 'Review term sheet', tag: 'legal' },
		{ id: '3', text: 'Blog post draft', tag: 'marketing' }
	];

	const mockDone = [
		{ id: '1', text: 'Sent deck to LP', time: '2:15pm' },
		{ id: '2', text: 'Fixed auth bug', time: '11:30am' },
		{ id: '3', text: 'Closed Series A docs', time: 'yesterday 4:45pm' },
		{ id: '4', text: 'Drafted pitch deck', time: 'Dec 2 9:30am' },
		{ id: '5', text: 'Called accountant', time: 'Dec 1 3:15pm' }
	];

	function getAccentColor(): string {
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

<CanvasFrame {mode}>
	{#snippet content()}
		<div class="productivity-canvas" style:--accent={getAccentColor()}>
			<!-- Calendar Pane -->
			<div class="pane calendar-pane">
				<div class="pane-header">Calendar</div>
				<div class="pane-content">
					{#each mockCalendar as day}
						<div class="day-card">
							<div class="day-header">
								<span class="day-date">{day.date}</span>
								<span class="day-name">{day.day}</span>
							</div>
							<div class="day-events">
								{#if day.events.length === 0}
									<div class="empty-day">(empty)</div>
								{:else}
									{#each day.events as event}
										<div class="event" class:todo-event={event.type === 'todo'}>
											{#if event.type === 'calendar'}
												<span class="event-bullet">&#9642;</span>
											{:else}
												<span class="event-bullet todo">&#9670;</span>
											{/if}
											{#if event.time}
												<span class="event-time">{event.time}</span>
											{/if}
											<span class="event-title">{event.title}</span>
										</div>
									{/each}
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Todos Pane -->
			<div class="pane todos-pane">
				<div class="pane-header">Todos <span class="count">&middot; {mockTodos.length}</span></div>
				<div class="pane-content">
					<div class="todo-list">
						{#each mockTodos as todo}
							<div class="todo-item">
								<span class="todo-circle">&#9675;</span>
								<div class="todo-content">
									<span class="todo-text">{todo.text}</span>
									<span class="todo-tag">#{todo.tag}</span>
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>

			<!-- Done Pane -->
			<div class="pane done-pane">
				<div class="pane-header">Done <span class="count">&middot; {mockDone.length}</span></div>
				<div class="pane-content">
					<div class="done-list">
						{#each mockDone as item}
							<div class="done-item">
								<span class="done-check">&#10003;</span>
								<span class="done-text">{item.text}</span>
								<span class="done-time">{item.time}</span>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	{/snippet}
	{#snippet footer()}
		<!-- Empty footer for now - maintains layout alignment -->
	{/snippet}
</CanvasFrame>

<style>
	.productivity-canvas {
		height: 100%;
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
	}

	.pane {
		background: hsl(var(--background));
		display: flex;
		flex-direction: column;
		min-height: 0;
		border-right: 1px solid hsl(var(--border) / var(--border-opacity));
	}

	.pane:last-child {
		border-right: none;
	}

	.pane-header {
		padding: 12px 12px 8px;
		font-size: 11px;
		color: hsl(var(--muted-foreground));
		flex-shrink: 0;
	}

	.pane-header .count {
		opacity: 0.6;
	}

	.pane-content {
		flex: 1;
		overflow-y: auto;
		padding: 0 12px;
	}

	/* Calendar Pane */
	.day-card {
		margin-bottom: 16px;
	}

	.day-header {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin-bottom: 6px;
	}

	.day-date {
		font-size: 20px;
		font-weight: 600;
		color: var(--accent);
		line-height: 1;
	}

	.day-name {
		font-size: 11px;
		color: hsl(var(--muted-foreground));
	}

	.day-events {
		padding-left: 2px;
	}

	.empty-day {
		font-size: 10px;
		color: hsl(var(--muted-foreground) / 0.5);
		font-style: italic;
	}

	.event {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 3px 0;
		font-size: 11px;
	}

	.event-bullet {
		color: hsl(var(--muted-foreground) / 0.6);
		font-size: 7px;
	}

	.event-bullet.todo {
		color: var(--accent);
		font-size: 8px;
	}

	.event-time {
		color: hsl(var(--muted-foreground) / 0.7);
		min-width: 32px;
	}

	.event-title {
		color: hsl(var(--foreground));
	}

	.todo-event .event-title {
		color: var(--accent);
	}

	/* Todos Pane */
	.todos-pane {
		display: flex;
		flex-direction: column;
	}

	.todo-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.todo-item {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}

	.todo-circle {
		color: hsl(var(--muted-foreground) / 0.5);
		font-size: 11px;
		line-height: 1.4;
	}

	.todo-content {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.todo-text {
		font-size: 11px;
		color: hsl(var(--foreground));
	}

	.todo-tag {
		font-size: 10px;
		color: var(--accent);
		opacity: 0.8;
	}

	/* Done Pane */
	.done-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.done-item {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: baseline;
		gap: 8px;
		font-size: 11px;
	}

	.done-check {
		color: var(--accent);
		font-size: 10px;
		transform: scaleY(1.2);
		display: inline-block;
	}

	.done-text {
		color: hsl(var(--foreground));
	}

	.done-time {
		color: hsl(var(--muted-foreground) / 0.6);
		font-size: 10px;
		text-align: right;
	}
</style>
