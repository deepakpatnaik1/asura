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
	import { getAccentColor } from '$lib/config/colors';
	import CanvasFrame from '$lib/components/CanvasFrame.svelte';
	import { Icon } from 'svelte-icons-pack';
	import { LuRefreshCw } from 'svelte-icons-pack/lu';

	interface Props {
		mode: Mode;
		refreshTrigger?: number; // Increment to trigger refresh
	}

	let { mode, refreshTrigger = 0 }: Props = $props();

	// Refresh when trigger changes
	$effect(() => {
		if (refreshTrigger > 0) {
			fetchCalendarEvents();
		}
	});

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
		isToday: boolean;
		dateKey: string;
		events: { time: string | null; title: string; type: 'calendar' | 'todo' }[];
	}

	interface FutureEvent {
		date: number;
		title: string;
		time: string | null;
	}

	interface FutureMonth {
		month: string;
		dateRange: string;
		events: FutureEvent[];
	}

	let calendarConnected = $state(false);
	let calendarLoading = $state(false);
	let nearTermDays = $state<DayCard[]>([]);
	let futureMonths = $state<FutureMonth[]>([]);
	// Fetch calendar events on mount
	$effect(() => {
		fetchCalendarEvents();
	});

	async function fetchCalendarEvents() {
		calendarLoading = true;
		try {
			// Fetch 180 days to cover ~6 months of future events
			const response = await fetch('/api/google/calendar/events?days=180');
			const data = await response.json();

			calendarConnected = data.connected;

			if (data.connected && data.events) {
				const result = transformEventsToCards(data.events);
				nearTermDays = result.nearTerm;
				futureMonths = result.future;
			} else {
				// Show next 7 days with no events
				nearTermDays = generateEmptyDays(7);
				futureMonths = [];
			}
		} catch (err) {
			console.error('Failed to fetch calendar events:', err);
			nearTermDays = generateEmptyDays(7);
			futureMonths = [];
		} finally {
			calendarLoading = false;
		}
	}


	function generateEmptyDays(count: number): DayCard[] {
		const days: DayCard[] = [];
		const today = new Date();
		const todayKey = today.toISOString().split('T')[0];

		for (let i = 0; i < count; i++) {
			const date = new Date(today);
			date.setDate(date.getDate() + i);
			const dateKey = date.toISOString().split('T')[0];

			days.push({
				date: date.getDate(),
				day: date.toLocaleDateString('en-US', { weekday: 'long' }),
				month: date.toLocaleDateString('en-US', { month: 'long' }),
				fullDate: date,
				isToday: dateKey === todayKey,
				dateKey,
				events: []
			});
		}

		return days;
	}

	function transformEventsToCards(events: CalendarEvent[]): {
		nearTerm: DayCard[];
		future: FutureMonth[];
	} {
		const today = new Date();
		const todayKey = today.toISOString().split('T')[0];
		const nearTermDayCount = 7;

		// Calculate cutoff for near-term (end of day 7)
		const nearTermCutoff = new Date(today);
		nearTermCutoff.setDate(nearTermCutoff.getDate() + nearTermDayCount);
		const nearTermCutoffKey = nearTermCutoff.toISOString().split('T')[0];

		// Group events by date
		const eventsByDate = new Map<string, CalendarEvent[]>();
		for (const event of events) {
			const dateStr = event.start.dateTime
				? event.start.dateTime.split('T')[0]
				: event.start.date;
			if (dateStr) {
				if (!eventsByDate.has(dateStr)) {
					eventsByDate.set(dateStr, []);
				}
				eventsByDate.get(dateStr)!.push(event);
			}
		}

		// Generate near-term days (next 7 days, show all including empty)
		const nearTerm: DayCard[] = [];
		for (let i = 0; i < nearTermDayCount; i++) {
			const date = new Date(today);
			date.setDate(date.getDate() + i);
			const dateKey = date.toISOString().split('T')[0];
			const dayEvents = eventsByDate.get(dateKey) || [];

			nearTerm.push({
				date: date.getDate(),
				day: date.toLocaleDateString('en-US', { weekday: 'long' }),
				month: date.toLocaleDateString('en-US', { month: 'long' }),
				fullDate: date,
				isToday: dateKey === todayKey,
				dateKey,
				events: dayEvents.map((e) => ({
					time: formatEventTime(e),
					title: e.summary || '(No title)',
					type: 'calendar' as const
				}))
			});
		}

		// Group future events by month (only dates with events)
		const futureByMonth = new Map<string, { month: string; year: number; events: FutureEvent[] }>();

		for (const [dateStr, dayEvents] of eventsByDate) {
			// Skip near-term dates
			if (dateStr < nearTermCutoffKey) continue;

			const date = new Date(dateStr + 'T12:00:00');
			const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
			const monthName = date.toLocaleDateString('en-US', { month: 'long' });

			if (!futureByMonth.has(monthKey)) {
				futureByMonth.set(monthKey, {
					month: monthName,
					year: date.getFullYear(),
					events: []
				});
			}

			for (const event of dayEvents) {
				futureByMonth.get(monthKey)!.events.push({
					date: date.getDate(),
					title: event.summary || '(No title)',
					time: formatEventTime(event)
				});
			}
		}

		// Convert to FutureMonth array with date ranges
		const future: FutureMonth[] = [];
		const sortedMonths = Array.from(futureByMonth.entries()).sort(([a], [b]) => a.localeCompare(b));

		for (const [, monthData] of sortedMonths) {
			if (monthData.events.length === 0) continue;

			// Sort events by date
			monthData.events.sort((a, b) => a.date - b.date);

			// Calculate date range for display
			const firstDate = monthData.events[0].date;
			const lastDate = monthData.events[monthData.events.length - 1].date;
			const dateRange =
				firstDate === lastDate ? `${firstDate}` : `${firstDate}–${lastDate}`;

			future.push({
				month: monthData.month,
				dateRange,
				events: monthData.events
			});
		}

		return { nearTerm, future };
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

	async function disconnectCalendar() {
		try {
			const response = await fetch('/api/google/calendar/disconnect', { method: 'DELETE' });
			if (response.ok) {
				calendarConnected = false;
				nearTermDays = generateEmptyDays(7);
				futureMonths = [];
			}
		} catch (err) {
			console.error('Failed to disconnect calendar:', err);
		}
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
</script>

<CanvasFrame {mode}>
	{#snippet content()}
		<div class="productivity-canvas" style:--accent={getAccentColor(mode)}>
			<!-- Calendar Pane -->
			<div class="pane calendar-pane">
				<div class="pane-header">
					<span>{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
					{#if calendarConnected}
						<button
							class="sync-button hit-target"
							class:spinning={calendarLoading}
							onclick={() => fetchCalendarEvents()}
							disabled={calendarLoading}
							title="Sync calendar"
						>
							<Icon src={LuRefreshCw} size="11" />
						</button>
						<button class="disconnect-button" onclick={disconnectCalendar} title="Disconnect calendar">
							Disconnect
						</button>
					{:else}
						<button class="connect-button" onclick={connectCalendar}>
							Connect
						</button>
					{/if}
				</div>
				<div class="pane-content">
					{#if calendarLoading && nearTermDays.length === 0}
						<div class="loading">Loading...</div>
					{:else}
						<!-- Near-term: Next 7 days expanded -->
						{#each nearTermDays as day (day.dateKey)}
							<div class="day-card">
								<div class="day-header">
									<span class="day-date">{day.date}</span>
									<span class="day-name">{day.day}</span>
								</div>
								<div class="day-events">
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
								</div>
							</div>
						{/each}

						<!-- Future: Collapsed by month -->
						{#each futureMonths as month (month.month + month.dateRange)}
							<div class="future-month">
								<div class="month-header">
									<span class="month-name">{month.month}</span>
									<span class="month-range">{month.dateRange}</span>
								</div>
								<div class="month-events">
									{#each month.events as event}
										<div class="future-event">
											<span class="future-date">{event.date}</span>
											<span class="future-title">{event.title}</span>
										</div>
									{/each}
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
		overflow: hidden;
	}

	.pane-header {
		padding: var(--spacing-xl) 0 var(--spacing-md);
		font-size: var(--font-body);
		color: hsl(var(--muted-foreground));
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.pane-header .count {
		opacity: 0.6;
	}

	.sync-button,
	.connect-button,
	.disconnect-button {
		background: none;
		border: none;
		padding: 2px var(--spacing-sm);
		cursor: pointer;
		color: hsl(var(--muted-foreground));
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.sync-button:hover,
	.connect-button:hover,
	.disconnect-button:hover {
		background: hsl(var(--muted) / var(--border-opacity));
		color: var(--accent);
	}

	.sync-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.connect-button,
	.disconnect-button {
		font-size: var(--font-caption);
	}

	.connect-button {
		color: var(--accent);
		border: 1px solid var(--accent);
	}

	.disconnect-button {
		color: hsl(var(--muted-foreground) / 0.6);
		border: 1px solid hsl(var(--muted-foreground) / 0.3);
	}

	.loading {
		font-size: var(--font-caption);
		color: hsl(var(--muted-foreground) / 0.6);
		font-style: italic;
		padding: var(--spacing-md) 0;
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
		overscroll-behavior: contain;
	}

	/* Calendar Pane - Near Term */
	.day-card {
		margin-bottom: var(--spacing-2xl);
	}

	.day-header {
		display: flex;
		align-items: baseline;
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-sm);
	}

	.day-date {
		font-size: var(--font-display);
		font-weight: var(--font-weight-semibold);
		color: var(--accent);
		line-height: 1;
	}

	.day-name {
		font-size: var(--font-body);
		color: hsl(var(--muted-foreground));
	}

	.event {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-xs) 0;
		font-size: var(--font-body);
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

	/* Calendar Pane - Future Months */
	.future-month {
		margin-top: var(--spacing-3xl);
		padding-top: var(--spacing-2xl);
		border-top: 1px solid hsl(var(--muted) / var(--border-opacity));
	}

	.future-month:first-of-type {
		margin-top: var(--spacing-md);
	}

	.month-header {
		display: flex;
		align-items: baseline;
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-lg);
	}

	.month-name {
		font-size: var(--font-section-header);
		font-weight: var(--font-weight-semibold);
		color: hsl(var(--foreground));
	}

	.month-range {
		font-size: var(--font-body);
		color: hsl(var(--muted-foreground) / 0.7);
	}

	.month-events {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.future-event {
		display: flex;
		align-items: baseline;
		gap: var(--spacing-md);
		font-size: var(--font-body);
	}

	.future-date {
		color: var(--accent);
		font-weight: var(--font-weight-medium);
		min-width: 18px;
	}

	.future-title {
		color: hsl(var(--foreground));
	}

	/* Todos Pane */
	.todos-pane {
		display: flex;
		flex-direction: column;
	}

	.todo-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.todo-item {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-md);
	}

	.todo-circle {
		color: hsl(var(--muted-foreground) / 0.5);
		font-size: var(--font-body);
		line-height: 1.4;
	}

	.todo-content {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.todo-text {
		font-size: var(--font-body);
		color: hsl(var(--foreground));
	}

	.todo-tag {
		font-size: var(--font-caption);
		color: var(--accent);
		opacity: 0.8;
	}

	/* Done Pane */
	.done-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.done-item {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: baseline;
		gap: var(--spacing-md);
		font-size: var(--font-body);
	}

	.done-check {
		color: var(--accent);
		font-size: var(--font-caption);
		transform: scaleY(1.2);
		display: inline-block;
	}

	.done-text {
		color: hsl(var(--foreground));
	}

	.done-time {
		color: hsl(var(--muted-foreground) / 0.6);
		font-size: var(--font-caption);
		text-align: right;
	}
</style>
