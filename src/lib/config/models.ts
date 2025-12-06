/**
 * Model Configuration
 *
 * Centralized model identifier defaults for Asura.
 *
 * - DEFAULT_MODEL: Default model for all personas (can be overridden per-persona)
 * - EMBEDDING_MODEL: Used for vector embeddings
 *
 * Model parameters (temperature, max_tokens) are now read from the database via model_parameters table.
 * See src/lib/config/model-params.ts for the helper function.
 */

/** Default model for all personas - Claude 4.5 Haiku */
export const DEFAULT_MODEL = 'claude-haiku-4-5-20251001' as const;

/** Default embedding model for vector search - Voyage AI v3 (1024 dimensions) */
export const EMBEDDING_MODEL = 'voyage-3' as const;

// ============================================================================
// DEPRECATED - Kept for backward compatibility during migration
// ============================================================================

/** @deprecated Use DEFAULT_MODEL instead */
export const DEFAULT_CHAT_MODEL = DEFAULT_MODEL;

/** @deprecated Use DEFAULT_MODEL instead */
export const DEFAULT_READER_MODEL = DEFAULT_MODEL;

/** @deprecated Use DEFAULT_MODEL instead */
export const DEFAULT_WORK_MODEL = DEFAULT_MODEL;
