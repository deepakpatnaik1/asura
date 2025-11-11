import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { VOYAGE_API_KEY } from '$env/static/private';
import { VoyageAIClient } from 'voyageai';

const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
const voyage = new VoyageAIClient({ apiKey: VOYAGE_API_KEY });

// Token estimation (rough approximation: 1 token ≈ 4 characters)
function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

// Fetch model context window from database
async function getModelContextWindow(modelIdentifier: string): Promise<number> {
	const { data, error } = await supabase
		.from('models')
		.select('context_window')
		.eq('model_identifier', modelIdentifier)
		.single();

	if (error || !data) {
		console.warn('Failed to fetch model context window, using default 131072');
		return 131072; // Default to Qwen3-235B context window
	}

	return data.context_window;
}

interface ContextComponents {
	superjournal: string;
	starred: string;
	instructions: string;
	journal: string;
	highSalienceArcs: string;
	otherArcs: string;
	files: string;
}

interface ContextStats {
	totalTokens: number;
	components: {
		superjournal: number;
		starred: number;
		instructions: number;
		journal: number;
		highSalienceArcs: number;
		otherArcs: number;
		files: number;
	};
}

/**
 * Builds complete context for Call 1A and Call 1B
 * Enforces 40% context window cap with priority-based truncation
 */
