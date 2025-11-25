# Adding a New Model

## Required: Database Tables

### 1. `models` table
```sql
INSERT INTO models (
  model_name,
  model_identifier,
  provider,
  context_window,
  max_output_tokens,
  input_price_per_million,
  output_price_per_million,
  model_type
) VALUES (
  'Claude Opus 4.5',                -- display name
  'claude-opus-4-5-20251022',       -- API identifier (use exact Anthropic ID)
  'anthropic',
  200000,
  32768,
  15,                               -- input $/M tokens
  75,                               -- output $/M tokens
  'text_generation'                 -- or 'embedding'
);
```

### 2. `model_parameters` table (one row per use_case)
```sql
-- Conversation
INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking)
VALUES ('claude-opus-4-5-20251022', 'conversation', 0.7, 4096, false, NULL);

-- Compression
INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking)
VALUES ('claude-opus-4-5-20251022', 'compression', 0.3, 2048, false, NULL);

-- Reader
INSERT INTO model_parameters (model_identifier, use_case, temperature, max_tokens, thinking_enabled, max_tokens_thinking)
VALUES ('claude-opus-4-5-20251022', 'reader', 0.7, 4096, false, NULL);
```

## Optional: Code Changes

### Change default model
Edit `src/lib/config/models.ts`:
```ts
export const DEFAULT_CONVERSATION_MODEL = 'claude-opus-4-5-20251022';
export const DEFAULT_COMPRESSION_MODEL = 'claude-opus-4-5-20251022';
export const DEFAULT_READER_MODEL = 'claude-opus-4-5-20251022';
```

## Checklist

- [ ] Get exact `model_identifier` from Anthropic docs
- [ ] Insert into `models` table
- [ ] Insert 3 rows into `model_parameters` (conversation, compression, reader)
- [ ] Update `models.ts` defaults if needed
- [ ] Test in UI: Settings dropdown shows new model
- [ ] Test: Send message with new model selected

## Common Mistakes

1. **Mismatched identifiers** - `models`, `model_parameters`, and `user_settings` must use identical strings
2. **Missing use_case** - Need all 3: conversation, compression, reader
3. **Stale user_settings** - If user has old/wrong identifier, queries fail
