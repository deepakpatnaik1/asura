import { VOYAGE_API_KEY } from '$env/static/private';
import { VoyageAIClient } from 'voyageai';
import { EMBEDDING_MODEL } from '$lib/config/models';
import { MEMORY } from '$lib/config/memory';
import { DEFAULT_PERSONA, personaHasContextChunk } from '$lib/config/personas';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCalendarEvents, refreshAccessToken } from '$lib/api/google-calendar';

const voyage = new VoyageAIClient({ apiKey: VOYAGE_API_KEY });

// Token estimation (rough approximation: 1 token ≈ 4 characters)
function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

// Fetch model context window from database
async function getModelContextWindow(supabase: SupabaseClient, modelIdentifier: string): Promise<number> {
	const { data, error } = await supabase
		.from('models')
		.select('context_window')
		.eq('model_identifier', modelIdentifier)
		.single();

	if (error || !data) {
		return 131072; // Default fallback (128K tokens)
	}

	return data.context_window;
}

interface ContextComponents {
	canon: string; // Canon content (shared across all modes)
	superjournal: string;
	files: string; // Enabled user files (artisan cuts)
	starred: string;
	journal: string;
	highSalienceArcs: string;
	otherArcs: string;
	workData: string; // Todo mode: current todos and tags
	calendar: string; // Google Calendar events (for Alicja)
	fitness: string; // Fitness/health log (for Alicja)
	whiteboard: string; // Active whiteboard (for Gunnar)
	canvas: string; // Designer canvases (for Eva)
	subredditRegistry: string; // Subreddit list with engagement timestamps (for Ananya)
}

interface ContextStats {
	totalTokens: number;
	components: {
		canon: number;
		superjournal: number;
		files: number;
		starred: number;
		journal: number;
		highSalienceArcs: number;
		otherArcs: number;
		workData: number;
		calendar: number;
		fitness: number;
		whiteboard: number;
		canvas: number;
		subredditRegistry: number;
	};
}

export interface StructuredContext {
	context: string; // Full assembled context (for backwards compat)
	components: ContextComponents; // Individual components for cache control
	stats: ContextStats;
}

// Type for vector search RPC results
interface VectorSearchResult {
	id: string;
	boss_essence: string;
	persona_essence: string;
	decision_arc_summary: string;
	salience_score: number;
	created_at: string;
	similarity: number;
}

interface RankedVectorResult extends VectorSearchResult {
	weighted_score: number;
}

/**
 * Builds memory context for AI conversations
 * Uses full context window with priority-based truncation
 *
 * Context injection is config-driven via persona.contextChunks:
 * - working: Last N superjournal turns (unified across all personas)
 * - recent: Compressed journal summaries
 * - semantic: Vector search results
 * - canon: tier='canon' content (always included)
 * - active: Currently selected content(s) (via contentIds)
 * - todos, diary, tags, time: Productivity data
 */
