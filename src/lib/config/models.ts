/**
 * Model Configuration
 *
 * Centralized model identifier defaults for Asura.
 *
 * - DEFAULT_CONVERSATION_MODEL: Used for Call 1A/1B (user-selectable via Settings)
 * - DEFAULT_COMPRESSION_MODEL: Used for Call 2A/2B, Call 3A/3B, Modified Call 2A/2B (user-selectable via Settings)
 * - EMBEDDING_MODEL: Used for vector embeddings (user-selectable via Settings)
 *
 * Note: TEMPERATURE and MAX_TOKENS are deprecated and will be removed in Chunk 3.
 * They remain here temporarily to avoid breaking existing imports during config migration.
 */

/** Default conversation model (Call 1A/1B) - Claude Sonnet 4.5 for premium quality */
export const DEFAULT_CONVERSATION_MODEL = 'claude-sonnet-4-5-20250929' as const;

/** Default compression model (Call 2A/2B, Call 3A/3B, Modified Call 2A/2B) - Claude Sonnet 4.5 for structured output */
export const DEFAULT_COMPRESSION_MODEL = 'claude-sonnet-4-5-20250929' as const;

/** Default embedding model for vector search - Voyage AI v3 (1024 dimensions) */
export const EMBEDDING_MODEL = 'voyage-3' as const;

// ============================================================================
// DEPRECATED - TO BE REMOVED IN CHUNK 3
// ============================================================================

/** @deprecated Read from models table instead (will be removed in Chunk 3) */
export const TEMPERATURE = 0.7;

/** @deprecated Read from models table instead (will be removed in Chunk 3) */
export const MAX_TOKENS = {
	chat: 4000, // Allow thinking process in conversations
	file: 1000 // No thinking needed for file compression
} as const;
