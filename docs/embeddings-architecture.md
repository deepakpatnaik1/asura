# Embeddings & Instructions Architecture

## Context Injection Priorities (Final)

All context loaded subject to **40% context window cap** (cap is maximum, not target).

### Priority 1: Last 5 Superjournal Turns
- Fields: `user_message`, `ai_response`, `persona_name`, `created_at`
- Full, uncompressed conversation turns
- Ordered chronologically (oldest first)
- Always loaded (highest priority)

### Priority 2: Starred Messages
- Fields: `user_message`, `ai_response`, `persona_name`, `created_at`
- Full, uncompressed (from Superjournal where `is_starred = true`)
- Ordered chronologically (oldest first)
- User-curated high-importance messages

### Priority 3: Instructions
- Fields: `boss_essence`, `persona_essence`, `decision_arc_summary`, `instruction_scope`
- Behavioral directives that persist indefinitely
- Loaded where `is_instruction = true` AND (`instruction_scope = 'global'` OR `instruction_scope = currentPersona`)
- Each persona only sees their own instructions + global instructions
- Isolation principle: Gunnar never sees Vlad's instructions

### Priority 4: Last 100 Journal Turns
- Fields: `boss_essence`, `persona_essence`, `decision_arc_summary`, `persona_name`, `created_at`
- Artisan Cut compressed turns (full: boss + persona + arc)
- Ordered chronologically (oldest first)
- Truncated to fit budget if needed
- Represents 6-12 months of recent memory

### Priority 5: Vector Search Results (After Turn 100)
- Fields: `boss_essence`, `persona_essence`, `decision_arc_summary`, `salience_score`
- Semantically matched artisan cuts from beyond last 100 turns
- **Only activated when total journal entries > 100**
- Top 10 results weighted by: `similarity_score × (salience_score / 10.0)`
- Excludes entries already loaded in Priorities 1-4 (no duplication)
- Excludes where `is_instruction = true` (instructions already in Priority 3)

---

## Instructions System

### Problem Statement
Users give behavioral directives to personas ("don't use sports analogies", "always ask follow-up questions"). These must persist indefinitely but:
1. Users may forget to star them
2. LLM may not assign high salience scores
3. Not necessarily tied to important business decisions

### Solution: Dedicated Instructions Detection

**New Journal Table Fields:**
- `is_instruction` (boolean, default false)
- `instruction_scope` (text: 'global' | 'gunnar' | 'vlad' | 'kirby' | 'stefan' | 'ananya' | 'samara' | NULL)

**Call 2A/2B Enhanced Output:**
```json
{
  "boss_essence": "...",
  "persona_name": "gunnar",
  "persona_essence": "...",
  "decision_arc_summary": "...",
  "salience_score": 7,
  "is_instruction": false,
  "instruction_scope": null
}
```

**Detection Logic (in Artisan Cut prompt):**
- User message contains behavioral directives: "don't", "never", "always", "stop", "avoid", "from now on"
- Combined with references to persona behavior/response style
- Set `is_instruction = true`

**Scope Detection (in Artisan Cut prompt):**
- If user addresses specific persona by name or says "you" in persona-specific context: `instruction_scope = persona_name`
- If instruction is general or addresses "all personas": `instruction_scope = 'global'`

**Context Loading:**
```sql
SELECT * FROM journal
WHERE is_instruction = true
  AND (instruction_scope = 'global' OR instruction_scope = :currentPersona)
ORDER BY created_at ASC;
```

**Isolation Principle:**
Each persona operates independently. Gunnar's instructions never leak to Vlad, and vice versa. Global instructions apply to all.

---

## Embeddings System

### Purpose
Enable semantic retrieval of relevant conversation history beyond the last 100 turns (Priority 4). Without embeddings, Priority 5 would dump ALL decision arcs regardless of relevance—pure noise.

### What Gets Embedded