export async function buildContextForCalls1A1B(
	userId: string | null,
	personaName: string = 'ananya',
	modelIdentifier: string = 'accounts/fireworks/models/qwen3-235b-a22b',
	userQuery?: string // Optional: enables vector search (Priority 5)
): Promise<{ context: string; stats: ContextStats }> {
	// Get model's context window and calculate budget
	const contextWindow = await getModelContextWindow(modelIdentifier);
	const contextBudget = Math.floor(contextWindow * 0.4); // 40% cap

	// Initialize context components
	const components: ContextComponents = {
		superjournal: '',
		starred: '',
		instructions: '',
		journal: '',
		highSalienceArcs: '',
		otherArcs: '',
		files: ''
	};

	let totalTokens = 0;

	// Priority 1: Last 5 Superjournal turns (working memory - highest priority)
	let superjournalQuery = supabase
		.from('superjournal')
		.select('user_message, ai_response, persona_name, created_at');

	if (userId === null) {
		superjournalQuery = superjournalQuery.is('user_id', null);
	} else {
		superjournalQuery = superjournalQuery.eq('user_id', userId);
	}

	const { data: superjournalData } = await superjournalQuery
		.order('created_at', { ascending: false })
		.limit(5);

	if (superjournalData && superjournalData.length > 0) {
		const superjournalText = formatSuperjournalHistory(superjournalData.reverse()); // Oldest first
		components.superjournal = superjournalText;
		totalTokens += estimateTokens(superjournalText);
	}

	// Priority 2: Starred messages (user-curated memory)
	let starredQuery = supabase
		.from('superjournal')
		.select('user_message, ai_response, persona_name, created_at')
		.eq('is_starred', true);

	if (userId === null) {
		starredQuery = starredQuery.is('user_id', null);
	} else {
		starredQuery = starredQuery.eq('user_id', userId);
	}

	const { data: starredData } = await starredQuery.order('created_at', { ascending: false });

	if (starredData && starredData.length > 0) {
		const starredText = formatStarredMessages(starredData.reverse()); // Oldest first
		const starredTokens = estimateTokens(starredText);
		if (totalTokens + starredTokens <= contextBudget) {
			components.starred = starredText;
			totalTokens += starredTokens;
		}
	}

	// Priority 3: Instructions (global + current persona behavioral directives)
	let instructionsQuery = supabase
		.from('journal')
		.select('boss_essence, persona_essence, decision_arc_summary, persona_name, created_at')
		.eq('is_instruction', true);

	if (userId === null) {
		instructionsQuery = instructionsQuery.is('user_id', null);
	} else {
		instructionsQuery = instructionsQuery.eq('user_id', userId);
	}

	const { data: instructionsData } = await instructionsQuery
		.or(`instruction_scope.eq.global,instruction_scope.eq.${personaName}`)
		.order('created_at', { ascending: false });

	if (instructionsData && instructionsData.length > 0) {
		const instructionsText = formatInstructions(instructionsData.reverse()); // Oldest first
		const instructionsTokens = estimateTokens(instructionsText);
		if (totalTokens + instructionsTokens <= contextBudget) {
			components.instructions = instructionsText;
			totalTokens += instructionsTokens;
		}
	}

	// Priority 4: Last 100 Journal turns (recent memory)
	let journalQuery = supabase
		.from('journal')
		.select('boss_essence, persona_essence, decision_arc_summary, persona_name, created_at');

	if (userId === null) {
		journalQuery = journalQuery.is('user_id', null);
	} else {
		journalQuery = journalQuery.eq('user_id', userId);
	}

	const { data: journalData } = await journalQuery
		.order('created_at', { ascending: false })
		.limit(100);

	if (journalData && journalData.length > 0) {
		const journalText = formatJournalHistory(journalData.reverse()); // Oldest first
		const journalTokens = estimateTokens(journalText);
		if (totalTokens + journalTokens <= contextBudget) {
			components.journal = journalText;
			totalTokens += journalTokens;
		} else {
			// Truncate journal entries to fit budget
			const truncatedJournal = truncateToFit(
				journalData.reverse(),
				contextBudget - totalTokens,
				formatJournalHistory
			);
			components.journal = truncatedJournal;
			totalTokens += estimateTokens(truncatedJournal);
		}
	}

	// Priority 5: Vector search results (only if userQuery provided and journal count > 100)
	if (userQuery) {
		// Check journal count first
		let countQuery = supabase
			.from('journal')
			.select('id', { count: 'exact', head: true })
			.eq('is_instruction', false);

		if (userId === null) {
			countQuery = countQuery.is('user_id', null);
		} else {
			countQuery = countQuery.eq('user_id', userId);
		}

		const { count: journalCount } = await countQuery;

		if (journalCount && journalCount > 100) {
			try {
				// Generate embedding for user query
				console.log('[Context Builder] Generating query embedding for vector search');
				const queryEmbedding = await voyage.embed({
					input: userQuery,
					model: 'voyage-3' // 1024 dimensions
				});

				const queryVector = queryEmbedding.data[0].embedding;

				// Collect IDs to exclude (already loaded in Priorities 1-4)
				const excludeIds: string[] = [];

				// Get last 5 Superjournal IDs
				let superjournalExcludeQuery = supabase
					.from('superjournal')
					.select('id');

				if (userId === null) {
					superjournalExcludeQuery = superjournalExcludeQuery.is('user_id', null);
				} else {
					superjournalExcludeQuery = superjournalExcludeQuery.eq('user_id', userId);
				}

				const { data: superjournalIds } = await superjournalExcludeQuery
					.order('created_at', { ascending: false })
					.limit(5);

				// Get corresponding Journal IDs via Superjournal IDs
				if (superjournalIds && superjournalIds.length > 0) {
					const sjIds = superjournalIds.map(s => s.id);
					const { data: journalFromSj } = await supabase
						.from('journal')
						.select('id')
						.in('superjournal_id', sjIds);

					if (journalFromSj) {
						excludeIds.push(...journalFromSj.map(j => j.id));
					}
				}

				// Get last 100 Journal IDs
				let journalExcludeQuery = supabase
					.from('journal')
					.select('id')
					.eq('is_instruction', false);

				if (userId === null) {
					journalExcludeQuery = journalExcludeQuery.is('user_id', null);
				} else {
					journalExcludeQuery = journalExcludeQuery.eq('user_id', userId);
				}

				const { data: last100Ids } = await journalExcludeQuery
					.order('created_at', { ascending: false })
					.limit(100);

				if (last100Ids) {
					excludeIds.push(...last100Ids.map(j => j.id));
				}

				// Perform vector search with salience weighting
				// Note: pgvector doesn't support complex expressions in ORDER BY
				// So we'll fetch top 50 by similarity and re-rank in app code
				const { data: vectorResults } = await supabase.rpc('search_journal_by_embedding', {
					query_embedding: JSON.stringify(queryVector),
					match_count: 50,
					exclude_ids: excludeIds,
					user_id_filter: userId
				});

				if (vectorResults && vectorResults.length > 0) {
					// Re-rank by weighted score: similarity × (salience/10)
					const reranked = vectorResults
						.map((entry: any) => ({
							...entry,
							weighted_score: entry.similarity * (entry.salience_score / 10.0)
						}))
						.sort((a: any, b: any) => b.weighted_score - a.weighted_score)
						.slice(0, 10); // Top 10

					// Format vector search results
					const vectorText = formatVectorSearchResults(reranked);
					const vectorTokens = estimateTokens(vectorText);

					if (totalTokens + vectorTokens <= contextBudget) {
						components.highSalienceArcs = vectorText; // Reuse highSalienceArcs component
						totalTokens += vectorTokens;
					}

					console.log('[Context Builder] Vector search loaded', reranked.length, 'results');
				}
			} catch (vectorError) {
				console.error('[Context Builder] Vector search error:', vectorError);
			}
		} else {
			console.log('[Context Builder] Skipping vector search (journal count <=100)');
		}
	}

	// Priority 6: File uploads (Artisan Cut compressed descriptions from user's ready files)
	const readyFiles = await fetchReadyFiles(userId);

	if (readyFiles.length > 0) {
		// Greedily pack files into remaining budget
		const includedFiles = [];
		let filesTokens = 0;

		for (const file of readyFiles) {
			const formattedFile = formatFileForContext(file);
			const fileSize = estimateTokens(formattedFile);

			if (totalTokens + filesTokens + fileSize <= contextBudget) {
				includedFiles.push(file);
				filesTokens += fileSize;
			} else {
				break; // Budget exhausted
			}
		}

		if (includedFiles.length > 0) {
			components.files = formatFilesForContext(includedFiles);
			totalTokens += filesTokens;
		}
	}

	// Assemble final context
	const finalContext = assembleContext(components);

	// Calculate component stats
	const stats: ContextStats = {
		totalTokens,
		components: {
			superjournal: estimateTokens(components.superjournal),
			starred: estimateTokens(components.starred),
			instructions: estimateTokens(components.instructions),
			journal: estimateTokens(components.journal),
			highSalienceArcs: estimateTokens(components.highSalienceArcs),
			otherArcs: estimateTokens(components.otherArcs),
			files: estimateTokens(components.files)
		}
	};

	console.log('[Context Builder] Stats:', {
		totalTokens,
		budget: contextBudget,
		utilization: `${((totalTokens / contextBudget) * 100).toFixed(1)}%`,
		components: stats.components
	});

	return { context: finalContext, stats };
}

