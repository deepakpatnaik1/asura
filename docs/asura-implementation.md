# Asura Implementation Guide

## Implementation Philosophy

Asura is being built in **phases**, focusing on wiring the core engine first before polishing features or implementing all six personas. Phase 1 is about getting the perpetual memory architecture fully functional with minimal viable features.

---

## Phase 1: Wiring the Engine

The goal of Phase 1 is to wire together the complete perpetual memory architecture with essential features only. We're working with:
- **Single model**: Qwen3-235B via Fireworks AI
- **No persona differentiation yet**: Basic scaffolding only
- **Focus**: Get the 4-call architecture + 3-tier memory system working end-to-end

### Subphase 1: Perpetual Conversation Continuity

**Objective**: Complete implementation of the core feature that ensures the AI never forgets past conversations, regardless of how long the conversation runs.

This subphase is exclusively focused on making the perpetual memory system fully operational. Everything else (personas, file uploads, advanced UI features) is deferred until this foundational capability is proven and working.

**Definition of "Perpetual Conversation Continuity"**:
- AI can reference conversations from 100+ turns ago
- Context stays within 40% of model's window via intelligent compression
- No manual intervention required to maintain memory
- Graceful degradation when context approaches limits (older compressed memories drop first)
- Semantic retrieval surfaces relevant past decisions even if not chronologically recent

