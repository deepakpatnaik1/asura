# Dual Model Selection: Architecture Plan

**Created:** 2025-11-17
**Status:** Planning
**Branch:** TBD (separate from file-processing-refactor)

## Problem Statement

Current system hardcodes compression model choice. As new models release (Qwen4, DeepSeek v3, etc.), users need flexibility to:
1. Choose **conversation model** (Call 1A/1B) - optimized for reasoning
2. Choose **compression model** (Call 2A/2B, Call 3A/3B) - optimized for structured output

**Current limitation:** Single dropdown only controls conversation model. Compression model is hardcoded.

## Solution: Nested Model Dropdown

Single dropdown with two sections:

```
┌─────────────────────────────────┐
│ Model ▼                         │
├─────────────────────────────────┤
│ CONVERSATION MODELS             │
│ ○ Qwen3 235B (thinking)         │
│ ○ Claude Sonnet 4.5             │
│ ○ DeepSeek v3                   │
│                                 │
│ COMPRESSION MODELS              │
│ ○ Qwen3 235B Instruct           │
│ ○ Claude Haiku 3.5              │
│ ○ Qwen4 Instruct (future)       │
└─────────────────────────────────┘
```

**Design principles:**
- No smart defaults - user picks any combo
- Independent selections (conversation + compression)
- Future-proof (easy to add new models to either category)

## Database Schema Changes

### Update `user_settings` table