// Format Superjournal history (last 5 full turns)
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

	return `--- WORKING MEMORY (Last 5 Full Turns) ---\n${formatted}\n\n`;
}

// Format Journal history (last 100 compressed turns)
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
${entry.persona_name}: ${entry.persona_essence}
Arc: ${entry.decision_arc_summary}`
		)
		.join('\n\n');

	return `--- RECENT MEMORY (Last 100 Compressed Turns) ---\n${formatted}\n\n`;
}

// Format starred messages
function formatStarredMessages(
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
				`[Starred - ${new Date(entry.created_at).toLocaleDateString()}]
User: ${entry.user_message}
${entry.persona_name}: ${entry.ai_response}`
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
${entry.persona_name}: ${entry.persona_essence}
Arc: ${entry.decision_arc_summary}`
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
				`[Relevant Memory - ${new Date(entry.created_at).toLocaleDateString()} - Salience: ${entry.salience_score}]
User: ${entry.boss_essence}
AI: ${entry.persona_essence}
Arc: ${entry.decision_arc_summary}`
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

/**
 * Fetch ready files for a user, ordered by newest first
 */
async function fetchReadyFiles(userId: string | null): Promise<
	Array<{
		filename: string;
		file_type: string;
		description: string | null;
	}>
> {
	let query = supabase
		.from('files')
		.select('filename, file_type, description')
		.eq('status', 'ready')
		.order('uploaded_at', { ascending: false });

	if (userId === null) {
		query = query.is('user_id', null);
	} else {
		query = query.eq('user_id', userId);
	}

	const { data, error } = await query;

	if (error) {
		console.warn('[Context Builder] Failed to fetch ready files:', error);
		return [];
	}

	return data || [];
}

/**
 * Format a single file for context injection
 * Assumes: files with status='ready' always have descriptions
 * (null descriptions are skipped as safety measure against incomplete processing)
 * Format: ## [filename] (file_type)
 * [description]
 *
 */
function formatFileForContext(file: {
	filename: string;
	file_type: string;
	description: string | null;
}): string {
	if (!file.description) {
		// Skip files with no description (shouldn't happen with ready status, but safe)
		return '';
	}

	return `## ${file.filename} (${file.file_type})\n${file.description}\n\n`;
}

/**
 * Format multiple files for context injection
 * Includes header and count summary
 */
function formatFilesForContext(
	files: Array<{
		filename: string;
		file_type: string;
		description: string | null;
	}>
): string {
	if (files.length === 0) {
		return '';
	}

	const filesText = files.map((f) => formatFileForContext(f)).join('');

	return `--- UPLOADED FILES (${files.length} file${files.length === 1 ? '' : 's'} in context) ---\n${filesText}`;
}

// Assemble all context components into final string
function assembleContext(components: ContextComponents): string {
	const parts = [
		components.superjournal,
		components.starred,
		components.instructions,
		components.journal,
		components.highSalienceArcs,
		components.otherArcs,
		components.files
	].filter((part) => part.length > 0);

	return parts.join('');
}