**Decision Arc Summary ONLY** (`decision_arc_summary` field)
- 50-150 characters per arc
- Ultra-compressed semantic pointers
- Minimizes Voyage AI embedding costs
- The entire point of arcs: reduce embedding costs vs embedding full turns

**Why not full artisan cuts?**
If we could afford to embed full turns, we wouldn't need decision arcs at all. Arcs exist specifically to compress semantic information for cheap embedding.

### Embedding Generation

**When:** After Call 2B completes and Journal row is inserted

**Flow:**
1. Call 2B outputs verified compressed JSON
2. Backend saves to Journal table
3. Send `decision_arc_summary` to Voyage AI (Gemini model)
4. Receive 1536-dimensional vector
5. Update Journal row: `SET embedding = vector WHERE id = journal_id`

**No verification needed:** Embeddings are deterministic mathematical transformations, not generative outputs. Unlike Call 2A/2B where compression quality varies, embeddings are consistent.

### Vector Search (Priority 5)

**Activation Threshold:** Only when total Journal entries > 100

**Why?**
- Before turn 100: All Journal entries already loaded in Priority 4
- Vector search would be redundant overhead
- Saves Voyage API calls early in app lifecycle

**Query Embedding:**
```typescript
const journalCount = await getJournalCount(userId);

if (journalCount > 100) {
  const queryEmbedding = await voyageAI.embed(userQuery);
  const results = await vectorSearch(queryEmbedding);
  // Load into Priority 5
} else {
  // Skip vector search entirely
}
```

**Search Query:**
```sql
SELECT
  boss_essence,
  persona_essence,
  decision_arc_summary,
  salience_score,
  (1 - (embedding <=> :queryEmbedding)) * (salience_score / 10.0) AS weighted_score
FROM journal
WHERE user_id = :userId
  AND id NOT IN (:last100Ids, :starredIds, :instructionIds)
  AND is_instruction = false
ORDER BY weighted_score DESC
LIMIT 10;
```

**Weighting Formula:**
- Cosine similarity: `(1 - (embedding <=> queryEmbedding))` ranges 0-1
- Salience weight: `(salience_score / 10.0)` ranges 0.1-1.0
- Combined: High-relevance + high-salience wins

**Exclusions:**
- Last 100 Journal IDs (already in Priority 4)
- Starred message IDs (already in Priority 2)
- Instruction IDs (already in Priority 3)
- Prevents duplication, maximizes new information

**Result Count:** Top 10 weighted results
- Balances context richness with token budget
- Salience weighting ensures important memories surface even if moderately relevant

### Example Flow

**User asks:** "Should we raise prices 20%?"

**Journal count = 250 (exceeds 100 threshold)**

1. Query → Voyage AI → embedding vector
2. pgvector searches all 250 arcs, excluding last 100
3. Finds semantically similar arcs from turns 1-150:
   - `[8] Revenue target: $100k MRR by Q4; pricing lever critical` (turn 45, weighted_score: 0.85)
   - `[7] Pricing strategy: considering 20% increase, testing approach` (turn 89, weighted_score: 0.78)
   - `[5] Competitor pricing: analyzed 3 competitors; 15-25% below market` (turn 120, weighted_score: 0.62)
4. Top 10 results loaded with full artisan cuts into Priority 5
5. Call 1A receives pricing-relevant context from 6 months ago without loading entire history

---

## Database Schema Changes

### Journal Table Modifications

```sql
-- Add instructions fields
ALTER TABLE journal
  ADD COLUMN is_instruction BOOLEAN DEFAULT false,
  ADD COLUMN instruction_scope TEXT;

-- Add embedding field (if not exists)
ALTER TABLE journal
  ADD COLUMN embedding VECTOR(1536);

-- Create HNSW index for fast vector search
CREATE INDEX journal_embedding_idx
  ON journal
  USING hnsw (embedding vector_cosine_ops);

-- Index for instruction filtering
CREATE INDEX journal_instruction_scope_idx
  ON journal (is_instruction, instruction_scope);
```

