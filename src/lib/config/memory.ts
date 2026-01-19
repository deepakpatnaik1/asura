/**
 * Memory & Context Management Configuration
 *
 * Centralized constants for context window management, journal limits,
 * vector search activation, and salience scoring.
 */

export const MEMORY = {
	/**
	 * Context window usage cap (100%)
	 * Uses full model context window for injected memory.
	 * Model handles its own context limits.
	 */
	contextWindowCap: 1.0,

	/**
	 * Number of most recent journal entries to load before activating vector search
	 * When journal has <= 100 entries, load all. When > 100, load last 100 + vector search.
	 */
	lastNJournalEntries: 100,

	/**
	 * Journal entry count threshold to activate vector search
	 * Vector search only activates when journal has more than this many entries.
	 */
	vectorSearchThreshold: 100,

	/**
	 * Minimum cosine similarity score for vector search matches (0-1)
	 * Only include journal/file chunks with similarity >= this threshold.
	 */
	vectorMatchThreshold: 0.7,

	/**
	 * Salience score normalizer (divide by 10.0)
	 * Salience scores are 1-10, normalized to 0.1-1.0 for weighting.
	 */
	salienceNormalizer: 10.0,

	/**
	 * Maximum number of full conversation turns to keep in superjournal
	 * Oldest turns are automatically pruned to maintain this limit.
	 */
	superjournalLimit: 5,

	/**
	 * Maximum recursion depth for tool use in AI calls
	 * Prevents runaway tool chains from consuming unbounded memory.
	 */
	maxToolUseDepth: 15
} as const;