export async function buildContext(
	supabase: SupabaseClient,
	userId: string,
	personaName: string = DEFAULT_PERSONA,
	modelIdentifier: string,
	userQuery?: string, // Optional: enables vector search
	contentIds?: string[], // Currently selected content(s) from library
	whiteboardIds?: string[], // Selected whiteboard IDs (for Gunnar)
	canvasIds?: string[] // Selected designer canvas IDs (for Eva)
): Promise<StructuredContext> {
	// Get model's context window and calculate budget
	const contextWindow = await getModelContextWindow(supabase, modelIdentifier);
	const contextBudget = Math.floor(contextWindow * MEMORY.contextWindowCap);

	// Initialize context components
	const components: ContextComponents = {
		canon: '',
		superjournal: '',
		files: '',
		starred: '',
		journal: '',
		highSalienceArcs: '',
		otherArcs: '',
		workData: '',
		calendar: '',
		fitness: '',
		whiteboard: '',
		canvas: '',
		subredditRegistry: ''
	};

	let totalTokens = 0;

	// Helper to check if persona wants a chunk
	const hasChunk = (chunk: Parameters<typeof personaHasContextChunk>[1]) =>
		personaHasContextChunk(personaName, chunk);

	// Priority 0: Canon content (always injected if persona has 'canon' chunk)
	if (hasChunk('canon')) {
		const { data: canonData } = await supabase
			.from('articles')
			.select('title, artisan_cut, raw_content, created_at')
			.eq('user_id', userId)
			.eq('tier', 'canon')
			.order('created_at', { ascending: true });

		if (canonData && canonData.length > 0) {
			const canonText = formatCanonContent(canonData);
			components.canon = canonText;
			totalTokens += estimateTokens(canonText);
		}
	}

	// Priority 0.5: Active library items (content, whiteboards, canvases)
	if (hasChunk('active')) {
		// Load selected content (articles)
		if (contentIds && contentIds.length > 0) {
			const { data: contentData } = await supabase
				.from('articles')
				.select('title, raw_content, artisan_cut')
				.in('id', contentIds)
				.eq('user_id', userId);

			if (contentData && contentData.length > 0) {
				const articlesText = contentData
					.map((item) => {
						const articleContent = item.artisan_cut || item.raw_content;
						return articleContent ? `[${item.title}]\n${articleContent}` : null;
					})
					.filter(Boolean)
					.join('\n\n---\n\n');

				if (articlesText) {
					const filesText = `--- ACTIVE CONTENT ---\n${articlesText}\n\n`;
					components.files = filesText;
					totalTokens += estimateTokens(filesText);
				}
			}
		}

		// Load selected whiteboards
		if (whiteboardIds && whiteboardIds.length > 0) {
			const { data: whiteboardsData } = await supabase
				.from('canvas_whiteboard')
				.select('id, title, state')
				.in('id', whiteboardIds)
				.eq('user_id', userId);

			if (whiteboardsData && whiteboardsData.length > 0) {
				const whiteboardText = formatWhiteboardsContext(whiteboardsData);
				components.whiteboard = whiteboardText;
				totalTokens += estimateTokens(whiteboardText);
			}
		}

		// Load selected designer canvases (for Eva)
		if (canvasIds && canvasIds.length > 0) {
			const { data: canvasData } = await supabase
				.from('canvas_designer')
				.select('id, title, state')
				.in('id', canvasIds)
				.eq('user_id', userId);

			if (canvasData && canvasData.length > 0) {
				const canvasText = formatCanvasContext(canvasData);
				components.canvas = canvasText;
				totalTokens += estimateTokens(canvasText);
			}
		}

	}

	// Priority 0.5: Work data (todos, diary, tags, time)
	// Check individual chunks - some personas may want todos but not calendar
	const wantsTodos = hasChunk('todos');
	const wantsDiary = hasChunk('diary');
	const wantsTags = hasChunk('tags');
	const wantsTime = hasChunk('time');

	if (wantsTodos || wantsDiary || wantsTags) {
		const [todosResult, tagsResult, diaryResult] = await Promise.all([
			wantsTodos
				? supabase
						.from('canvas_planner_todos')
						.select('id, description, tags, status, created_at, completed_at, deadline_period, parent_id')
						.eq('user_id', userId)
						.order('created_at', { ascending: true })
				: Promise.resolve({ data: [] }),
			wantsTags
				? supabase
						.from('canvas_planner_tags')
						.select('name')
						.eq('user_id', userId)
						.order('name', { ascending: true })
				: Promise.resolve({ data: [] }),
			wantsDiary
				? supabase
						.from('canvas_planner_diary')
						.select('id, description, tags, logged_at, event_period')
						.eq('user_id', userId)
						.order('logged_at', { ascending: true })
				: Promise.resolve({ data: [] })
		]);

		// Use Alicja-style formatting (with IDs) for personas with tools
		// Use Gunnar-style formatting (pre-computed analytics) for personas without tools
		const { PERSONAS } = await import('$lib/config/personas');
		const personaHasTools = (PERSONAS[personaName]?.tools?.length ?? 0) > 0;
		const workDataText = personaHasTools
			? formatWorkData(
					todosResult.data || [],
					(tagsResult.data || []).map((t: { name: string }) => t.name),
					diaryResult.data || []
			  )
			: formatWorkDataForGunnar(
					todosResult.data || [],
					(tagsResult.data || []).map((t: { name: string }) => t.name),
					diaryResult.data || []
			  );
		components.workData = workDataText;
		totalTokens += estimateTokens(workDataText);
	}

	// Priority 0.6: Google Calendar events (for Alicja)
	if (hasChunk('calendar')) {
		try {
			// Get Google OAuth tokens
			const { data: tokens } = await supabase
				.from('google_tokens')
				.select('access_token, refresh_token, expires_at')
				.eq('user_id', userId)
				.single();

			if (tokens) {
				let accessToken = tokens.access_token;
				const expiresAt = new Date(tokens.expires_at);
				const now = new Date();

				// Refresh if expires in less than 5 minutes
				if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
					try {
						const refreshed = await refreshAccessToken(tokens.refresh_token);
						accessToken = refreshed.access_token;

						// Update stored token
						await supabase
							.from('google_tokens')
							.update({
								access_token: refreshed.access_token,
								expires_at: refreshed.expires_at.toISOString(),
								updated_at: new Date().toISOString()
							})
							.eq('user_id', userId);
					} catch {
						// Token refresh failed, skip calendar context
					}
				}

				// Fetch next 14 days of events
				const events = await fetchCalendarEvents(accessToken, 14);
				if (events.length > 0) {
					const calendarText = formatCalendarEvents(events);
					components.calendar = calendarText;
					totalTokens += estimateTokens(calendarText);
				}
			}
		} catch {
			// Calendar fetch failed, continue without it
		}
	}

	// Priority 0.7: Fitness log (for Alicja)
	if (hasChunk('fitness')) {
		try {
			const { data: fitnessData } = await supabase
				.from('canvas_planner_fitness')
				.select('id, entry, logged_at')
				.eq('user_id', userId)
				.order('logged_at', { ascending: false })
				.limit(30);

			if (fitnessData && fitnessData.length > 0) {
				const fitnessText = formatFitnessLog(fitnessData);
				components.fitness = fitnessText;
				totalTokens += estimateTokens(fitnessText);
			}
		} catch {
			// Fitness fetch failed, continue without it
		}
	}

	// Priority 0.8: Subreddit registry (for Ananya) - top 5 lowest scores
	if (hasChunk('subreddit_registry')) {
		try {
			const { data: registryData } = await supabase
				.from('subreddit_registry')
				.select('name, url')
				.eq('platform', 'reddit')
				.order('engagement_score', { ascending: true })
				.limit(5);

			if (registryData && registryData.length > 0) {
				const registryText = formatSubredditRegistry(registryData);
				components.subredditRegistry = registryText;
				totalTokens += estimateTokens(registryText);
			}
		} catch {
			// Registry fetch failed, continue without it
		}
	}

	// Build parallel queries based on persona chunks
	type QueryResult = { data: unknown[] | null };
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const queries: PromiseLike<any>[] = [];
	const queryKeys: string[] = [];

	// Priority 1: Working memory (superjournal) - persona-filtered
	if (hasChunk('working')) {
		queries.push(
			supabase
				.from('superjournal')
				.select('user_message, ai_response, persona_name, created_at')
				.eq('user_id', userId)
				.eq('persona_name', personaName) // Only this persona's turns
				.order('created_at', { ascending: false })
				.limit(MEMORY.superjournalLimit)
		);
		queryKeys.push('superjournal');
	}

	// Priority 2: Starred messages - persona-only
	if (hasChunk('starred')) {
		queries.push(
			supabase
				.from('journal')
				.select('boss_essence, persona_essence, persona_name, created_at')
				.eq('is_starred', true)
				.eq('user_id', userId)
				.eq('persona_name', personaName)
				.order('created_at', { ascending: false })
		);
		queryKeys.push('starred');
	}

	// Priority 3: Recent memory (journal) - persona-only
	if (hasChunk('recent')) {
		queries.push(
			supabase
				.from('journal')
				.select('boss_essence, persona_essence, decision_arc_summary, persona_name, created_at')
				.eq('user_id', userId)
				.eq('persona_name', personaName)
				.order('created_at', { ascending: false })
				.limit(MEMORY.lastNJournalEntries)
		);
		queryKeys.push('journal');
	}

	// Execute all queries in parallel
	const results = await Promise.all(queries);

	// Map results back to their types
	const resultMap: Record<string, QueryResult> = {};
	queryKeys.forEach((key, i) => {
		resultMap[key] = results[i];
	});

	const superjournalResult = resultMap['superjournal'];
	const starredJournalResult = resultMap['starred'];
	const journalResult = resultMap['journal'];

	// Assemble context with budget checks (in priority order)

	// Priority 1: Superjournal (working memory)
	if (superjournalResult?.data && superjournalResult.data.length > 0) {
		const superjournalData = superjournalResult.data as Array<{
			user_message: string;
			ai_response: string;
			persona_name: string;
			created_at: string;
		}>;
		const superjournalText = formatSuperjournalHistory(superjournalData.reverse());
		components.superjournal = superjournalText;
		totalTokens += estimateTokens(superjournalText);
	}

	// Priority 2: Starred messages from journal
	if (starredJournalResult?.data && starredJournalResult.data.length > 0) {
		const starredData = starredJournalResult.data as Array<{
			boss_essence: string;
			persona_essence: string;
			persona_name: string;
			created_at: string;
		}>;
		const starredText = formatStarredMessages(starredData);
		const starredTokens = estimateTokens(starredText);
		if (totalTokens + starredTokens <= contextBudget) {
			components.starred = starredText;
			totalTokens += starredTokens;
		}
	}

	// Priority 3: Journal (recent memory, with truncation if needed)
	if (journalResult?.data && journalResult.data.length > 0) {
		const journalData = (
			journalResult.data as Array<{
				boss_essence: string;
				persona_essence: string;
				decision_arc_summary: string;
				persona_name: string;
				created_at: string;
			}>
		).reverse();
		const journalText = formatJournalHistory(journalData);
		const journalTokens = estimateTokens(journalText);
		if (totalTokens + journalTokens <= contextBudget) {
			components.journal = journalText;
			totalTokens += journalTokens;
		} else {
			// Truncate journal entries to fit budget
			const truncatedJournal = truncateToFit(
				journalData,
				contextBudget - totalTokens,
				formatJournalHistory
			);
			components.journal = truncatedJournal;
			totalTokens += estimateTokens(truncatedJournal);
		}
	}

	// Priority 4: Vector search (semantic memory)
	// Only if persona has 'semantic' chunk, userQuery provided, and enough journal entries
	if (hasChunk('semantic') && userQuery) {
		const { count: journalCount } = await supabase
			.from('journal')
			.select('id', { count: 'exact', head: true })
			.eq('user_id', userId);

		if (journalCount && journalCount > MEMORY.vectorSearchThreshold) {
			try {
				// Generate embedding for user query
				const queryEmbedding = await voyage.embed({
					input: userQuery,
					model: EMBEDDING_MODEL
				});

				const queryVector = queryEmbedding.data?.[0]?.embedding ?? null;

				if (queryVector) {
					// Get IDs to exclude (already in context) - run in parallel
					const [superjournalIdsResult, journalIdsResult] = await Promise.all([
						supabase
							.from('superjournal')
							.select('id')
							.eq('user_id', userId)
							.order('created_at', { ascending: false })
							.limit(MEMORY.superjournalLimit),
						supabase
							.from('journal')
							.select('id')
							.eq('user_id', userId)
							.order('created_at', { ascending: false })
							.limit(MEMORY.lastNJournalEntries)
					]);

					const excludeIds: string[] = [];

					if (journalIdsResult.data) {
						excludeIds.push(...journalIdsResult.data.map((j) => j.id));
					}

					if (superjournalIdsResult.data && superjournalIdsResult.data.length > 0) {
						const sjIds = superjournalIdsResult.data.map((s) => s.id);
						const { data: journalFromSj } = await supabase
							.from('journal')
							.select('id')
							.in('superjournal_id', sjIds);

						if (journalFromSj) {
							excludeIds.push(...journalFromSj.map((j) => j.id));
						}
					}

					// Perform vector search - persona-only
					const { data: vectorResults } = await supabase.rpc('search_journal_by_embedding', {
						query_embedding: JSON.stringify(queryVector),
						match_count: 50,
						exclude_ids: excludeIds,
						user_id_filter: userId,
						persona_name_filter: personaName
					});

					if (vectorResults && vectorResults.length > 0) {
						// Re-rank by weighted score: similarity × (salience/10)
						const reranked: RankedVectorResult[] = (vectorResults as VectorSearchResult[])
							.map((entry) => ({
								...entry,
								weighted_score: entry.similarity * (entry.salience_score / 10.0)
							}))
							.sort((a, b) => b.weighted_score - a.weighted_score)
							.slice(0, 10);

						const vectorText = formatVectorSearchResults(reranked);
						const vectorTokens = estimateTokens(vectorText);

						if (totalTokens + vectorTokens <= contextBudget) {
							components.highSalienceArcs = vectorText;
							totalTokens += vectorTokens;
						}
					}
				}
			} catch {
				// Vector search failed, continue without it
			}
		}
	}


	// Assemble final context
	const finalContext = assembleContext(components);

	// Calculate component stats
	const stats: ContextStats = {
		totalTokens,
		components: {
			canon: estimateTokens(components.canon),
			superjournal: estimateTokens(components.superjournal),
			files: estimateTokens(components.files),
			starred: estimateTokens(components.starred),
			journal: estimateTokens(components.journal),
			highSalienceArcs: estimateTokens(components.highSalienceArcs),
			otherArcs: estimateTokens(components.otherArcs),
			workData: estimateTokens(components.workData),
			calendar: estimateTokens(components.calendar),
			fitness: estimateTokens(components.fitness),
			whiteboard: estimateTokens(components.whiteboard),
			canvas: estimateTokens(components.canvas),
			subredditRegistry: estimateTokens(components.subredditRegistry)
		}
	};

	return { context: finalContext, components, stats };
}

