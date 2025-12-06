import { VOYAGE_API_KEY } from '$env/static/private';
import { VoyageAIClient } from 'voyageai';
import { EMBEDDING_MODEL } from '$lib/config/models';
import { MEMORY } from '$lib/config/memory';
import { DEFAULT_PERSONA, personaHasContextChunk } from '$lib/config/personas';
import type { SupabaseClient } from '@supabase/supabase-js';

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
 * Enforces 40% context window cap with priority-based truncation
 *
 * Context injection is config-driven via persona.contextChunks:
 * - working: Last N superjournal turns (unified across all personas)
 * - recent: Compressed journal summaries
 * - semantic: Vector search results
 * - canon: is_canon=true content (always included)
 * - active: Currently selected content (via contentId)
 * - todos, diary, tags, time: Productivity data
 */
export async function buildContext(
	supabase: SupabaseClient,
	userId: string,
	personaName: string = DEFAULT_PERSONA,
	modelIdentifier: string,
	userQuery?: string, // Optional: enables vector search
	contentId?: string // Currently selected content from library
): Promise<StructuredContext> {
	// Get model's context window and calculate budget
	const contextWindow = await getModelContextWindow(supabase, modelIdentifier);
	const contextBudget = Math.floor(contextWindow * MEMORY.contextWindowCap); // 40% cap

	// Initialize context components
	const components: ContextComponents = {
		canon: '',
		superjournal: '',
		files: '',
		starred: '',
		journal: '',
		highSalienceArcs: '',
		otherArcs: '',
		workData: ''
	};

	let totalTokens = 0;

	// Helper to check if persona wants a chunk
	const hasChunk = (chunk: Parameters<typeof personaHasContextChunk>[1]) =>
		personaHasContextChunk(personaName, chunk);

	// Priority 0: Canon content (always injected if persona has 'canon' chunk)
	if (hasChunk('canon')) {
		const { data: canonData } = await supabase
			.from('content')
			.select('title, artisan_cut, raw_content, created_at')
			.eq('user_id', userId)
			.eq('is_canon', true)
			.order('created_at', { ascending: true });

		if (canonData && canonData.length > 0) {
			const canonText = formatCanonContent(canonData);
			components.canon = canonText;
			totalTokens += estimateTokens(canonText);
		}
	}

	// Priority 0.5: Active content (currently selected file from library)
	if (hasChunk('active') && contentId) {
		const { data: contentData } = await supabase
			.from('content')
			.select('title, raw_content, artisan_cut')
			.eq('id', contentId)
			.eq('user_id', userId)
			.single();

		if (contentData) {
			const articleContent = contentData.artisan_cut || contentData.raw_content;
			if (articleContent) {
				const filesText = `--- ACTIVE CONTENT ---\n[${contentData.title}]\n${articleContent}\n\n`;
				components.files = filesText;
				totalTokens += estimateTokens(filesText);
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
						.from('todos')
						.select('id, description, tags, status, created_at, completed_at, scheduled_for, times_pushed')
						.eq('user_id', userId)
						.order('created_at', { ascending: true })
				: Promise.resolve({ data: [] }),
			wantsTags
				? supabase
						.from('tags')
						.select('name')
						.eq('user_id', userId)
						.order('name', { ascending: true })
				: Promise.resolve({ data: [] }),
			wantsDiary
				? supabase
						.from('founder_diary')
						.select('id, description, tags, logged_at')
						.eq('user_id', userId)
						.order('logged_at', { ascending: true })
				: Promise.resolve({ data: [] })
		]);

		// Use Gunnar-style formatting (pre-computed analytics) for personas with tools
		// Use Alicja-style formatting (with IDs) for personas that need to operate on data
		const personaHasTools = hasChunk('todos') && personaHasContextChunk(personaName, 'calendar');
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

	// Priority 2: Starred messages (user's standing instructions)
	if (hasChunk('starred')) {
		queries.push(
			supabase
				.from('journal')
				.select('boss_essence, persona_essence, persona_name, created_at')
				.eq('is_starred', true)
				.eq('user_id', userId)
				.order('created_at', { ascending: false })
		);
		queryKeys.push('starred');
	}

	// Priority 3: Recent memory (journal)
	if (hasChunk('recent')) {
		queries.push(
			supabase
				.from('journal')
				.select('boss_essence, persona_essence, decision_arc_summary, persona_name, created_at')
				.eq('user_id', userId)
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

					// Perform vector search (no mode filter - unified search)
					const { data: vectorResults } = await supabase.rpc('search_journal_by_embedding', {
						query_embedding: JSON.stringify(queryVector),
						match_count: 50,
						exclude_ids: excludeIds,
						user_id_filter: userId
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
			workData: estimateTokens(components.workData)
		}
	};

	return { context: finalContext, components, stats };
}

// Format timestamp for context (ISO 8601 format for precise temporal reasoning)
function formatTimestamp(dateString: string): string {
	return new Date(dateString).toISOString();
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
User: ${entry.boss_essence}`
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

// Format duration between two dates as human-readable string
function formatDuration(from: Date, to: Date): string {
	const diffMs = to.getTime() - from.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMins / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffDays > 0) {
		const remainingHours = diffHours % 24;
		return remainingHours > 0 ? `${diffDays}d ${remainingHours}h` : `${diffDays}d`;
	}
	if (diffHours > 0) {
		const remainingMins = diffMins % 60;
		return remainingMins > 0 ? `${diffHours}h ${remainingMins}m` : `${diffHours}h`;
	}
	return `${diffMins}m`;
}

// Format work data for Gunnar (chat mode) - pre-computed time analytics
function formatWorkDataForGunnar(
	todos: Array<{
		id: string;
		description: string;
		tags: string[];
		status: string;
		created_at: string;
		completed_at: string | null;
		scheduled_for: string | null;
		times_pushed: number;
	}>,
	tags: string[],
	diary: Array<{
		id: string;
		description: string;
		tags: string[];
		logged_at: string;
	}>
): string {
	const now = new Date();

	// Format todos with computed durations
	const formattedTodos = todos.map((t) => {
		const createdAt = new Date(t.created_at);
		const age = formatDuration(createdAt, now);

		if (t.status === 'completed' && t.completed_at) {
			const completedAt = new Date(t.completed_at);
			const timeToComplete = formatDuration(createdAt, completedAt);
			const completedAgo = formatDuration(completedAt, now);
			return {
				description: t.description,
				tags: t.tags,
				status: 'completed',
				completed_ago: completedAgo,
				time_to_complete: timeToComplete,
				times_pushed: t.times_pushed
			};
		} else {
			return {
				description: t.description,
				tags: t.tags,
				status: 'open',
				age: age,
				scheduled_for: t.scheduled_for,
				times_pushed: t.times_pushed
			};
		}
	});

	// Format diary entries with time since logged
	const formattedDiary = diary.map((d) => {
		const loggedAt = new Date(d.logged_at);
		const loggedAgo = formatDuration(loggedAt, now);
		return {
			description: d.description,
			tags: d.tags,
			logged_ago: loggedAgo
		};
	});

	const todosJson = JSON.stringify(formattedTodos, null, 2);
	const diaryJson = JSON.stringify(formattedDiary, null, 2);
	const tagsJson = JSON.stringify(tags);

	return `--- PRODUCTIVITY DATA (From Alicja - Pre-computed Analytics) ---
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

// Format work data (todos, tags, and diary) for todo mode context
function formatWorkData(
	todos: Array<{
		id: string;
		description: string;
		tags: string[];
		status: string;
		created_at: string;
		completed_at: string | null;
		scheduled_for: string | null;
		times_pushed: number;
	}>,
	tags: string[],
	diary: Array<{
		id: string;
		description: string;
		tags: string[];
		logged_at: string;
	}>
): string {
	const currentTime = new Date().toISOString();

	const todosJson = JSON.stringify(
		todos.map((t) => ({
			id: t.id,
			description: t.description,
			tags: t.tags,
			status: t.status,
			created_at: t.created_at,
			completed_at: t.completed_at,
			scheduled_for: t.scheduled_for,
			times_pushed: t.times_pushed
		})),
		null,
		2
	);

	const diaryJson = JSON.stringify(
		diary.map((d) => ({
			id: d.id,
			description: d.description,
			tags: d.tags,
			logged_at: d.logged_at
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

// Assemble all context components into final string
function assembleContext(components: ContextComponents): string {
	const parts = [
		components.canon, // Canon first (shared knowledge across all modes)
		components.workData, // Work data for todo mode (before superjournal so Alicja sees todos first)
		components.superjournal,
		components.files,
		components.starred,
		components.journal,
		components.highSalienceArcs,
		components.otherArcs
	].filter((part) => part.length > 0);

	return parts.join('');
}
