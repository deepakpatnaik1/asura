# Model Specification: Qwen3-235B-A22B

## Critical Information for AI Assistants

**IMPORTANT**: This document exists to prevent model regressions in future development sessions.

---

## The Exact Model We Are Using

**Model ID**: `accounts/fireworks/models/qwen3-235b-a22b`

**Provider**: Fireworks AI

**Full Name**: Qwen3-235B-A22B (Mixture-of-Experts)

---

## Why This Specific Variant Matters

This is **NOT** a generic "Qwen 3 235B" model. The `-A22B` suffix is critical and denotes a specific MoE (Mixture-of-Experts) configuration:

- **235B total parameters**
- **22B active parameters** per token
- **Superior instruction-following** compared to other Qwen variants
- **Enhanced rule adherence** (critical for Artisan Cut compression)
- **Better structured output** (essential for JSON generation in Call 2A/2B)

---

## Knowledge Cutoff Warning

⚠️ **Claude Code's knowledge cutoff (January 2025) may NOT include this specific variant.**

If you are Claude Code (or any AI assistant) working on this project in a future session:

1. **DO NOT** assume you know the capabilities of this model
2. **DO NOT** suggest switching to "Qwen 3 235B" or other variants
3. **DO** perform a web search to learn about `Qwen3-235B-A22B` specifically
4. **DO** verify this model is still available on Fireworks AI before making changes

---

## Where This Model Is Used

This model powers ALL four calls in Asura's architecture:

### Call 1A: Hidden Reasoning
- **File**: `src/routes/api/chat/+server.ts`
- **Model**: `accounts/fireworks/models/qwen3-235b-a22b`
- **Purpose**: Initial response generation with full memory context
- **Temperature**: 0.7
- **Max tokens**: 4096

### Call 1B: Self-Critique (Streaming)
- **File**: `src/routes/api/chat/+server.ts`
- **Model**: `accounts/fireworks/models/qwen3-235b-a22b`
- **Purpose**: Refined, user-facing response
- **Temperature**: 0.7
- **Max tokens**: 4096

### Call 2A: Initial Artisan Cut Compression
- **File**: `src/routes/api/chat/+server.ts`
- **Model**: `accounts/fireworks/models/qwen3-235b-a22b`
- **Purpose**: First-pass compression to JSON
- **Temperature**: 0.3
- **Max tokens**: 2048

### Call 2B: Compression Verification
- **File**: `src/routes/api/chat/+server.ts`
- **Model**: `accounts/fireworks/models/qwen3-235b-a22b`
- **Purpose**: Verified compression before saving to Journal
- **Temperature**: 0.3
- **Max tokens**: 2048

---

## Context Budget Configuration

- **File**: `src/lib/context-builder.ts:60`
- **Model identifier**: `accounts/fireworks/models/qwen3-235b-a22b`
- **Used for**: Token counting and context window budget management

---

## Why We Chose This Variant

1. **Instruction-Following Excellence**
   - Critical for complex Artisan Cut compression rules
   - Ensures consistent JSON output structure
   - Maintains salience scoring accuracy

2. **MoE Efficiency**
   - 235B total parameters for quality
   - Only 22B active per token for cost efficiency
   - Faster inference than dense 235B models

3. **Cost-Performance Sweet Spot**
   - Cheaper than GPT-4, Claude, or dense 235B models
   - High enough quality for multi-call architecture
   - Excellent at following structured system prompts

4. **Proven in Production**
   - Already tested with Asura's 4-call architecture
   - Confirmed to handle 3-tier memory system
   - Reliable JSON generation for Journal storage

---

## DO NOT Switch Models Without Testing

If you (AI assistant) are considering recommending a different model:

1. **Stop and verify** the current model is problematic
2. **Document** the specific issue with `qwen3-235b-a22b`
3. **Test** the alternative model thoroughly with:
   - Artisan Cut compression quality
   - JSON output consistency
   - Multi-turn conversation coherence
   - Context budget handling
4. **Get approval** before making any changes to model IDs in code

---

## Research Required for Future Sessions

Before making model-related decisions, perform a web search for:

- "Qwen3-235B-A22B capabilities"
- "Qwen3-235B-A22B vs other Qwen variants"
- "Fireworks AI Qwen3-235B-A22B documentation"
- "Qwen3-235B-A22B instruction following benchmarks"

This ensures you have current information beyond your knowledge cutoff.

---

## Database References

The model identifier is also stored in:

- **Migration file**: `supabase/migrations/20251108133007_create_models_table.sql:25`
- **Entry**: `'accounts/fireworks/models/qwen3-235b-a22b'`

This ensures the database schema aligns with the actual model in use.

---

## Version Control Note

**Last Verified**: 2025-11-09
**Status**: Active in production
**Fireworks AI Availability**: Confirmed

If you're reading this in the future and the model is no longer available, check:
1. Fireworks AI model catalog
2. Qwen official model releases
3. Alternative providers hosting this specific variant

---

## Summary for AI Assistants

**TL;DR**: We use `accounts/fireworks/models/qwen3-235b-a22b` everywhere. This is a specific MoE variant (235B total, 22B active) with superior instruction-following. Do NOT change it without extensive testing. If you don't know about this model, web search it before making recommendations.