### Superjournal Table (No Changes)
Existing `is_starred` field sufficient for Priority 2.

---

## Cost Optimization

### Voyage AI Gemini Embeddings
- Only decision arcs embedded (50-150 chars vs 300-500 for full artisan cuts)
- ~66% cost reduction vs embedding full turns
- Query embeddings only after turn 100 (no wasted early-lifecycle calls)

### Token Budget Management
- 40% cap prevents context overflow
- Priority system ensures high-signal information loads first
- Vector search finds relevant old memories without loading entire history
- Instructions loaded once, persist indefinitely (no re-loading across turns)

### Prompt Caching Benefits
- Instructions (mostly static) → heavily cached
- Last 5 Superjournal (slow-changing) → mostly cached
- Last 100 Journal (incremental changes) → mostly cached
- Vector search results (dynamic) → not cached, but only 10 results

---

## Key Design Principles

1. **Semantic Retrieval Over Chronological Dumps:** Vector search finds relevant context, not recency-biased noise
2. **No Duplication:** Exclusion filters prevent loading same information twice
3. **Salience-Weighted Relevance:** Important memories surface even if moderately semantically similar
4. **Cost-Conscious Embedding:** Decision arcs keep embedding costs minimal while preserving semantic richness
5. **Lazy Activation:** Vector search only activates when needed (turn 100+)
6. **Persona Isolation:** Instructions scoped to prevent cross-persona contamination
7. **40% Cap is Maximum, Not Target:** Natural context growth, no artificial backfilling

---

## Implementation Checklist

**Phase 1: Instructions System**
- [ ] Migrate Journal table: add `is_instruction`, `instruction_scope`
- [ ] Update Call 2A/2B Artisan Cut prompt with instruction detection
- [ ] Modify Call 2B JSON schema to include new fields
- [ ] Update backend to save `is_instruction`, `instruction_scope` to Journal
- [ ] Update context builder: add Priority 3 (instructions loading)
- [ ] Test: User tells Gunnar "don't use sports analogies", verify persists in context

**Phase 2: Embeddings Generation**
- [ ] Integrate Voyage AI SDK
- [ ] Add embedding generation after Call 2B completes
- [ ] Embed `decision_arc_summary` only
- [ ] Save 1536-dim vector to `journal.embedding`
- [ ] Create HNSW index on embedding column
- [ ] Test: Verify embeddings generated and saved for new turns

**Phase 3: Vector Search**
- [ ] Add journal count check (activate only if > 100)
- [ ] Embed user query via Voyage AI
- [ ] Implement pgvector cosine similarity search with salience weighting
- [ ] Exclude Priorities 1-4 IDs from search results
- [ ] Exclude `is_instruction = true` entries
- [ ] Load top 10 weighted results into Priority 5
- [ ] Test: User asks pricing question at turn 150, verify relevant arcs from turns 1-50 surface

**Phase 4: Integration Testing**
- [ ] Verify context assembly order: P1 → P2 → P3 → P4 → P5
- [ ] Verify 40% cap enforcement with all priorities active
- [ ] Verify no duplication across priorities
- [ ] Verify persona isolation for instructions
- [ ] Verify vector search only activates after turn 100
- [ ] Load test: 1000 journal entries, verify search performance

---

## Success Metrics

- **Semantic Precision:** Pricing queries retrieve pricing-related arcs (not random high-salience arcs)
- **Context Utilization:** <40% context window usage even with 1000+ turns
- **Cost Efficiency:** <$0.01 per user message (4 LLM calls + 1 embedding after turn 100)
- **Instruction Persistence:** Behavioral directives never forgotten, correctly scoped
- **No Duplication:** Zero overlap between priorities
- **Search Performance:** Vector search completes in <100ms even with 10,000 journal entries
