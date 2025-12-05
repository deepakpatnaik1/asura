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
			fetchScheduledTodos();
			fetchUnscheduledTodos();
			fetchDiaryEntries();
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
		events: { time: string | null; title: string; type: 'calendar' | 'todo'; tags?: string[] }[];
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
				// Merge scheduled todos if already loaded
				if (scheduledTodos.length > 0) {
					mergeScheduledTodosIntoDays();
				}
			} else {
				// Show next 7 days with no events
				nearTermDays = generateEmptyDays(7);
				futureMonths = [];
				// Merge scheduled todos if already loaded
				if (scheduledTodos.length > 0) {
					mergeScheduledTodosIntoDays();
				}
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

		// Group future events by month
		const futureByMonth = new Map<string, { month: string; year: number; events: FutureEvent[] }>();

		// Always include the rest of the current month (even if no events)
		const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
		const currentMonthName = today.toLocaleDateString('en-US', { month: 'long' });
		const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
		const nearTermEndDay = nearTermCutoff.getDate();

		// Only add current month section if there are days after near-term
		if (nearTermCutoff.getMonth() === today.getMonth() && nearTermEndDay <= lastDayOfMonth) {
			futureByMonth.set(currentMonthKey, {
				month: currentMonthName,
				year: today.getFullYear(),
				events: []
			});
		}

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
			// Sort events by date
			monthData.events.sort((a, b) => a.date - b.date);

			future.push({
				month: monthData.month,
				dateRange: String(monthData.year),
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

	// Todo state
	interface Todo {
		id: string;
		description: string;
		tags: string[];
		status: 'open' | 'completed';
		created_at: string;
		completed_at: string | null;
		scheduled_for: string | null;
		times_pushed: number;
	}

	let unscheduledTodos = $state<Todo[]>([]);
	let scheduledTodos = $state<Todo[]>([]);
	let todosLoading = $state(false);

	function formatRelativeTime(isoString: string): string {
		const date = new Date(isoString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays === 1) return 'yesterday';
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	// Typography normalization: em dash (—) → en dash (–) with spaces
	function normalizeText(text: string): string {
		return text.replace(/\s*—\s*/g, ' – ');
	}

	// Fetch todos on mount
	$effect(() => {
		fetchUnscheduledTodos();
		fetchScheduledTodos();
	});

	async function fetchUnscheduledTodos() {
		todosLoading = true;
		try {
			const response = await fetch('/api/todos?status=open&scheduled=false');
			const data = await response.json();
			if (data.todos) {
				unscheduledTodos = data.todos;
			}
		} catch (err) {
			console.error('Failed to fetch unscheduled todos:', err);
		} finally {
			todosLoading = false;
		}
	}

	async function fetchScheduledTodos() {
		try {
			const response = await fetch('/api/todos?status=open&scheduled=true');
			const data = await response.json();
			if (data.todos) {
				scheduledTodos = data.todos;
				// Re-merge with calendar events
				if (nearTermDays.length > 0) {
					mergeScheduledTodosIntoDays();
				}
			}
		} catch (err) {
			console.error('Failed to fetch scheduled todos:', err);
		}
	}

	function mergeScheduledTodosIntoDays() {
		// Add scheduled todos to their respective day cards
		nearTermDays = nearTermDays.map(day => {
			// Filter out old todo events, keep only calendar events
			const calendarEvents = day.events.filter(e => e.type === 'calendar');

			// Find todos scheduled for this day
			const dayTodos = scheduledTodos
				.filter(todo => todo.scheduled_for === day.dateKey)
				.map(todo => ({
					time: null,
					title: todo.description,
					type: 'todo' as const,
					tags: todo.tags
				}));

			return {
				...day,
				events: [...calendarEvents, ...dayTodos]
			};
		});
	}

	// Founder Diary state
	interface DiaryEntry {
		id: string;
		description: string;
		tags: string[];
		logged_at: string;
	}

	interface DiaryDay {
		date: number;
		day: string;
		month: string;
		year: number;
		dateKey: string;
		isToday: boolean;
		entries: DiaryEntry[];
	}

	let diaryEntries = $state<DiaryEntry[]>([]);
	let diaryDays = $state<DiaryDay[]>([]);
	let diaryLoading = $state(false);

	// Fetch diary entries on mount
	$effect(() => {
		fetchDiaryEntries();
	});

	async function fetchDiaryEntries() {
		diaryLoading = true;
		try {
			const response = await fetch('/api/diary');
			const data = await response.json();
			if (data.entries) {
				diaryEntries = data.entries;
				diaryDays = groupDiaryByDate(data.entries);
			}
		} catch (err) {
			console.error('Failed to fetch diary entries:', err);
		} finally {
			diaryLoading = false;
		}
	}

	function groupDiaryByDate(entries: DiaryEntry[]): DiaryDay[] {
		const today = new Date();
		const todayKey = today.toISOString().split('T')[0];

		// Group entries by date
		const byDate = new Map<string, DiaryEntry[]>();
		for (const entry of entries) {
			const dateKey = entry.logged_at.split('T')[0];
			if (!byDate.has(dateKey)) {
				byDate.set(dateKey, []);
			}
			byDate.get(dateKey)!.push(entry);
		}

		// Convert to DiaryDay array, sorted by date ascending (oldest first)
		const days: DiaryDay[] = [];
		const sortedDates = Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b));

		for (const dateKey of sortedDates) {
			const date = new Date(dateKey + 'T12:00:00');
			days.push({
				date: date.getDate(),
				day: date.toLocaleDateString('en-US', { weekday: 'long' }),
				month: date.toLocaleDateString('en-US', { month: 'long' }),
				year: date.getFullYear(),
				dateKey,
				isToday: dateKey === todayKey,
				entries: byDate.get(dateKey)!
			});
		}

		return days;
	}
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
										<div class="event">
											<span class="event-time">{event.time ?? 'todo'}</span>
											<div class="event-content">
												<span class="event-title">{normalizeText(event.title)}</span>
												{#if event.tags && event.tags.length > 0}
													<span class="event-tag">#{event.tags.join(' #')}</span>
												{/if}
											</div>
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
									{#if month.events.length === 0}
										<div class="empty-month">(empty)</div>
									{:else}
										{#each month.events as event}
											<div class="future-event">
												<span class="future-date">{event.date}</span>
												<span class="future-title">{normalizeText(event.title)}</span>
											</div>
										{/each}
									{/if}
								</div>
							</div>
						{/each}
					{/if}
				</div>
			</div>

			<!-- Todos Pane (unscheduled only) -->
			<div class="pane todos-pane">
				<div class="pane-header">
					To-Dos
					{#if todosLoading}
						<span class="loading-indicator">...</span>
					{/if}
				</div>
				<div class="pane-content">
					<div class="todo-list">
						{#each unscheduledTodos as todo (todo.id)}
								<div class="todo-item">
									<div class="todo-content">
										<span class="todo-text">{normalizeText(todo.description)}</span>
										<div class="todo-meta">
											{#if todo.tags.length > 0}
												<span class="todo-tag">#{todo.tags.join(' #')}</span>
											{/if}
											<span class="todo-time">{formatRelativeTime(todo.created_at)}</span>
											{#if todo.times_pushed > 0}
												<span class="todo-pushed">· pushed {todo.times_pushed}x</span>
											{/if}
										</div>
									</div>
								</div>
						{/each}
					</div>
				</div>
			</div>

			<!-- Founder Diary Pane -->
			<div class="pane done-pane">
				<div class="pane-header">
					Founder Diary
					{#if diaryLoading}
						<span class="loading-indicator">...</span>
					{/if}
				</div>
				<div class="pane-content">
					{#if diaryDays.length === 0 && !diaryLoading}
						<div class="empty-state">No diary entries yet</div>
					{:else}
						{@const seenMonths = new Set<string>()}
						{#each diaryDays as day (day.dateKey)}
							{@const monthYearKey = `${day.month}-${day.year}`}
							{@const isFirstInMonth = !seenMonths.has(monthYearKey)}
							{@const _ = seenMonths.add(monthYearKey)}
							<div class="diary-day">
								<div class="day-header">
									<span class="day-date">{day.date}</span>
									<span class="day-name">{day.day}</span>
									{#if isFirstInMonth}
										<span class="day-month-year">{day.month} {day.year}</span>
									{/if}
								</div>
								<div class="diary-entries">
									{#each day.entries as entry (entry.id)}
										<div class="diary-entry">
											<span class="diary-text">{normalizeText(entry.description)}</span>
											{#if entry.tags.length > 0}
												<span class="diary-tag">#{entry.tags.join(' #')}</span>
											{/if}
										</div>
									{/each}
								</div>
							</div>
						{/each}
					{/if}
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

	.calendar-pane .pane-header,
	.todos-pane .pane-header,
	.done-pane .pane-header {
		color: var(--accent);
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

	.calendar-pane .day-name {
		font-size: var(--font-body);
		color: var(--accent);
	}

	.done-pane .day-name {
		font-size: var(--font-body);
		color: var(--accent);
	}

	.done-pane .day-month-year {
		font-size: var(--font-body);
		color: var(--accent);
	}

	.event {
		display: flex;
		align-items: baseline;
		gap: var(--spacing-sm);
		padding: var(--spacing-xs) 0;
		font-size: var(--font-body);
	}

	.event-time {
		color: hsl(var(--muted-foreground) / 0.7);
		min-width: 52px;
	}

	.event-content {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.event-title {
		color: hsl(var(--foreground));
	}

	.event-tag {
		font-size: var(--font-caption);
		color: var(--accent);
		opacity: 0.8;
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
		gap: var(--spacing-xs);
		margin-bottom: var(--spacing-lg);
	}

	.month-name {
		font-size: var(--font-body);
		color: var(--accent);
	}

	.month-range {
		font-size: var(--font-body);
		color: var(--accent);
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
	}

	.todo-content {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.todo-text {
		font-size: var(--font-body);
		color: var(--accent);
	}

	.todo-meta {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	.todo-tag {
		font-size: var(--font-caption);
		color: var(--accent);
		opacity: 0.8;
	}

	.todo-time {
		font-size: var(--font-caption);
		color: hsl(var(--muted-foreground) / 0.5);
	}

	.todo-pushed {
		font-size: var(--font-caption);
		color: hsl(var(--muted-foreground) / 0.5);
	}

	.empty-state {
		font-size: var(--font-body);
		color: hsl(var(--muted-foreground) / 0.5);
		font-style: italic;
		padding: var(--spacing-md) 0;
	}

	.empty-month {
		font-size: var(--font-caption);
		color: hsl(var(--muted-foreground) / 0.5);
		font-style: italic;
	}

	.loading-indicator {
		font-size: var(--font-caption);
		color: hsl(var(--muted-foreground) / 0.5);
	}

	/* Founder Diary Pane */
	.diary-day {
		margin-bottom: var(--spacing-2xl);
	}

	.diary-entries {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.diary-entry {
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: var(--spacing-xs) 0;
	}

	.diary-text {
		font-size: var(--font-body);
		color: hsl(var(--foreground));
	}

	.diary-tag {
		font-size: var(--font-caption);
		color: var(--accent);
		opacity: 0.8;
	}
</style>