// Format timestamp for context (human-readable, natural phrasing)
function formatTimestamp(dateString: string): string {
	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	// Get time of day bucket
	const hour = date.getHours();
	let timeOfDay: string;
	if (hour >= 5 && hour < 12) {
		timeOfDay = 'morning';
	} else if (hour >= 12 && hour < 17) {
		timeOfDay = 'afternoon';
	} else if (hour >= 17 && hour < 21) {
		timeOfDay = 'evening';
	} else {
		timeOfDay = 'night';
	}

	// Today
	if (date.toDateString() === now.toDateString()) {
		if (diffMs < 60 * 60 * 1000) {
			// Less than an hour ago
			const mins = Math.floor(diffMs / (1000 * 60));
			return mins <= 1 ? 'just now' : `${mins} minutes ago`;
		}
		return `this ${timeOfDay}`;
	}

	// Yesterday
	const yesterday = new Date(now);
	yesterday.setDate(yesterday.getDate() - 1);
	if (date.toDateString() === yesterday.toDateString()) {
		return `yesterday ${timeOfDay}`;
	}

	// Within the last week (use day name)
	if (diffDays < 7) {
		const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
		return `${dayName} ${timeOfDay}`;
	}

	// Within the last 2 weeks
	if (diffDays < 14) {
		return 'last week';
	}

	// Within the last month
	if (diffDays < 30) {
		const weeks = Math.floor(diffDays / 7);
		return `${weeks} weeks ago`;
	}

	// Older
	const months = Math.floor(diffDays / 30);
	return months === 1 ? 'last month' : `${months} months ago`;
}

