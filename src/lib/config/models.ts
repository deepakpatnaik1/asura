/**
 * Centralized model configuration for Asura
 *
 * DEFAULT_CONVERSATION_MODEL: Thinking variant for Call 1A/1B (user-selectable)
 * DEFAULT_COMPRESSION_MODEL: Instruct variant for Call 2A/2B, Call 3A/3B (user-selectable)
 * FILE_MODEL: Instruct variant for file processing (not user-selectable)
 */

/** Default conversation model (Call 1A/1B) - Thinking variant for reasoning */
export const DEFAULT_CONVERSATION_MODEL = 'accounts/fireworks/models/qwen3-235b-a22b' as const;

/** Default compression model (Call 2A/2B, Call 3A/3B) - Instruct variant for structured output */
export const DEFAULT_COMPRESSION_MODEL = 'accounts/fireworks/models/qwen3-235b-a22b-instruct-2507' as const;

/** File model - Qwen3 235B A22B Instruct 2507 (non-thinking, updated FP8 version) */
export const FILE_MODEL = 'accounts/fireworks/models/qwen3-235b-a22b-instruct-2507' as const;

/** Embedding model for vector search */
export const EMBEDDING_MODEL = 'voyage-3' as const;

/** Temperature setting for all models */
export const TEMPERATURE = 0.7;

/** Max tokens by use case */
export const MAX_TOKENS = {
  chat: 4000,   // Allow thinking process in conversations
  file: 1000    // No thinking needed for file compression
} as const;
