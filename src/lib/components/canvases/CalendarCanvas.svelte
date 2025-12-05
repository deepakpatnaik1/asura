<script lang="ts">
	/**
	 * CalendarCanvas - Planner canvas: Three-pane productivity workspace
	 *
	 * Calendar | Todos | Done
	 *
	 * Things 3 inspired calendar pane with big dates.
	 * Flat chronological accomplishments list.
	 */

	import type { Mode } from '$lib/config/modes';
	import CanvasFrame from '$lib/components/CanvasFrame.svelte';
	import { Icon } from 'svelte-icons-pack';
	import { LuRefreshCw } from 'svelte-icons-pack/lu';

	interface Props {
		mode: Mode;
	}

	let { mode }: Props = $props();

	// Calendar state
	interface CalendarEvent {
		id: string;
		summary: string;
		start: { dateTime?: string; date?: string };
		end: { dateTime?: string; date?: string };
	}

	interface DayCard {
		date: number;
		day: string;
		month: string;
		fullDate: Date;
		events: { time: string | null; title: string; type: 'calendar' | 'todo' }[];
	}

	let calendarConnected = $state(false);
	let calendarLoading = $state(false);
	let calendarDays = $state<DayCard[]>([]);

	// Fetch calendar events on mount
	$effect(() => {
		fetchCalendarEvents();
	});

	async function fetchCalendarEvents() {
		calendarLoading = true;
		try {
			const response = await fetch('/api/google/calendar/events');
			const data = await response.json();

			calendarConnected = data.connected;

			if (data.connected && data.events) {
				calendarDays = transformEventsToCards(data.events);
			} else {
				// Show next 7 days with no events
				calendarDays = generateEmptyDays(7);
			}
		} catch (err) {
			console.error('Failed to fetch calendar events:', err);
			calendarDays = generateEmptyDays(7);
		} finally {
			calendarLoading = false;
		}
	}

	function generateEmptyDays(count: number): DayCard[] {
		const days: DayCard[] = [];
		const today = new Date();

		for (let i = 0; i < count; i++) {
			const date = new Date(today);
			date.setDate(date.getDate() + i);

			days.push({
				date: date.getDate(),
				day: date.toLocaleDateString('en-US', { weekday: 'long' }),
				month: date.toLocaleDateString('en-US', { month: 'long' }),
				fullDate: date,
				events: []
			});
		}

		return days;
	}

	function transformEventsToCards(events: CalendarEvent[]): DayCard[] {
		// Group events by date
		const eventsByDate = new Map<string, CalendarEvent[]>();
		const today = new Date();

		// Initialize next 14 days
		for (let i = 0; i < 14; i++) {
			const date = new Date(today);
			date.setDate(date.getDate() + i);
			const key = date.toISOString().split('T')[0];
			eventsByDate.set(key, []);
		}

		// Add events to their dates
		for (const event of events) {
			const dateStr = event.start.dateTime
				? event.start.dateTime.split('T')[0]
				: event.start.date;
			if (dateStr && eventsByDate.has(dateStr)) {
				eventsByDate.get(dateStr)!.push(event);
			}
		}

		// Convert to DayCard array
		const days: DayCard[] = [];
		for (const [dateStr, dayEvents] of eventsByDate) {
			const date = new Date(dateStr + 'T12:00:00');

			days.push({
				date: date.getDate(),
				day: date.toLocaleDateString('en-US', { weekday: 'long' }),
				month: date.toLocaleDateString('en-US', { month: 'long' }),
				fullDate: date,
				events: dayEvents.map((e) => ({
					time: formatEventTime(e),
					title: e.summary || '(No title)',
					type: 'calendar' as const
				}))
			});
		}

		// Sort by date
		days.sort((a, b) => a.fullDate.getTime() - b.fullDate.getTime());

		return days;
	}

	function formatEventTime(event: CalendarEvent): string | null {
		if (event.start.date) {
			return null; // All-day event
		}
		if (event.start.dateTime) {
			const date = new Date(event.start.dateTime);
			return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
		}
		return null;
	}

	function connectCalendar() {
		window.location.href = '/api/google/calendar/authorize';
	}

	// Mock data for todos/done - Phase 3/4 will replace
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
				<div class="pane-header">
					<span>Calendar</span>
					{#if calendarConnected}
						<button
							class="sync-button"
							class:spinning={calendarLoading}
							onclick={fetchCalendarEvents}
							disabled={calendarLoading}
							title="Sync calendar"
						>
							<Icon src={LuRefreshCw} size="12" />
						</button>
					{:else}
						<button class="connect-button" onclick={connectCalendar}>
							Connect
						</button>
					{/if}
				</div>
				<div class="pane-content">
					{#if calendarLoading && calendarDays.length === 0}
						<div class="loading">Loading...</div>
					{:else}
						{#each calendarDays as day}
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
					{/if}
				</div>
			</div>

			<!-- Todos Pane -->
			<div class="pane todos-pane">
				<div class="pane-header">Todo <span class="count">&middot; {mockTodos.length}</span></div>
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
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.pane-header .count {
		opacity: 0.6;
	}

	.sync-button,
	.connect-button {
		background: none;
		border: none;
		padding: 2px 6px;
		cursor: pointer;
		color: hsl(var(--muted-foreground));
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.sync-button:hover,
	.connect-button:hover {
		background: hsl(var(--muted) / 0.3);
		color: var(--accent);
	}

	.sync-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.connect-button {
		font-size: 10px;
		color: var(--accent);
		border: 1px solid var(--accent);
	}

	.loading {
		font-size: 10px;
		color: hsl(var(--muted-foreground) / 0.6);
		font-style: italic;
		padding: 8px 0;
	}

	.sync-button.spinning :global(svg) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
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