// Format Superjournal history (recent full turns)
function formatSuperjournalHistory(
	entries: Array<{
		user_message: string;
		ai_response: string;
		persona_name: string;
		created_at: string;
	}>
): string {
	if (entries.length === 0) return '';

	const formatted = entries
		.map(
			(entry) =>
				`[${formatTimestamp(entry.created_at)}]
User: ${entry.user_message}
${entry.persona_name}: ${entry.ai_response}`
		)
		.join('\n\n');

	return `--- WORKING MEMORY (Last ${MEMORY.superjournalLimit} Full Turns) ---\n${formatted}\n\n`;
}

// Format Journal history (recent compressed turns)
function formatJournalHistory(
	entries: Array<{
		boss_essence: string;
		persona_essence: string;
		decision_arc_summary: string;
		persona_name: string;
		created_at: string;
	}>
): string {
	if (entries.length === 0) return '';

	const formatted = entries
		.map(
			(entry) =>
				`[${formatTimestamp(entry.created_at)}]
User: ${entry.boss_essence}
${entry.persona_name}: ${entry.persona_essence}`
		)
		.join('\n\n');

	return `--- RECENT MEMORY (Last ${MEMORY.lastNJournalEntries} Compressed Turns) ---\n${formatted}\n\n`;
}

// Format canon content (shared across all modes)
function formatCanonContent(
	entries: Array<{
		title: string;
		artisan_cut: string | null;
		raw_content: string | null;
		created_at: string;
	}>
): string {
	if (entries.length === 0) return '';

	const formatted = entries
		.map((entry) => {
			const content = entry.artisan_cut || entry.raw_content || '';
			return `[Canon: ${entry.title}]\n${content}`;
		})
		.join('\n\n');

	return `--- CANON (Shared Knowledge) ---\n${formatted}\n\n`;
}

