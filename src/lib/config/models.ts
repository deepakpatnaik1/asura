/**
 * Model Configuration
 *
 * Centralized model identifier defaults for Asura.
 *
 * - DEFAULT_CONVERSATION_MODEL: Used for Call 1A/1B (user-selectable via Settings)
 * - DEFAULT_COMPRESSION_MODEL: Used for Call 2A/2B, Call 3A/3B, Modified Call 2A/2B (user-selectable via Settings)
 * - DEFAULT_READER_MODEL: Used for e-reader article processing (user-selectable via Settings)
 * - EMBEDDING_MODEL: Used for vector embeddings (user-selectable via Settings)
 *
 * Model parameters (temperature, max_tokens) are now read from the database via model_parameters table.
 * See src/lib/config/model-params.ts for the helper function.
 */

/** Default conversation model (Call 1A/1B) - Claude 4.5 Haiku */
export const DEFAULT_CONVERSATION_MODEL = 'claude-haiku-4-5' as const;

/** Default compression model (Call 2A/2B, Call 3A/3B, Modified Call 2A/2B) - Claude 4.5 Haiku */
export const DEFAULT_COMPRESSION_MODEL = 'claude-haiku-4-5' as const;

/** Default e-reader model - Claude 4.5 Haiku */
export const DEFAULT_READER_MODEL = 'claude-haiku-4-5' as const;

/** Default embedding model for vector search - Voyage AI v3 (1024 dimensions) */
export const EMBEDDING_MODEL = 'voyage-3' as const;
