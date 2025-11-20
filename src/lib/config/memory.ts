/**
 * Memory & Context Management Configuration
 *
 * Centralized constants for context window management, journal limits,
 * vector search activation, and salience scoring.
 */

export const MEMORY = {
	/**
	 * Context window usage cap (40%)
	 * Ensures we never use more than 40% of the model's context window
	 * for injected memory, leaving 60% for user input and AI response.
	 */
	contextWindowCap: 0.4,

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
	superjournalLimit: 5
} as const;