// Format starred messages (chat mode: from journal - boss message only)
function formatStarredMessages(
	entries: Array<{
		boss_essence: string;
		persona_essence: string;
		persona_name: string;
		created_at: string;
	}>
): string {
	if (entries.length === 0) return '';

	const formatted = entries
		.map(
			(entry) =>
				`[Starred - ${formatTimestamp(entry.created_at)}]
User: ${entry.boss_essence}
${entry.persona_name}: ${entry.persona_essence}`
		)
		.join('\n\n');

	return `--- STARRED MESSAGES (User-Pinned Memory) ---\n${formatted}\n\n`;
}

// Format vector search results
function formatVectorSearchResults(
	entries: Array<{
		boss_essence: string;
		persona_essence: string;
		decision_arc_summary: string;
		salience_score: number;
		created_at: string;
		weighted_score: number;
	}>
): string {
	if (entries.length === 0) return '';

	const formatted = entries
		.map(
			(entry) =>
				`[${formatTimestamp(entry.created_at)}]
User: ${entry.boss_essence}
AI: ${entry.persona_essence}`
		)
		.join('\n\n');

	return `--- SEMANTICALLY RELEVANT MEMORIES (Vector Search Results) ---\n${formatted}\n\n`;
}


// Truncate journal entries to fit within token budget
function truncateToFit<T>(
	entries: T[],
	tokenBudget: number,
	formatter: (entries: T[]) => string
): string {
	let included = 0;
	for (let i = 0; i < entries.length; i++) {
		const subset = entries.slice(0, i + 1);
		const formatted = formatter(subset);
		if (estimateTokens(formatted) > tokenBudget) {
			break;
		}
		included = i + 1;
	}
	return formatter(entries.slice(0, included));
}

