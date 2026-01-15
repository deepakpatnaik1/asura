<script lang="ts">
	/**
	 * CalendarCanvas - Planner canvas: Two-pane productivity workspace
	 *
	 * Calendar | Todos (block-based)
	 *
	 * Things 3 inspired calendar pane with big dates.
	 * Block-based todo pane with Felix-controlled sections.
	 */

	import { onMount } from 'svelte';
	import CanvasFrame from '$lib/components/CanvasFrame.svelte';
	import { Icon } from 'svelte-icons-pack';
	import { LuRefreshCw, LuChevronDown, LuChevronRight } from 'svelte-icons-pack/lu';
	import { getPersonaAccentColor } from '$lib/config/colors';
	import { renderMarkdown } from '$lib/markdown-renderer';
	import { lastBlockMutations, lastMutations } from '$lib/stores/chat';

	interface Props {
		persona: string;
		refreshTrigger?: number; // Increment to trigger refresh
	}

	let { persona, refreshTrigger = 0 }: Props = $props();

	// Track refresh trigger changes - use $derived to ensure reactivity
	let lastTrigger = $state(0);
	$effect(() => {
		if (refreshTrigger !== lastTrigger && refreshTrigger > 0) {
			lastTrigger = refreshTrigger;
			fetchCalendarEvents();
			fetchBlocksAndTodos();
		}
	});

	// Listen for nuke events to clear UI instantly
	onMount(() => {
		const handleNuke = (e: CustomEvent<{ bucket: string }>) => {
			const bucket = e.detail.bucket;
			if (bucket === 'productivity:todos') {
				blocks = [];
				todosById.clear();
			}
		};
		window.addEventListener('nuke-complete', handleNuke as EventListener);
		return () => window.removeEventListener('nuke-complete', handleNuke as EventListener);
	});

	// Re-fetch when block mutations come in from Felix's tools
	$effect(() => {
		const blockMuts = $lastBlockMutations;
		if (blockMuts) {
			// Any block mutation should trigger a re-fetch
			const hasChanges =
				(blockMuts.created_blocks?.length ?? 0) > 0 ||
				(blockMuts.updated_blocks?.length ?? 0) > 0 ||
				(blockMuts.deleted_blocks?.length ?? 0) > 0 ||
				(blockMuts.moved_blocks?.length ?? 0) > 0;
			if (hasChanges) {
				fetchBlocksAndTodos();
				// Clear mutations after processing
				lastBlockMutations.set(null);
			}
		}
	});

	// Re-fetch when todo mutations come in (create, complete, update, delete, settings change)
	$effect(() => {
		const todoMuts = $lastMutations;
		if (todoMuts) {
			const hasChanges =
				(todoMuts.created_todos?.length ?? 0) > 0 ||
				(todoMuts.completed_todos?.length ?? 0) > 0 ||
				(todoMuts.reopened_todos?.length ?? 0) > 0 ||
				(todoMuts.updated_todos?.length ?? 0) > 0 ||
				(todoMuts.deleted_todos?.length ?? 0) > 0 ||
				todoMuts.settings_changed === true;
			if (hasChanges) {
				fetchBlocksAndTodos();
				// Clear mutations after processing
				lastMutations.set(null);
			}
		}
	});

	// Get accent color for static UI elements
	const accentColor = $derived(getPersonaAccentColor(persona));

	// ============================================================================
	// Calendar State (unchanged)
	// ============================================================================

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
		type: 'calendar' | 'todo';
		tags?: string[];
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
			const response = await fetch('/api/google/calendar/events?days=180');
			const data = await response.json();

			calendarConnected = data.connected;

			if (data.connected && data.events) {
				const result = transformEventsToCards(data.events);
				nearTermDays = result.nearTerm;
				futureMonths = result.future;
			} else {
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

		const nearTermCutoff = new Date(today);
		nearTermCutoff.setDate(nearTermCutoff.getDate() + nearTermDayCount);
		const nearTermCutoffKey = nearTermCutoff.toISOString().split('T')[0];

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

		const futureByMonth = new Map<string, { month: string; year: number; events: FutureEvent[] }>();

		const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
		const currentMonthName = today.toLocaleDateString('en-US', { month: 'long' });
		const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
		const nearTermEndDay = nearTermCutoff.getDate();

		if (nearTermCutoff.getMonth() === today.getMonth() && nearTermEndDay <= lastDayOfMonth) {
			futureByMonth.set(currentMonthKey, {
				month: currentMonthName,
				year: today.getFullYear(),
				events: []
			});
		}

		for (const [dateStr, dayEvents] of eventsByDate) {
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
					time: formatEventTime(event),
					type: 'calendar'
				});
			}
		}

		const future: FutureMonth[] = [];
		const sortedMonths = Array.from(futureByMonth.entries()).sort(([a], [b]) => a.localeCompare(b));

		for (const [, monthData] of sortedMonths) {
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
			return null;
		}
		if (event.start.dateTime) {
			const date = new Date(event.start.dateTime);
			const hours = date.getHours();
			const minutes = date.getMinutes();
			const ampm = hours >= 12 ? 'pm' : 'am';
			const hour12 = hours % 12 || 12;
			return minutes === 0 ? `${hour12}${ampm}` : `${hour12}:${minutes.toString().padStart(2, '0')}${ampm}`;
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

	// ============================================================================
	// Block-Based Todo State
	// ============================================================================

	interface Todo {
		id: string;
		description: string;
		tags: string[];
		status: 'open' | 'completed';
		created_at: string;
		completed_at: string | null;
		deadline_period: string | null;
		parent_id: string | null;
	}

	interface Block {
		id: string;
		parent_id: string | null;
		block_type: 'section' | 'todo_ref' | 'note' | 'divider';
		content: { name?: string; collapsed?: boolean; text?: string };
		todo_id: string | null;
		sort_order: number;
		children?: Block[];
		renderedHtml?: string; // Pre-rendered markdown for note blocks
	}

	let blocks = $state<Block[]>([]);
	let todosById = $state(new Map<string, Todo>());
	let childrenByParent = $state(new Map<string, Todo[]>());
	let blocksLoading = $state(false);
	let hideCompletedTodos = $state(false);

	// Local collapse state (overrides server state for immediate feedback)
	let localCollapseState = $state(new Map<string, boolean>());

	function isCollapsed(block: Block): boolean {
		if (localCollapseState.has(block.id)) {
			return localCollapseState.get(block.id)!;
		}
		return block.content.collapsed ?? false;
	}

	function toggleCollapse(block: Block) {
		const current = isCollapsed(block);
		localCollapseState.set(block.id, !current);
		// Trigger reactivity
		localCollapseState = new Map(localCollapseState);
	}

	function collapseAllSections() {
		// Recursively find all section blocks and collapse them
		function collectSections(blockList: Block[]): string[] {
			const ids: string[] = [];
			for (const block of blockList) {
				if (block.block_type === 'section') {
					ids.push(block.id);
					if (block.children) {
						ids.push(...collectSections(block.children));
					}
				}
			}
			return ids;
		}

		const sectionIds = collectSections(blocks);
		for (const id of sectionIds) {
			localCollapseState.set(id, true);
		}
		// Trigger reactivity
		localCollapseState = new Map(localCollapseState);
	}

	// Fetch blocks and todos on mount
	$effect(() => {
		fetchBlocksAndTodos();
	});

	// Recursively pre-render markdown for note blocks
	async function renderNoteBlocks(blockList: Block[]): Promise<void> {
		for (const block of blockList) {
			if (block.block_type === 'note' && block.content.text) {
				block.renderedHtml = await renderMarkdown(block.content.text, persona);
			}
			if (block.children && block.children.length > 0) {
				await renderNoteBlocks(block.children);
			}
		}
	}

	async function fetchBlocksAndTodos() {
		blocksLoading = true;
		try {
			// Fetch blocks, todos, and settings in parallel
			const [blocksRes, todosRes, settingsRes] = await Promise.all([
				fetch('/api/todo-blocks'),
				fetch('/api/todos'),
				fetch('/api/settings')
			]);

			const blocksData = await blocksRes.json();
			const todosData = await todosRes.json();
			const settingsData = await settingsRes.json();

			// Update hide_completed_todos setting
			hideCompletedTodos = settingsData.hide_completed_todos ?? false;

			// If no blocks exist, bootstrap
			let fetchedBlocks: Block[];
			if (!blocksData.blocks || blocksData.blocks.length === 0) {
				await fetch('/api/todo-blocks/bootstrap', { method: 'POST' });
				// Refetch after bootstrap
				const newBlocksRes = await fetch('/api/todo-blocks');
				const newBlocksData = await newBlocksRes.json();
				fetchedBlocks = newBlocksData.blocks || [];
			} else {
				fetchedBlocks = blocksData.blocks;
			}

			// Pre-render markdown for note blocks
			await renderNoteBlocks(fetchedBlocks);
			blocks = fetchedBlocks;

			// Build todos lookup map
			if (todosData.todos) {
				const newTodosById = new Map<string, Todo>();
				const newChildrenByParent = new Map<string, Todo[]>();

				for (const todo of todosData.todos) {
					newTodosById.set(todo.id, todo);
					if (todo.parent_id) {
						if (!newChildrenByParent.has(todo.parent_id)) {
							newChildrenByParent.set(todo.parent_id, []);
						}
						newChildrenByParent.get(todo.parent_id)!.push(todo);
					}
				}

				// Sort children by created_at
				for (const children of newChildrenByParent.values()) {
					children.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
				}

				todosById = newTodosById;
				childrenByParent = newChildrenByParent;
			}
		} catch (err) {
			console.error('Failed to fetch blocks/todos:', err);
		} finally {
			blocksLoading = false;
		}
	}

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
</script>

<!-- Recursive Block Renderer -->
{#snippet renderBlock(block: Block, depth: number = 0)}
	{#if block.block_type === 'section'}
		<div class="block-section" class:collapsed={isCollapsed(block)}>
			<button class="section-header" onclick={() => toggleCollapse(block)}>
				<span class="section-chevron">
					{#if isCollapsed(block)}
						<Icon src={LuChevronRight} size="12" />
					{:else}
						<Icon src={LuChevronDown} size="12" />
					{/if}
				</span>
				<span class="section-name">{block.content.name || 'Untitled'}</span>
			</button>
			{#if !isCollapsed(block) && block.children && block.children.length > 0}
				<div class="section-content">
					{#each block.children as child (child.id)}
						{@render renderBlock(child, depth + 1)}
					{/each}
				</div>
			{/if}
		</div>
	{:else if block.block_type === 'todo_ref'}
		{@const todo = todosById.get(block.todo_id!)}
		{#if todo && !(hideCompletedTodos && todo.status === 'completed')}
			{@const children = childrenByParent.get(todo.id) || []}
			{@const visibleChildren = hideCompletedTodos ? children.filter(c => c.status !== 'completed') : children}
			<div class="todo-group">
				<div class="todo-item" class:completed={todo.status === 'completed'}>
					<div class="todo-content">
						<span class="todo-text">{normalizeText(todo.description)}</span>
						<div class="todo-meta">
							{#if todo.deadline_period}
								<span class="todo-deadline">{todo.deadline_period}</span>
							{/if}
							{#if todo.tags.length > 0}
								<span class="todo-tag">#{todo.tags.join(' #')}</span>
							{/if}
							<span class="todo-time">{formatRelativeTime(todo.created_at)}</span>
						</div>
					</div>
				</div>
				<!-- Child todos (from parent_id relationship, not blocks) -->
				{#each visibleChildren as child (child.id)}
					<div class="todo-item todo-child" class:completed={child.status === 'completed'} class:parent-completed={todo.status === 'completed'}>
						<div class="todo-content">
							<span class="todo-text">{normalizeText(child.description)}</span>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{:else if block.block_type === 'note'}
		<div class="block-note">
			{#if block.renderedHtml}
				{@html block.renderedHtml}
			{:else}
				<span class="note-text">{block.content.text || ''}</span>
			{/if}
		</div>
	{:else if block.block_type === 'divider'}
		<div class="block-divider"></div>
	{/if}
{/snippet}

<CanvasFrame>
	{#snippet content()}
		<div class="productivity-canvas" style="--accent-color: {accentColor}">
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
												<span class="future-time">{event.time ?? (event.type === 'todo' ? 'todo' : '')}</span>
												<div class="future-content">
													<span class="future-title">{normalizeText(event.title)}</span>
													{#if event.tags && event.tags.length > 0}
														<span class="future-tag">#{event.tags.join(' #')}</span>
													{/if}
												</div>
											</div>
										{/each}
									{/if}
								</div>
							</div>
						{/each}
					{/if}
				</div>
			</div>

			<!-- Todos Pane (Block-Based) -->
			<div class="pane todos-pane">
				<div class="pane-header">
					To-Dos
					{#if blocksLoading}
						<span class="loading-indicator">...</span>
					{/if}
					<button class="collapse-all-button" onclick={collapseAllSections} title="Collapse all sections">
						Collapse all
					</button>
				</div>
				<div class="pane-content">
					<div class="block-tree">
						{#each blocks as block (block.id)}
							{@render renderBlock(block)}
						{/each}
					</div>
				</div>
			</div>

			<!-- Empty Third Column -->
			<div class="pane empty-pane"></div>

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
		padding-right: 12px;
	}

	.pane:last-child {
		padding-right: 0;
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
	.todos-pane .pane-header {
		color: var(--accent-color);
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
		color: hsl(var(--foreground));
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
		color: var(--accent-color);
		border: 1px solid var(--accent-color);
	}

	.disconnect-button {
		color: hsl(var(--muted-foreground) / 0.6);
		border: 1px solid hsl(var(--muted-foreground) / 0.3);
	}

	.collapse-all-button {
		background: none;
		border: 1px solid hsl(var(--muted-foreground) / 0.3);
		padding: 2px var(--spacing-sm);
		cursor: pointer;
		color: hsl(var(--muted-foreground) / 0.6);
		border-radius: 4px;
		font-size: var(--font-caption);
		margin-left: auto;
	}

	.collapse-all-button:hover {
		background: hsl(var(--muted) / var(--border-opacity));
		color: hsl(var(--foreground));
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
		color: var(--accent-color);
		line-height: 1;
	}

	.calendar-pane .day-name {
		font-size: var(--font-body);
		color: var(--accent-color);
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
		min-width: 56px;
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
		color: hsl(var(--foreground));
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
		color: var(--accent-color);
	}

	.month-range {
		font-size: var(--font-body);
		color: var(--accent-color);
	}

	.month-events {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.future-event {
		display: flex;
		align-items: baseline;
		gap: var(--spacing-sm);
		font-size: var(--font-body);
	}

	.future-date {
		color: var(--accent-color);
		font-weight: var(--font-weight-medium);
		min-width: 24px;
	}

	.future-title {
		color: hsl(var(--foreground));
	}

	.future-time {
		color: hsl(var(--muted-foreground) / 0.7);
		min-width: 28px;
		font-size: var(--font-body);
	}

	.future-content {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.future-tag {
		font-size: var(--font-caption);
		color: hsl(var(--foreground));
		opacity: 0.8;
	}

	/* Block Tree */
	.block-tree {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	/* Section Block */
	.block-section {
		display: flex;
		flex-direction: column;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		background: none;
		border: none;
		padding: var(--spacing-xs) 0;
		cursor: pointer;
		color: var(--accent-color);
		font-size: var(--font-body);
		text-align: left;
	}

	.section-header:hover {
		opacity: 0.8;
	}

	.section-chevron {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		color: hsl(var(--muted-foreground) / 0.6);
	}

	.section-name {
		font-weight: var(--font-weight-medium);
	}

	.section-content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
		padding-left: var(--spacing-lg);
		margin-top: var(--spacing-sm);
	}

	/* Note Block */
	.block-note {
		padding: var(--spacing-sm) var(--spacing-md);
		background: hsl(var(--muted) / 0.3);
		border-radius: 4px;
		font-size: var(--font-caption);
		color: hsl(var(--muted-foreground));
		font-style: italic;
	}

	/* Divider Block */
	.block-divider {
		height: 1px;
		background: hsl(var(--muted) / var(--border-opacity));
		margin: var(--spacing-md) 0;
	}

	/* Todo Styles (same as before) */
	.todos-pane {
		display: flex;
		flex-direction: column;
	}

	.todo-group {
		border: 1px solid transparent;
		border-left: 2px solid color-mix(in srgb, var(--accent-color) 80%, transparent);
		border-radius: 6px;
		padding: 0 var(--spacing-md);
		background: hsl(var(--background));
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
		color: hsl(var(--foreground));
	}

	.todo-meta {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	.todo-tag {
		font-size: var(--font-caption);
		color: hsl(var(--foreground));
		opacity: 0.8;
	}

	.todo-time {
		font-size: var(--font-caption);
		color: hsl(var(--muted-foreground) / 0.5);
	}

	.todo-deadline {
		font-size: var(--font-caption);
		color: var(--accent-color);
		font-style: italic;
	}

	.todo-child {
		padding-left: var(--spacing-md);
	}

	.todo-child .todo-text {
		font-size: var(--font-caption);
	}

	.todo-item.completed .todo-text,
	.todo-item.completed .todo-tag,
	.todo-item.completed .todo-deadline,
	.todo-item.completed .todo-time {
		color: hsl(var(--foreground) / 0.2);
	}

	/* Gray out children when parent is completed */
	.todo-item.parent-completed .todo-text {
		color: hsl(var(--foreground) / 0.2);
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
</style>
