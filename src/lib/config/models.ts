/**
 * Centralized model configuration for Asura
 *
 * CHAT_MODEL: Uses thinking variant (qwen3-235b-a22b) for deep reasoning in conversations
 * FILE_MODEL: Uses regular variant (qwen3-235b) for fast pattern matching in file processing
 */

/** Chat model - Thinking variant for Call 1A/1B reasoning */
export const CHAT_MODEL = 'accounts/fireworks/models/qwen3-235b-a22b' as const;

/** File model - Same as chat model but with /nothink directive to disable thinking */
export const FILE_MODEL = 'accounts/fireworks/models/qwen3-235b-a22b' as const;

/** Embedding model for vector search */
export const EMBEDDING_MODEL = 'voyage-3' as const;

/** Temperature setting for all models */
export const TEMPERATURE = 0.7;

/** Max tokens by use case */
export const MAX_TOKENS = {
  chat: 4000,   // Allow thinking process in conversations
  file: 1000    // No thinking needed for file compression
} as const;