// Format work data for Gunnar (chat mode) - simple hierarchy, no computed durations
function formatWorkDataForGunnar(
	todos: Array<{
		id: string;
		description: string;
		tags: string[];
		status: string;
		created_at: string;
		completed_at: string | null;
		deadline_period: string | null;
		parent_id: string | null;
	}>,
	tags: string[],
	diary: Array<{
		id: string;
		description: string;
		tags: string[];
		logged_at: string;
		event_period?: string | null;
	}>
): string {
	// Helper to format a single todo
	const formatTodo = (t: (typeof todos)[0]) => {
		const base: Record<string, unknown> = {
			description: t.description,
			tags: t.tags,
			status: t.status
		};
		if (t.deadline_period) base.deadline = t.deadline_period;
		return base;
	};

	// Separate parents and children, format with hierarchy
	const parents = todos.filter((t) => !t.parent_id);
	const childrenByParent = new Map<string, typeof todos>();
	todos
		.filter((t) => t.parent_id)
		.forEach((t) => {
			const existing = childrenByParent.get(t.parent_id!) || [];
			existing.push(t);
			childrenByParent.set(t.parent_id!, existing);
		});

	// Build hierarchical structure
	const formattedTodos = parents.map((parent) => {
		const children = childrenByParent.get(parent.id) || [];
		const formatted = formatTodo(parent);

		if (children.length > 0) {
			const completedCount = children.filter((c) => c.status === 'completed').length;
			formatted.subtasks = {
				progress: `${completedCount}/${children.length}`,
				items: children.map((c) => formatTodo(c))
			};
		}

		return formatted;
	});

	// Format diary entries - just use event_period as-is
	const formattedDiary = diary
		.filter((d) => d.event_period) // Only include entries with a date/period
		.map((d) => ({
			description: d.description,
			tags: d.tags,
			when: d.event_period
		}));

	const todosJson = JSON.stringify(formattedTodos, null, 2);
	const diaryJson = JSON.stringify(formattedDiary, null, 2);
	const tagsJson = JSON.stringify(tags);

	return `--- PRODUCTIVITY DATA (From Alicja) ---
<productivity_data>
<tags>${tagsJson}</tags>
<todos>
${todosJson}
</todos>
<founder_diary>
${diaryJson}
</founder_diary>
</productivity_data>

`;
}

