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
	superjournal: string;
	files: string; // Enabled user files (artisan cuts)
	starred: string;
	instructions: string;
	journal: string;
	highSalienceArcs: string;
	otherArcs: string;
}

interface ContextStats {
	totalTokens: number;
	components: {
		superjournal: number;
		files: number;
		starred: number;
		instructions: number;
		journal: number;
		highSalienceArcs: number;
		otherArcs: number;
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
 * Builds complete context for Call 1A and Call 1B
 * Enforces 40% context window cap with priority-based truncation
 */
export async function buildContextForCalls1A1B(
	supabase: SupabaseClient,
	userId: string,
	personaName: string = DEFAULT_PERSONA,
	modelIdentifier: string,
	userQuery?: string // Optional: enables vector search (Priority 5)
): Promise<StructuredContext> {
	// Get model's context window and calculate budget
	const contextWindow = await getModelContextWindow(supabase, modelIdentifier);
	const contextBudget = Math.floor(contextWindow * MEMORY.contextWindowCap); // 40% cap

	// Initialize context components
	const components: ContextComponents = {
		superjournal: '',
		files: '',
		starred: '',
		instructions: '',
		journal: '',
		highSalienceArcs: '',
		otherArcs: ''
	};

	let totalTokens = 0;

	// Run all queries in parallel - budget checks happen during assembly
	const [
		superjournalResult,
		filesResult,
		starredResult,
		instructionsResult,
		journalResult
	] = await Promise.all([
		// Priority 1: Last N Superjournal turns (working memory)
		supabase
			.from('superjournal')
			.select('user_message, ai_response, persona_name, created_at')
			.eq('user_id', userId)
			.order('created_at', { ascending: false })
			.limit(MEMORY.superjournalLimit),

		// Priority 1.5: Enabled files (user-uploaded content)
		supabase
			.from('files')
			.select('title, artisan_cut, created_at')
			.eq('user_id', userId)
			.eq('is_enabled', true)
			.order('created_at', { ascending: false }),

		// Priority 2: Starred messages (user-curated memory)
		supabase
			.from('journal')
			.select('boss_essence, persona_essence, persona_name, created_at')
			.eq('is_starred', true)
			.eq('user_id', userId)
			.order('created_at', { ascending: false }),

		// Priority 3: Instructions (global + current persona)
		supabase
			.from('journal')
			.select('boss_essence, persona_essence, decision_arc_summary, persona_name, created_at')
			.eq('is_instruction', true)
			.eq('user_id', userId)
			.or(`instruction_scope.eq.global,instruction_scope.eq.${personaName}`)
			.order('created_at', { ascending: false }),

		// Priority 4: Last N Journal turns (recent memory)
		supabase
			.from('journal')
			.select('boss_essence, persona_essence, decision_arc_summary, persona_name, created_at')
			.eq('user_id', userId)
			.order('created_at', { ascending: false })
			.limit(MEMORY.lastNJournalEntries)
	]);

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

	// Priority 2: Starred
	if (starredResult.data && starredResult.data.length > 0) {
		const starredText = formatStarredMessages(starredResult.data.reverse());
		const starredTokens = estimateTokens(starredText);
		if (totalTokens + starredTokens <= contextBudget) {
			components.starred = starredText;
			totalTokens += starredTokens;
		}
	}

	// Priority 3: Instructions
	if (instructionsResult.data && instructionsResult.data.length > 0) {
		const instructionsText = formatInstructions(instructionsResult.data.reverse());
		const instructionsTokens = estimateTokens(instructionsText);
		if (totalTokens + instructionsTokens <= contextBudget) {
			components.instructions = instructionsText;
			totalTokens += instructionsTokens;
		}
	}

	// Priority 4: Journal (with truncation if needed)
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

	// Priority 5: Vector search (only if userQuery provided and journal count > threshold)
	if (userQuery) {
		const { count: journalCount } = await supabase
			.from('journal')
			.select('id', { count: 'exact', head: true })
			.eq('is_instruction', false)
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
							.eq('is_instruction', false)
							.eq('user_id', userId)
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
			superjournal: estimateTokens(components.superjournal),
			files: estimateTokens(components.files),
			starred: estimateTokens(components.starred),
			instructions: estimateTokens(components.instructions),
			journal: estimateTokens(components.journal),
			highSalienceArcs: estimateTokens(components.highSalienceArcs),
			otherArcs: estimateTokens(components.otherArcs)
		}
	};

	return { context: finalContext, components, stats };
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
				`[Working Memory - ${new Date(entry.created_at).toLocaleDateString()}]
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
				`[Recent Memory - ${new Date(entry.created_at).toLocaleDateString()}]
User: ${entry.boss_essence}
${entry.persona_name}: ${entry.persona_essence}`
		)
		.join('\n\n');

	return `--- RECENT MEMORY (Last ${MEMORY.lastNJournalEntries} Compressed Turns) ---\n${formatted}\n\n`;
}

// Format enabled files (artisan cuts)
function formatEnabledFiles(
	entries: Array<{
		title: string;
		artisan_cut: string;
		created_at: string;
	}>
): string {
	if (entries.length === 0) return '';

	const formatted = entries
		.map(
			(entry) =>
				`[File: ${entry.title}]
${entry.artisan_cut}`
		)
		.join('\n\n');

	return `--- ENABLED FILES (User-Uploaded Content) ---\n${formatted}\n\n`;
}

// Format starred messages
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
				`[Starred - ${new Date(entry.created_at).toLocaleDateString()}]
User: ${entry.boss_essence}
${entry.persona_name}: ${entry.persona_essence}`
		)
		.join('\n\n');

	return `--- STARRED MESSAGES (User-Pinned Memory) ---\n${formatted}\n\n`;
}

// Format instructions (behavioral directives)
function formatInstructions(
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
				`[Instruction - ${new Date(entry.created_at).toLocaleDateString()}]
User: ${entry.boss_essence}
${entry.persona_name}: ${entry.persona_essence}`
		)
		.join('\n\n');

	return `--- BEHAVIORAL INSTRUCTIONS (Persistent Directives) ---\n${formatted}\n\n`;
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
				`[Relevant Memory - ${new Date(entry.created_at).toLocaleDateString()}]
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


// Assemble all context components into final string
function assembleContext(components: ContextComponents): string {
	const parts = [
		components.superjournal,
		components.files, // After superjournal, before starred
		components.starred,
		components.instructions,
		components.journal,
		components.highSalienceArcs,
		components.otherArcs
	].filter((part) => part.length > 0);

	return parts.join('');
}
