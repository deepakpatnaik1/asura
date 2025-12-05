import { VOYAGE_API_KEY } from '$env/static/private';
import { VoyageAIClient } from 'voyageai';
import { EMBEDDING_MODEL } from '$lib/config/models';
import { MEMORY } from '$lib/config/memory';
import { DEFAULT_PERSONA } from '$lib/config/personas';
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
 * For reader mode with contentId: simplified context (superjournal only for that content)
 * For chat mode or reader without contentId: full context (all 6 queries)
 */
export async function buildContext(
	supabase: SupabaseClient,
	userId: string,
	personaName: string = DEFAULT_PERSONA,
	modelIdentifier: string,
	userQuery?: string, // Optional: enables vector search (Priority 5)
	mode: string = 'chat', // Conversation space: 'chat' or 'reader'
	contentId?: string // For reader mode: filter to specific content
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

	// Priority 0: Canon content (always injected, ignores mode)
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

	// Reader mode with contentId: content-centric context
	// Samara sees the article content + conversation history about that article
	if (mode === 'reader' && contentId) {
		// Fetch article content, conversation history, and starred items in parallel
		const [contentResult, superjournalResult, starredSuperjournalResult] =
			await Promise.all([
				// Fetch the actual article content
				supabase
					.from('content')
					.select('title, raw_content, artisan_cut')
					.eq('id', contentId)
					.eq('user_id', userId)
					.single(),
				// Fetch conversation history for this article
				supabase
					.from('superjournal')
					.select('user_message, ai_response, persona_name, created_at')
					.eq('user_id', userId)
					.eq('mode', 'reader')
					.eq('content_id', contentId)
					.order('created_at', { ascending: false })
					.limit(MEMORY.superjournalLimit),
				// Starred from superjournal (reader mode stars only - mode separation)
				supabase
					.from('superjournal')
					.select('user_message, ai_response, persona_name, created_at')
					.eq('is_starred', true)
					.eq('user_id', userId)
					.eq('mode', 'reader')
					.order('created_at', { ascending: false })
			]);

		// Include the article content (prefer artisan_cut if available, else raw_content)
		if (contentResult.data) {
			const articleContent = contentResult.data.artisan_cut || contentResult.data.raw_content;
			if (articleContent) {
				const filesText = `--- CURRENT ARTICLE ---\n[${contentResult.data.title}]\n${articleContent}\n\n`;
				components.files = filesText;
				totalTokens += estimateTokens(filesText);
			}
		}

		// Include conversation history
		if (superjournalResult.data && superjournalResult.data.length > 0) {
			const superjournalText = formatSuperjournalHistory(superjournalResult.data.reverse());
			components.superjournal = superjournalText;
			totalTokens += estimateTokens(superjournalText);
		}

		// Include starred items (reader mode only - mode separation)
		const superjournalStars = starredSuperjournalResult.data || [];
		if (superjournalStars.length > 0) {
			const starredText = formatReaderStarred(superjournalStars);
			components.starred = starredText;
			totalTokens += estimateTokens(starredText);
		}

		const finalContext = assembleContext(components);
		return {
			context: finalContext,
			components,
			stats: {
				totalTokens,
				components: {
					canon: estimateTokens(components.canon),
					superjournal: estimateTokens(components.superjournal),
					files: estimateTokens(components.files),
					starred: estimateTokens(components.starred),
					journal: 0,
					highSalienceArcs: 0,
					otherArcs: 0,
					workData: 0
				}
			}
		};
	}

	// Full context for chat mode (or reader without contentId)
	// Run all queries in parallel - budget checks happen during assembly
	const [
		superjournalResult,
		filesResult,
		starredJournalResult,
		journalResult
	] = await Promise.all([
		// Priority 1: Last N Superjournal turns (working memory)
		supabase
			.from('superjournal')
			.select('user_message, ai_response, persona_name, created_at')
			.eq('user_id', userId)
			.eq('mode', mode)
			.order('created_at', { ascending: false })
			.limit(MEMORY.superjournalLimit),

		// Priority 1.5: Enabled files (user-uploaded content)
		supabase
			.from('content')
			.select('title, artisan_cut, raw_content, created_at')
			.eq('user_id', userId)
			.eq('mode', mode)
			.eq('is_enabled', true)
			.order('created_at', { ascending: false }),

		// Priority 2: Starred from journal (chat mode stars only - mode separation)
		supabase
			.from('journal')
			.select('boss_essence, persona_essence, persona_name, created_at')
			.eq('is_starred', true)
			.eq('user_id', userId)
			.eq('mode', mode)
			.order('created_at', { ascending: false }),

		// Priority 3: Last N Journal turns (recent memory)
		supabase
			.from('journal')
			.select('boss_essence, persona_essence, decision_arc_summary, persona_name, created_at')
			.eq('user_id', userId)
			.eq('mode', mode)
			.order('created_at', { ascending: false })
			.limit(MEMORY.lastNJournalEntries)
	]);

	// Priority 0.5: Work data for todo mode (all todos, all diary, all tags)
	if (mode === 'todo') {
		const [todosResult, tagsResult, diaryResult] = await Promise.all([
			// All todos (open + completed) for pattern recognition
			supabase
				.from('todos')
				.select('id, description, tags, status, created_at, completed_at, scheduled_for, times_pushed')
				.eq('user_id', userId)
				.order('created_at', { ascending: true }),
			// All tags
			supabase
				.from('tags')
				.select('name')
				.eq('user_id', userId)
				.order('name', { ascending: true }),
			// All diary entries for emotional arc
			supabase
				.from('founder_diary')
				.select('id, description, tags, logged_at')
				.eq('user_id', userId)
				.order('logged_at', { ascending: true })
		]);

		const workDataText = formatWorkData(
			todosResult.data || [],
			(tagsResult.data || []).map(t => t.name),
			diaryResult.data || []
		);
		components.workData = workDataText;
		totalTokens += estimateTokens(workDataText);
	}

	// Assemble context with budget checks (in priority order)

	// Priority 1: Superjournal (always included - highest priority)
	if (superjournalResult.data && superjournalResult.data.length > 0) {
		const superjournalText = formatSuperjournalHistory(superjournalResult.data.reverse());
		components.superjournal = superjournalText;
		totalTokens += estimateTokens(superjournalText);
	}

	// Priority 1.5: Files
	if (filesResult.data && filesResult.data.length > 0) {
		const filesText = formatEnabledFiles(filesResult.data);
		const filesTokens = estimateTokens(filesText);
		if (totalTokens + filesTokens <= contextBudget) {
			components.files = filesText;
			totalTokens += filesTokens;
		}
	}

	// Priority 2: Starred (chat mode: journal stars only - mode separation)
	if (starredJournalResult.data && starredJournalResult.data.length > 0) {
		const starredText = formatStarredMessages(starredJournalResult.data);
		const starredTokens = estimateTokens(starredText);
		if (totalTokens + starredTokens <= contextBudget) {
			components.starred = starredText;
			totalTokens += starredTokens;
		}
	}

	// Priority 3: Journal (with truncation if needed)
	if (journalResult.data && journalResult.data.length > 0) {
		const journalData = journalResult.data.reverse();
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

	// Priority 4: Vector search (only if userQuery provided and journal count > threshold)
	if (userQuery) {
		const { count: journalCount } = await supabase
			.from('journal')
			.select('id', { count: 'exact', head: true })
			.eq('user_id', userId)
			.eq('mode', mode);

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
							.eq('mode', mode)
							.order('created_at', { ascending: false })
							.limit(MEMORY.superjournalLimit),
						supabase
							.from('journal')
							.select('id')
							.eq('user_id', userId)
							.eq('mode', mode)
							.order('created_at', { ascending: false })
							.limit(MEMORY.lastNJournalEntries)
					]);

					const excludeIds: string[] = [];

					if (journalIdsResult.data) {
						excludeIds.push(...journalIdsResult.data.map(j => j.id));
					}

					if (superjournalIdsResult.data && superjournalIdsResult.data.length > 0) {
						const sjIds = superjournalIdsResult.data.map(s => s.id);
						const { data: journalFromSj } = await supabase
							.from('journal')
							.select('id')
							.in('superjournal_id', sjIds);

						if (journalFromSj) {
							excludeIds.push(...journalFromSj.map(j => j.id));
						}
					}

					// Perform vector search
					const { data: vectorResults } = await supabase.rpc('search_journal_by_embedding', {
						query_embedding: JSON.stringify(queryVector),
						match_count: 50,
						exclude_ids: excludeIds,
						user_id_filter: userId,
						mode_filter: mode
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

// Format enabled files (artisan cuts, or raw content for ephemeral)
function formatEnabledFiles(
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
			return `[File: ${entry.title}]\n${content}`;
		})
		.join('\n\n');

	return `--- ENABLED FILES (User-Uploaded Content) ---\n${formatted}\n\n`;
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

// Format reader starred messages (reader mode: from superjournal)
function formatReaderStarred(
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
				`[Starred - ${formatTimestamp(entry.created_at)}]
User: ${entry.user_message}`
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


// Format decision arcs
function formatDecisionArcs(
	entries: Array<{ decision_arc_summary: string; salience_score: number; created_at: string }>,
	label: string
): string {
	if (entries.length === 0) return '';

	const formatted = entries
		.map((entry) => `[${entry.salience_score}] ${entry.decision_arc_summary}`)
		.join('\n');

	return `--- ${label.toUpperCase()} DECISION ARCS ---\n${formatted}\n\n`;
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

// Truncate decision arcs to fit within token budget
function truncateArcsToFit(
	entries: Array<{ decision_arc_summary: string; salience_score: number; created_at: string }>,
	tokenBudget: number
): string {
	let accumulatedText = '';
	const includedArcs = [];

	for (const entry of entries) {
		const arcLine = `[${entry.salience_score}] ${entry.decision_arc_summary}\n`;
		if (estimateTokens(accumulatedText + arcLine) > tokenBudget) {
			break;
		}
		includedArcs.push(entry);
		accumulatedText += arcLine;
	}

	return includedArcs.length > 0
		? `--- OTHER DECISION ARCS (Salience 1-7) ---\n${accumulatedText}\n`
		: '';
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