// Format work data (todos, tags, and diary) for Alicja (with IDs and hierarchy)
function formatWorkData(
	todos: Array<{
		id: string;
		description: string;
		tags: string[];
		status: string;
		created_at: string;
		completed_at: string | null;
		deadline_period: string | null;
		parent_id: string | null;
	}>,
	tags: string[],
	diary: Array<{
		id: string;
		description: string;
		tags: string[];
		logged_at: string;
		event_period?: string | null;
	}>
): string {
	const currentTime = new Date().toISOString();

	// Build hierarchical todo structure
	const parentTodos = todos.filter((t) => !t.parent_id);
	const childTodosMap = new Map<string, typeof todos>();

	todos.filter((t) => t.parent_id).forEach((child) => {
		const existing = childTodosMap.get(child.parent_id!) || [];
		existing.push(child);
		childTodosMap.set(child.parent_id!, existing);
	});

	// Format todos with clear hierarchy
	const formattedTodos = parentTodos.map((parent) => {
		const children = childTodosMap.get(parent.id) || [];
		const completedChildren = children.filter((c) => c.status === 'completed').length;

		return {
			id: parent.id,
			description: parent.description,
			tags: parent.tags,
			status: parent.status,
			deadline_period: parent.deadline_period,
			progress: children.length > 0 ? `${completedChildren}/${children.length}` : null,
			children: children.map((c) => ({
				id: c.id,
				description: c.description,
				status: c.status,
				tags: c.tags
			}))
		};
	});

	const todosJson = JSON.stringify(formattedTodos, null, 2);

	const diaryJson = JSON.stringify(
		diary.map((d) => ({
			id: d.id,
			description: d.description,
			tags: d.tags,
			logged_at: d.logged_at,
			event_period: d.event_period || null
		})),
		null,
		2
	);

	const tagsJson = JSON.stringify(tags);

	return `--- WORK DATA (All Todos, Tags & Founder Diary) ---
<work_data>
<current_time>${currentTime}</current_time>
<tags>${tagsJson}</tags>
<todos>
${todosJson}
</todos>
<founder_diary>
${diaryJson}
</founder_diary>
</work_data>

`;
}

// Format Google Calendar events for Alicja's context
interface CalendarEvent {
	id: string;
	summary: string;
	start: { dateTime?: string; date?: string };
	end: { dateTime?: string; date?: string };
	description?: string;
	location?: string;
}

function formatCalendarEvents(events: CalendarEvent[]): string {
	if (events.length === 0) return '';

	const formattedEvents = events.map((event) => {
		const start = event.start.dateTime || event.start.date || '';
		const end = event.end.dateTime || event.end.date || '';
		const isAllDay = !event.start.dateTime;

		return {
			event_id: event.id,
			title: event.summary,
			start: start,
			end: end,
			all_day: isAllDay,
			location: event.location || null,
			description: event.description || null
		};
	});

	const eventsJson = JSON.stringify(formattedEvents, null, 2);

	return `--- GOOGLE CALENDAR (Next 14 Days) ---
<calendar_events>
${eventsJson}
</calendar_events>

`;
}

// Format fitness log for Alicja
function formatFitnessLog(
	entries: Array<{
		id: string;
		entry: Record<string, unknown>;
		logged_at: string;
	}>
): string {
	if (entries.length === 0) return '';

	const formattedEntries = entries.map((e) => ({
		...e.entry,
		logged_at: e.logged_at
	}));

	const entriesJson = JSON.stringify(formattedEntries, null, 2);

	return `--- FITNESS LOG (Last 30 Entries) ---
<fitness_log>
${entriesJson}
</fitness_log>

`;
}

// Format whiteboard context for Gunnar (dual-layer: render + semantic)
interface WhiteboardStateForContext {
	render?: Array<{
		id: string;
		type: string;
		x?: number;
		y?: number;
		text?: string;
		fill?: string;
		width?: number;
		height?: number;
		from?: [number, number];
		to?: [number, number];
		label?: string;
	}>;
	semantic?: Record<string, unknown>;
	viewport?: { x: number; y: number; scale: number };
	// Legacy format support
	notes?: Array<{
		id: string;
		x: number;
		y: number;
		text: string;
		fill?: string;
	}>;
}

