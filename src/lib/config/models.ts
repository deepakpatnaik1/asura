/**
 * Model Configuration
 *
 * Centralized model identifier defaults for Asura.
 *
 * - DEFAULT_CHAT_MODEL: Used for chat mode (conversation + compression)
 * - DEFAULT_READER_MODEL: Used for reader mode
 * - DEFAULT_WORK_MODEL: Used for work mode (Alicja)
 * - EMBEDDING_MODEL: Used for vector embeddings
 *
 * Model parameters (temperature, max_tokens) are now read from the database via model_parameters table.
 * See src/lib/config/model-params.ts for the helper function.
 */

/** Default chat model (conversation + compression) - Claude 4.5 Haiku */
export const DEFAULT_CHAT_MODEL = 'claude-haiku-4-5-20251001' as const;

/** Default reader model - Claude 4.5 Haiku */
export const DEFAULT_READER_MODEL = 'claude-haiku-4-5-20251001' as const;

/** Default work model (Alicja) - Claude 4.5 Haiku */
export const DEFAULT_WORK_MODEL = 'claude-haiku-4-5-20251001' as const;

/** Default embedding model for vector search - Voyage AI v3 (1024 dimensions) */
export const EMBEDDING_MODEL = 'voyage-3' as const;