**Subphase 1 Success Criteria**:
1. ✅ **Memory injection working**: Call 1A/1B receive working memory (last 5 Superjournal) + recent memory (last 100 Journal)
   - Implemented in [context-builder.ts:80-180](../src/lib/context-builder.ts#L80-L180)
   - Called from [chat/+server.ts:371-384](../src/routes/api/chat/+server.ts#L371-L384)
2. ✅ **Embeddings pipeline operational**: Every Journal entry has a vector embedding
   - Implemented in [chat/+server.ts:332-357](../src/routes/api/chat/+server.ts#L332-L357)
   - Uses Voyage AI `voyage-3-large` (1024 dimensions)
   - Schema correctly configured as `vector(1024)` - verified working
3. ✅ **Vector search functional**: Semantically similar Decision Arcs are retrieved based on current query
   - Implemented in [context-builder.ts:182-297](../src/lib/context-builder.ts#L182-L297)
   - Only activates when journal count > 100
   - Salience-weighted re-ranking: `similarity × (salience/10)`
   - Excludes duplicates from Priorities 1-4
4. ✅ **Context budget enforced**: Total context stays under 40% of model window (with truncation logic)
   - Implemented in [context-builder.ts:64-179](../src/lib/context-builder.ts#L64-L179)
   - Graceful truncation of journal entries when budget exceeded
5. ⚠️ **Multi-turn coherence verified**: AI demonstrates recall across 20+ turn conversations
   - Implementation complete, manual testing required

**Current Status**:
- ✅ All core features implemented and operational
- ⚠️ Requires manual testing to verify multi-turn coherence (20+ turn conversations)

Once manual testing confirms multi-turn coherence, Subphase 1 is complete and the core promise of Asura—**infinite conversation continuity**—is fully realized.

### Current Status (What's Already Wired)

✅ **Call 1A: Hidden Reasoning**
- Model: Qwen3-235B
- Max tokens: 4096
- Temperature: 0.7
- Purpose: Initial response generation
- Status: Implemented in `src/routes/api/chat/+server.ts:293-300`

✅ **Call 1B: Self-Critique (Streaming)**
- Model: Qwen3-235B
- Max tokens: 4096
- Temperature: 0.7
- Receives Call 1A output + critique prompt
- Streams to user via Server-Sent Events (SSE)
- Status: Implemented in `src/routes/api/chat/+server.ts:302-357`

✅ **Call 2A: Initial Artisan Cut Compression**
- Model: Qwen3-235B
- Max tokens: 2048
- Temperature: 0.3
- Outputs JSON with boss_essence, persona_essence, decision_arc_summary, salience_score
- Status: Implemented in `src/routes/api/chat/+server.ts:196-223`

✅ **Call 2B: Compression Verification**
- Model: Qwen3-235B
- Max tokens: 2048
- Temperature: 0.3
- Receives Call 2A output + critique prompt
- Refines compression before saving
- Status: Implemented in `src/routes/api/chat/+server.ts:226-257`

✅ **Superjournal Table**
- Stores full, uncompressed conversation turns
- Fields: user_message, ai_response, persona_name, created_at, is_starred
- Status: Schema complete, inserts working

✅ **Journal Table**
- Stores Artisan Cut compressed turns
- Fields: boss_essence, persona_essence, decision_arc_summary, salience_score, embedding
- Status: Schema complete, inserts working (embedding field null for now)

✅ **UI: Chat Interface**
- Streaming response display
- Message history rendering
- Auto-scroll to bottom on new messages
- Status: Implemented in `src/routes/+page.svelte`

✅ **Background Compression**
- Call 2A/2B run in background via setTimeout(0)
- Non-blocking, doesn't delay user experience
- Status: Implemented in `src/routes/api/chat/+server.ts:352-355`

---

### What Still Needs Wiring (Phase 1 Priorities)

#### 🔴 Priority 1: Memory Context Loading (CRITICAL)

**Current Problem**: Call 1A/1B are completely stateless. They receive only the current user message with no memory of past conversations. This breaks the entire "perpetual conversation continuity" promise.

**What to Wire**:
1. **Load last 5 Superjournal turns** before Call 1A
2. **Load last 100 Journal turns** before Call 1A
3. **Format as conversation history** and inject into Call 1A messages array
4. **Pass same context to Call 1B** (it receives Call 1A context + Call 1A output)

**Implementation Location**: `src/routes/api/chat/+server.ts` (inside POST handler)

**Pseudo-code**:
```typescript
// Before Call 1A
const { data: superjournalHistory } = await supabase
  .from('superjournal')
  .select('user_message, ai_response, created_at')
  .order('created_at', { ascending: false })
  .limit(5);

const { data: journalHistory } = await supabase
  .from('journal')
  .select('boss_essence, persona_essence, decision_arc_summary, created_at')
  .order('created_at', { ascending: false })
  .limit(100);

// Format into context string
const memoryContext = formatMemoryContext(superjournalHistory, journalHistory);

// Inject into Call 1A
const call1A = await fireworks.chat.completions.create({
  messages: [
    { role: 'system', content: BASE_INSTRUCTIONS + memoryContext },
    { role: 'user', content: message }
  ]
});
```

**Why This Is Critical**: Without this, Asura has no memory at all. This is the foundation of the entire architecture.

---

#### 🔴 Priority 2: Embeddings Pipeline

**Current Problem**: `journal.embedding` field is always null. Vector search cannot work without embeddings.

**What to Wire**:
1. **After Call 2B completes**, generate embedding for the compressed turn
2. **Use Voyage AI** to generate 1536-dimension embedding
3. **Update Journal row** with embedding vector
4. **Input for embedding**: Concatenate `boss_essence + persona_essence + decision_arc_summary`

**Implementation Location**: `src/routes/api/chat/+server.ts` (inside `compressToJournal` function)

**Pseudo-code**:
```typescript
// After Call 2B JSON is validated
const embeddingText = `${call2BJson.boss_essence} ${call2BJson.persona_essence} ${call2BJson.decision_arc_summary}`;

const embeddingResponse = await fetch('https://api.voyageai.com/v1/embeddings', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${VOYAGE_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    input: embeddingText,
    model: 'voyage-3' // or appropriate Voyage model
  })
});

const { data } = await embeddingResponse.json();
const embedding = data[0].embedding; // 1536-dim vector

// Save to Journal with embedding
await supabase.from('journal').insert({
  // ... other fields
  embedding: embedding
});
```

**Dependencies**:
- Add `VOYAGE_API_KEY` to `.env`
- Install Voyage AI client (or use fetch directly)

**Why This Is Important**: Unblocks vector search for Decision Arcs retrieval.

---

#### 🟡 Priority 3: Vector Search for Decision Arcs

**Current Problem**: No semantic retrieval of relevant past conversations. Call 1A/1B get generic "last 100" Journal entries but not specifically relevant ones.

**What to Wire**:
1. **Generate embedding for current user message** (using Voyage AI)
2. **Vector search Journal table** for semantically similar decision arcs
3. **Order by cosine similarity** (pgvector handles this)
4. **Inject top N arcs into Call 1A context** (sorted by salience score)

**Implementation Location**: `src/routes/api/chat/+server.ts` (inside POST handler, before Call 1A)

**Pseudo-code**:
```typescript
// Generate query embedding
const queryEmbedding = await generateEmbedding(message); // Voyage AI

// Vector search
const { data: relevantArcs } = await supabase.rpc('match_decision_arcs', {
  query_embedding: queryEmbedding,
  match_threshold: 0.7,
  match_count: 10
});

// Format and inject into Call 1A context
const decisionArcsContext = formatDecisionArcs(relevantArcs);
```

**Database Function Needed**:
Create a PostgreSQL function `match_decision_arcs` using pgvector's cosine similarity search.

**Why This Is Important**: Completes the 3-tier memory architecture (working + recent + long-term).

---

#### 🟡 Priority 4: Starred Messages Support

**Current Problem**: UI has star button, database has `is_starred` field, but no wiring between them.

**What to Wire**:

**Backend**:
1. **API endpoint** to toggle `is_starred` on Superjournal/Journal rows
2. **Load all starred entries** before Call 1A (treat as salience 10)
3. **Inject starred messages into context** (always included, regardless of recency)

**Frontend**:
1. **Wire star button click** to call API endpoint
2. **Update local state** to reflect starred status
3. **Visual indicator** for starred messages

**Implementation Location**:
- Backend: New endpoint `src/routes/api/star/+server.ts`
- Frontend: `src/routes/+page.svelte` (star button handler)

**Pseudo-code (Backend)**:
```typescript
// src/routes/api/star/+server.ts
export const POST: RequestHandler = async ({ request }) => {
  const { superjournalId, isStarred } = await request.json();

  // Update Superjournal
  await supabase
    .from('superjournal')
    .update({ is_starred: isStarred })
    .eq('id', superjournalId);

  // Update corresponding Journal entry
  await supabase
    .from('journal')
    .update({ is_starred: isStarred })
    .eq('superjournal_id', superjournalId);

  return json({ success: true });
};
```

**Why This Is Important**: Gives users manual control over what the AI remembers (high-value feature).

---

#### 🟢 Priority 5: Context Window Budget Management (Nice-to-Have)

**Current Problem**: No validation that total context fits within 40% of model's context window.

**What to Wire**:
1. **Calculate token counts** for each memory tier (use tiktoken or approximation)
2. **Validate total tokens < 40% of window** (Qwen3-235B has 128k context)
3. **Truncate gracefully** if needed (remove oldest Journal entries first, preserve Superjournal + starred)

**Implementation Location**: `src/routes/api/chat/+server.ts` (before Call 1A)

**Why This Is Lower Priority**: Current memory tiers (5 Superjournal + 100 Journal) are unlikely to exceed 40% of 128k window. Can defer until testing reveals issues.

---

## Phase 1 Completion Criteria

Phase 1 is complete when:

- ✅ Call 1A/1B receive memory context (last 5 Superjournal + last 100 Journal)
- ✅ Call 2B outputs are saved with embeddings to Journal table
- ✅ Vector search retrieves relevant Decision Arcs based on current query
- ✅ Starred messages are always included in Call 1A/1B context
- ✅ Users can star/unstar messages from UI
- ✅ AI demonstrates memory of past conversations (test with multi-turn dialogue)

Once Phase 1 is complete, the **perpetual memory engine is fully functional** and ready for quality testing.

---

## Phase 2 and Beyond (Not Yet Started)

### Phase 2: Quality & Refinement
- Test Decision Arc quality (are they regenerable patterns?)
- Test Salience Score reliability (does LLM score appropriately?)
- Test Compression Fidelity (is Artisan Cut lossless?)
- Optimize context formatting for better LLM performance

### Phase 3: Personas
- Implement all six persona-specific prompts
- Add persona-specific base instructions
- Add persona switching UI improvements
- Test persona consistency across memory tiers

### Phase 4: File Upload
- Implement LLM-based logical chunking
- Modified Call 2 for file content compression
- File deduplication logic
- File + Query edge case handling

### Phase 5: Production Readiness
- Migrate to Supabase Edge Functions
- Implement authentication (Supabase Auth)
- Re-enable RLS policies
- Make user_id NOT NULL
- Lazy loading for message history (infinite scroll)

### Phase 6: Advanced Features
- Side chats (branching conversations)
- Rethink feature (regenerate responses)
- Multi-user knowledge sharing
- Export/archive conversations

---

## Development Environment Notes

### Current Setup
- **Runtime**: SvelteKit server endpoints (Node.js)
- **Database**: Supabase local development (`supabase start`)
- **Auth**: Disabled (user_id nullable, RLS disabled)
- **LLM**: Qwen3-235B via Fireworks AI
- **Embeddings**: Not yet implemented (Voyage AI planned)

### Why Not Edge Functions Yet?
Edge Functions are primarily for **global low-latency deployment**. For single-developer local development, SvelteKit endpoints are faster to iterate on. Edge Functions will be wired in Phase 5 before production launch.

### Environment Variables Required
```
PUBLIC_SUPABASE_URL=http://localhost:54321
PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
FIREWORKS_API_KEY=...
VOYAGE_API_KEY=... (needed for Priority 2)
```

---

## Testing Strategy

### Manual Testing (Phase 1)
1. **Memory Continuity**: Have multi-turn conversation, verify AI recalls earlier turns
2. **Compression Quality**: Inspect Journal table, verify Artisan Cut preserves key info
3. **Vector Search**: Ask question related to past conversation, verify relevant arcs retrieved
4. **Starred Messages**: Star a message, verify it's always in context regardless of recency

### Automated Testing (Later Phases)
- Playwright E2E tests for UI flows
- Unit tests for compression quality
- Integration tests for vector search accuracy

---

## Next Immediate Steps

**Start with Priority 1: Memory Context Loading**

This is the most critical piece. Without it, Asura has no memory and the entire architecture is non-functional. Once memory context is wired, the AI will immediately feel "continuous" rather than stateless.

After Priority 1 is complete, move to Priority 2 (Embeddings), then Priority 3 (Vector Search), then Priority 4 (Starred Messages).