function formatSingleWhiteboard(whiteboard: {
	id: string;
	title: string;
	state: WhiteboardStateForContext;
}): string {
	const { id, title, state } = whiteboard;

	// Handle both new dual-layer format and legacy notes format
	const render = state?.render || [];
	const semantic = state?.semantic || {};

	// Fallback: convert legacy notes to render format
	const elements =
		render.length > 0
			? render
			: (state?.notes || []).map((n) => ({ ...n, type: 'note' as const }));

	if (elements.length === 0) {
		return `<whiteboard id="${id}">
<title>${title}</title>
<render>[]</render>
<semantic>{}</semantic>
</whiteboard>`;
	}

	const renderJson = JSON.stringify(elements, null, 2);
	const semanticJson = JSON.stringify(semantic, null, 2);

	return `<whiteboard id="${id}">
<title>${title}</title>
<render>
${renderJson}
</render>
<semantic>
${semanticJson}
</semantic>
</whiteboard>`;
}

function formatWhiteboardsContext(
	whiteboards: Array<{
		id: string;
		title: string;
		state: WhiteboardStateForContext;
	}>
): string {
	if (whiteboards.length === 0) return '';

	const formatted = whiteboards.map(formatSingleWhiteboard).join('\n\n');
	const count = whiteboards.length;
	const label = count === 1 ? 'SELECTED WHITEBOARD' : `SELECTED WHITEBOARDS (${count})`;

	return `--- ${label} ---
${formatted}

`;
}

// Format designer canvas context for Eva (same dual-layer format as whiteboards)
interface CanvasStateForContext {
	render?: Array<{
		id: string;
		type: string;
		x?: number;
		y?: number;
		text?: string;
		fill?: string;
		width?: number;
		height?: number;
		src?: string;
		from?: [number, number];
		to?: [number, number];
		label?: string;
	}>;
	semantic?: Record<string, unknown>;
	viewport?: { x: number; y: number; scale: number };
}

function formatSingleCanvas(canvas: {
	id: string;
	title: string;
	state: CanvasStateForContext;
}): string {
	const { id, title, state } = canvas;

	const render = state?.render || [];
	const semantic = state?.semantic || {};

	if (render.length === 0 && Object.keys(semantic).length === 0) {
		return `<canvas id="${id}">
<title>${title}</title>
<render>[]</render>
<semantic>{}</semantic>
</canvas>`;
	}

	// Strip base64 image data from render elements to keep context small
	// Eva doesn't need actual image data - just metadata (code, type, position, dimensions)
	const renderForContext = render.map(el => {
		if (el.type === 'image' && el.src?.startsWith('data:')) {
			// Replace base64 data with placeholder, keep all other metadata
			const { src, ...rest } = el;
			return { ...rest, src: '[base64 image data]' };
		}
		return el;
	});

	const renderJson = JSON.stringify(renderForContext, null, 2);
	const semanticJson = JSON.stringify(semantic, null, 2);

	return `<canvas id="${id}">
<title>${title}</title>
<render>
${renderJson}
</render>
<semantic>
${semanticJson}
</semantic>
</canvas>`;
}

function formatCanvasContext(
	canvases: Array<{
		id: string;
		title: string;
		state: CanvasStateForContext;
	}>
): string {
	if (canvases.length === 0) return '';

	const formatted = canvases.map(formatSingleCanvas).join('\n\n');
	const count = canvases.length;
	const label = count === 1 ? 'SELECTED DESIGNER CANVAS' : `SELECTED DESIGNER CANVASES (${count})`;

	return `--- ${label} ---
${formatted}

`;
}

// Format subreddit registry for Ananya (top 5 lowest engagement scores)
function formatSubredditRegistry(
	entries: Array<{
		name: string;
		url: string;
	}>
): string {
	if (entries.length === 0) return '';

	const formatted = entries.map((entry) => `- ${entry.name}: ${entry.url}`).join('\n');

	return `--- SUBREDDIT OPTIONS ---
${formatted}

`;
}

// Assemble all context components into final string
function assembleContext(components: ContextComponents): string {
	const parts = [
		components.canon, // Canon first (shared knowledge across all modes)
		components.subredditRegistry, // Subreddit registry (for Ananya - before superjournal so she sees it first)
		components.workData, // Work data for todo mode (before superjournal so Alicja sees todos first)
		components.calendar, // Calendar events (for Alicja)
		components.fitness, // Fitness log (for Alicja)
		components.whiteboard, // Active whiteboard (for Gunnar)
		components.canvas, // Designer canvases (for Eva)
		components.superjournal,
		components.files,
		components.starred,
		components.journal,
		components.highSalienceArcs,
		components.otherArcs
	].filter((part) => part.length > 0);

	return parts.join('');
}