**Current schema:**
```sql
CREATE TABLE user_settings (
  id UUID PRIMARY KEY,
  user_id UUID,
  selected_model TEXT,           -- Only stores conversation model
  selected_persona TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

**New schema:**
```sql
CREATE TABLE user_settings (
  id UUID PRIMARY KEY,
  user_id UUID,
  selected_conversation_model TEXT,  -- Call 1A/1B model
  selected_compression_model TEXT,    -- Call 2A/2B, Call 3A/3B model
  selected_persona TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

**Migration strategy:**
```sql
-- Migration: Split selected_model into two fields
ALTER TABLE user_settings
  ADD COLUMN selected_conversation_model TEXT,
  ADD COLUMN selected_compression_model TEXT;

-- Migrate existing data (set defaults)
UPDATE user_settings
SET
  selected_conversation_model = COALESCE(selected_model, 'accounts/fireworks/models/qwen3-235b-a22b'),
  selected_compression_model = 'accounts/fireworks/models/qwen3-235b-a22b-instruct-2507';

-- Drop old column after migration verified
ALTER TABLE user_settings DROP COLUMN selected_model;
```

## Model Registry

Create centralized model registry with metadata.

### New file: `src/lib/config/model-registry.ts`

```typescript
export type ModelCapability = 'conversation' | 'compression';

export interface ModelDefinition {
  id: string;                      // Fireworks model identifier
  name: string;                    // Display name
  provider: string;                // 'fireworks' | 'anthropic' | 'openai'
  capabilities: ModelCapability[]; // What this model can do
  contextWindow: number;           // Context window size
  pricing: {
    input: number;                 // $ per million tokens
    output: number;
  };
  notes?: string;                  // Optional notes (e.g., "FP8 quantized")
}

export const MODEL_REGISTRY: ModelDefinition[] = [
  // Qwen3 235B family
  {
    id: 'accounts/fireworks/models/qwen3-235b-a22b',
    name: 'Qwen3 235B (Thinking)',
    provider: 'fireworks',
    capabilities: ['conversation'],
    contextWindow: 131072,
    pricing: { input: 0.22, output: 0.88 }
  },
  {
    id: 'accounts/fireworks/models/qwen3-235b-a22b-instruct-2507',
    name: 'Qwen3 235B Instruct',
    provider: 'fireworks',
    capabilities: ['conversation', 'compression'],
    contextWindow: 262144,
    pricing: { input: 0.22, output: 0.88 },
    notes: 'FP8 quantized, better JSON compliance'
  },

  // Future models (examples)
  {
    id: 'accounts/fireworks/models/qwen4-300b-thinking',
    name: 'Qwen4 300B (Thinking)',
    provider: 'fireworks',
    capabilities: ['conversation'],
    contextWindow: 262144,
    pricing: { input: 0.30, output: 1.20 }
  },
  {
    id: 'accounts/fireworks/models/qwen4-300b-instruct',
    name: 'Qwen4 300B Instruct',
    provider: 'fireworks',
    capabilities: ['conversation', 'compression'],
    contextWindow: 524288,
    pricing: { input: 0.30, output: 1.20 }
  }
];

// Helper functions
export function getConversationModels(): ModelDefinition[] {
  return MODEL_REGISTRY.filter(m => m.capabilities.includes('conversation'));
}

export function getCompressionModels(): ModelDefinition[] {
  return MODEL_REGISTRY.filter(m => m.capabilities.includes('compression'));
}

export function getModelById(id: string): ModelDefinition | undefined {
  return MODEL_REGISTRY.find(m => m.id === id);
}
```

### Update `src/lib/config/models.ts`

```typescript
/**
 * Default model configuration for Asura
 *
 * Users can override these via UI settings
 */

/** Default conversation model (Call 1A/1B) */
export const DEFAULT_CONVERSATION_MODEL = 'accounts/fireworks/models/qwen3-235b-a22b' as const;

/** Default compression model (Call 2A/2B, Call 3A/3B) */
export const DEFAULT_COMPRESSION_MODEL = 'accounts/fireworks/models/qwen3-235b-a22b-instruct-2507' as const;

/** File processing model (chunking only, not user-selectable) */
export const FILE_MODEL = 'accounts/fireworks/models/qwen3-235b-a22b-instruct-2507' as const;

/** Embedding model for vector search */
export const EMBEDDING_MODEL = 'voyage-3' as const;

/** Temperature setting for all models */
export const TEMPERATURE = 0.7;

/** Max tokens by use case */
export const MAX_TOKENS = {
  chat: 4000,        // Conversation models (allow thinking)
  compression: 2048, // Compression models (structured output)
  file: 1000         // File processing (chunking)
} as const;
```

## Frontend: Nested Dropdown Component

### Component structure: `ModelSelector.svelte`

```svelte
<script lang="ts">
  import { getConversationModels, getCompressionModels } from '$lib/config/model-registry';

  export let selectedConversationModel: string;
  export let selectedCompressionModel: string;

  let isOpen = false;

  const conversationModels = getConversationModels();
  const compressionModels = getCompressionModels();

  function selectConversationModel(modelId: string) {
    selectedConversationModel = modelId;
    // Don't close dropdown - allow selecting compression model next
  }

  function selectCompressionModel(modelId: string) {
    selectedCompressionModel = modelId;
    isOpen = false; // Close after both selections made
  }
</script>

<div class="model-selector">
  <button on:click={() => isOpen = !isOpen} class="dropdown-trigger">
    Model ▼
  </button>

  {#if isOpen}
    <div class="dropdown-menu">
      <!-- Conversation Models Section -->
      <div class="section-header">CONVERSATION MODELS</div>
      {#each conversationModels as model}
        <label class="model-option">
          <input
            type="radio"
            name="conversation-model"
            value={model.id}
            checked={selectedConversationModel === model.id}
            on:change={() => selectConversationModel(model.id)}
          />
          <span class="model-name">{model.name}</span>
          <span class="model-price">${model.pricing.output}/M out</span>
        </label>
      {/each}

      <div class="divider"></div>

      <!-- Compression Models Section -->
      <div class="section-header">COMPRESSION MODELS</div>
      {#each compressionModels as model}
        <label class="model-option">
          <input
            type="radio"
            name="compression-model"
            value={model.id}
            checked={selectedCompressionModel === model.id}
            on:change={() => selectCompressionModel(model.id)}
          />
          <span class="model-name">{model.name}</span>
          <span class="model-price">${model.pricing.output}/M out</span>
        </label>
      {/each}
    </div>
  {/if}
</div>

<style>
  .model-selector {
    position: relative;
    display: inline-block;
  }

  .dropdown-trigger {
    padding: 8px 16px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    cursor: pointer;
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 320px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 8px;
    z-index: 1000;
  }

  .section-header {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 8px 12px 4px;
  }

  .model-option {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .model-option:hover {
    background: var(--bg-hover);
  }

  .model-name {
    flex: 1;
    margin-left: 8px;
  }

  .model-price {
    font-size: 12px;
    color: var(--text-muted);
  }

  .divider {
    height: 1px;
    background: var(--border-color);
    margin: 8px 0;
  }
</style>
```

## Backend Changes

### Update `src/routes/api/chat/+server.ts`

**Before:**
```typescript
import { CHAT_MODEL } from '$lib/config/models';

// ... later in code
const selectedModel = settings?.selected_model || CHAT_MODEL;

// Call 1A
const call1A = await fireworks.chat.completions.create({
  model: selectedModel,
  // ...
});

// Call 2A (currently uses selectedModel - wrong!)
const call2A = await fireworks.chat.completions.create({
  model: selectedModel,
  // ...
});
```

**After:**
```typescript
import { DEFAULT_CONVERSATION_MODEL, DEFAULT_COMPRESSION_MODEL } from '$lib/config/models';

// ... later in code
const conversationModel = settings?.selected_conversation_model || DEFAULT_CONVERSATION_MODEL;
const compressionModel = settings?.selected_compression_model || DEFAULT_COMPRESSION_MODEL;

// Call 1A (conversation)
const call1A = await fireworks.chat.completions.create({
  model: conversationModel,
  // ...
});

// Call 2A (compression)
const call2A = await fireworks.chat.completions.create({
  model: compressionModel,
  // ...
});
```

### Update `src/lib/file-chunker.ts`

File processing always uses `FILE_MODEL` (not user-selectable). No changes needed.

## Implementation Checklist

### Phase 1: Database Migration
- [ ] Create migration SQL file
- [ ] Add `selected_conversation_model` column to `user_settings`
- [ ] Add `selected_compression_model` column to `user_settings`
- [ ] Migrate existing `selected_model` data
- [ ] Drop `selected_model` column
- [ ] Test migration on local Supabase

### Phase 2: Model Registry
- [ ] Create `src/lib/config/model-registry.ts`
- [ ] Add Qwen3 235B models to registry
- [ ] Add helper functions (`getConversationModels`, `getCompressionModels`)
- [ ] Update `src/lib/config/models.ts` to use defaults

### Phase 3: Frontend Component
- [ ] Create `ModelSelector.svelte` component
- [ ] Implement nested dropdown UI
- [ ] Add radio button selection for conversation models
- [ ] Add radio button selection for compression models
- [ ] Style component with Tailwind v4
- [ ] Integrate into main chat input bar

### Phase 4: Backend Integration
- [ ] Update `src/routes/api/chat/+server.ts` to use both models
- [ ] Update Call 1A/1B to use `selected_conversation_model`
- [ ] Update Call 2A/2B to use `selected_compression_model`
- [ ] Update settings API to save both model selections
- [ ] Test with different model combinations

### Phase 5: Testing
- [ ] Test conversation-only model changes
- [ ] Test compression-only model changes
- [ ] Test mixed model selections (e.g., Qwen3 conversation + Qwen4 compression)
- [ ] Verify database persistence across sessions
- [ ] Test migration with existing user data

### Phase 6: Documentation
- [ ] Update CLAUDE.md with dual model selection architecture
- [ ] Document model registry structure
- [ ] Add guide for adding new models to registry

## Future Enhancements (Out of Scope for v1)

1. **Model recommendations:** "For this conversation model, we suggest X compression model"
2. **Cost calculator:** Show estimated monthly cost based on selections
3. **Performance metrics:** Track quality metrics per model combo
4. **A/B testing:** Compare model combinations automatically
5. **Custom models:** Allow users to add custom Fireworks endpoints

## Open Questions

1. **File processing model:** Should this also be user-selectable?
   - **Current decision:** No, keep hardcoded for now (complexity vs value)

2. **Model capabilities validation:** Should we prevent invalid combos?
   - **Current decision:** No validation, let user pick any combo

3. **Pricing display:** Show pricing in dropdown?
   - **Current decision:** Yes, show output pricing (most relevant metric)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Migration breaks existing settings | Medium | High | Test thoroughly on dev, add rollback script |
| UI clutters input bar | Low | Medium | Use clean nested design, hide when not in use |
| Users confused by two selections | Medium | Low | Clear section headers, tooltips if needed |
| Model registry gets stale | Medium | Low | Document update process, automate if possible |

## Success Criteria

- [ ] Users can independently select conversation and compression models
- [ ] Selections persist across sessions
- [ ] UI remains clean (no clutter)
- [ ] Migration completes without data loss
- [ ] System works with any valid model combination

---

**Next Steps:**
1. Create new branch: `dual-model-selection`
2. Start with Phase 1 (database migration)
3. Iterate through phases sequentially
