import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

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
	modelIdentifier: string = 'accounts/fireworks/models/qwen3-235b-a22b'
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

	// Priority 4: High-salience decision arcs (8-10)
	let highSalienceQuery = supabase
		.from('journal')
		.select('decision_arc_summary, salience_score, created_at')
		.gte('salience_score', 8);

	if (userId === null) {
		highSalienceQuery = highSalienceQuery.is('user_id', null);
	} else {
		highSalienceQuery = highSalienceQuery.eq('user_id', userId);
	}

	const { data: highSalienceData } = await highSalienceQuery
		.order('salience_score', { ascending: false })
		.order('created_at', { ascending: false });

	if (highSalienceData && highSalienceData.length > 0) {
		const highSalienceText = formatDecisionArcs(highSalienceData, 'High-Salience');
		const highSalienceTokens = estimateTokens(highSalienceText);
		if (totalTokens + highSalienceTokens <= contextBudget) {
			components.highSalienceArcs = highSalienceText;
			totalTokens += highSalienceTokens;
		}
	}

	// Priority 5: Other decision arcs (1-7) - fit as many as possible
	let otherArcsQuery = supabase
		.from('journal')
		.select('decision_arc_summary, salience_score, created_at')
		.lt('salience_score', 8);

	if (userId === null) {
		otherArcsQuery = otherArcsQuery.is('user_id', null);
	} else {
		otherArcsQuery = otherArcsQuery.eq('user_id', userId);
	}

	const { data: otherArcsData } = await otherArcsQuery
		.order('salience_score', { ascending: false })
		.order('created_at', { ascending: false });

	if (otherArcsData && otherArcsData.length > 0) {
		const remainingBudget = contextBudget - totalTokens;
		const otherArcsText = truncateArcsToFit(otherArcsData, remainingBudget);
		components.otherArcs = otherArcsText;
		totalTokens += estimateTokens(otherArcsText);
	}

	// Priority 6: File uploads (artisan cut compressed) - TODO: Implement when file upload is ready
	// components.files = await fetchFileUploads(userId);

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
		components.starred,
		components.instructions,
		components.journal,
		components.highSalienceArcs,
		components.otherArcs,
		components.files
	].filter((part) => part.length > 0);

	return parts.join('');
}
