# Pre-Implementation Alignment Plan

## Purpose
Before implementing the file uploads feature, we need to fix inconsistencies in the existing codebase regarding Voyage AI model and embedding dimensions.

## Current State Analysis

### Decision: voyage-3 Model (1024 dimensions)
**Rationale:** Cost optimization - voyage-3 is 3x cheaper than voyage-3-large

### Inconsistencies Found

#### 1. Database Schema (journal table)
**Current state:** `VECTOR(1536)` (incorrect)
**Location:**
- `supabase/migrations/20251108180000_update_embedding_dimensions.sql` (line 7)
- `supabase/migrations/20251108160000_add_instructions_and_embeddings.sql` (line 16 comment)

**What needs to change:**
- Embedding column should be `VECTOR(1024)` not `VECTOR(1536)`
- Comments reference wrong model (voyage-3-large, Gemini)

#### 2. Code References
**Current state:** Mixed references to voyage-3-large and 1024 dimensions
**Location:**
- `src/lib/context-builder.ts` line 204: Comment says "1024 dimensions (default)" but code uses `voyage-3-large`
- `docs/embeddings-architecture.md`: References 1536 dimensions throughout

**What needs to change:**
- Code should use `voyage-3` model consistently
- Comments should reflect 1024 dimensions
- Documentation should be updated

#### 3. Documentation
**Locations with 1536 references:**
- `docs/embeddings-architecture.md` - Multiple references to 1536-dim
- `docs/file-uploads-dependency-graph.md` - May have old references
- `working/file-uploads/project-brief.md` - Already correct (1024)

**What needs to change:**
- Update all documentation to reflect voyage-3 (1024-dim)
- Ensure consistency across all docs

---

## Alignment Tasks

### Task 1: Create Migration to Fix journal.embedding
**File:** `supabase/migrations/[timestamp]_fix_embedding_dimensions.sql`

**Actions:**
1. Drop existing HNSW index on journal.embedding
2. Delete all existing embeddings (they're 1536-dim, incompatible with 1024-dim)
3. Alter column type: `VECTOR(1536)` → `VECTOR(1024)`
4. Recreate HNSW index
5. Update column comment to reference voyage-3 (1024-dim)

**SQL:**
```sql
-- Fix embedding dimensions to match voyage-3 model (1024-dim)

-- Drop existing index
DROP INDEX IF EXISTS idx_journal_embedding;

-- Clear existing embeddings (they're 1536-dim from voyage-3-large)
UPDATE journal SET embedding = NULL WHERE embedding IS NOT NULL;

-- Alter column type
ALTER TABLE journal ALTER COLUMN embedding TYPE vector(1024);

-- Recreate HNSW index
CREATE INDEX idx_journal_embedding ON journal
  USING hnsw (embedding vector_cosine_ops);

-- Update comment
COMMENT ON COLUMN journal.embedding IS '1024-dimensional vector from Voyage AI (voyage-3 model) for semantic search';
```

**Impact:**
- All existing journal entries will have NULL embeddings
- Vector search will not work until embeddings are regenerated
- Boss may need to decide: regenerate embeddings or accept temporary loss of vector search

### Task 2: Fix context-builder.ts
**File:** `src/lib/context-builder.ts`

**Changes:**
- Line 204: Change model from `voyage-3-large` to `voyage-3`
- Update comment: "1024 dimensions" is already correct, just fix model name

**Before:**
```typescript
model: 'voyage-3-large' // 1024 dimensions (default)
```

**After:**
```typescript
model: 'voyage-3' // 1024 dimensions
```

### Task 3: Fix Existing Migrations (Comments Only)
**Files:**
- `supabase/migrations/20251108180000_update_embedding_dimensions.sql`
- `supabase/migrations/20251108160000_add_instructions_and_embeddings.sql`

**Actions:**
- Add deprecation comments at top
- Indicate these migrations were based on incorrect model choice
- Reference the fix migration

**Note:** We cannot edit executed migrations, but we can add comments for clarity.

### Task 4: Update Documentation
**Files to update:**

1. `docs/embeddings-architecture.md`
   - Replace all "1536" with "1024"
   - Replace "voyage-3-large" with "voyage-3"
   - Replace "Gemini model" references (outdated name for voyage-3-large)
   - Update cost estimates ($0.06/M tokens for voyage-3)

2. `docs/file-uploads-dependency-graph.md`
   - Verify all references are 1024-dim and voyage-3
   - Update if needed

3. `docs/asura-implementation.md`
   - Update embedding dimension references
   - Ensure consistency with voyage-3 model

### Task 5: Verify Test Scripts
**Files to check:**
- `test-voyage.js` - Ensure it uses voyage-3, not voyage-3-large
- `check-journal.js` - May reference embedding dimensions

**Actions:**
- Update model references
- Update expected dimension checks

---

## Execution Order

1. **Task 4: Update Documentation** (no risk, can be done immediately)
2. **Task 2: Fix context-builder.ts** (code change, low risk)
3. **Task 5: Verify Test Scripts** (ensure tests work with new model)
4. **Task 1: Database Migration** (HIGH IMPACT - clears embeddings)
5. **Task 3: Comment Old Migrations** (documentation only)

---

## Risks & Mitigation

### Risk 1: Loss of Vector Search Functionality
**Impact:** After migration, all journal entries will have NULL embeddings
**Mitigation Options:**
1. Accept temporary loss - embeddings regenerate naturally as new turns are added
2. Write script to regenerate embeddings for existing journal entries (Call 2B already has decision_arc_summary)
3. Keep old embeddings and only use voyage-3 for new entries (NOT RECOMMENDED - dimension mismatch breaks vector search)

**Boss Decision Required:** How to handle existing journal embeddings?

### Risk 2: Breaking Changes to Production Data
**Impact:** If production database exists, this migration wipes embeddings
**Mitigation:**
- This is a development environment (no production yet)
- If needed, create backup before migration: `pg_dump` journal table

### Risk 3: Cost Implications
**Impact:** Regenerating embeddings costs money ($0.06/M tokens)
**Mitigation:**
- Cost is minimal for development data
- Boss can decide whether to regenerate or accept loss

---

## Verification Checklist

After all tasks complete:
- [ ] Database: `journal.embedding` is `VECTOR(1024)`
- [ ] Database: HNSW index exists on journal.embedding
- [ ] Code: `context-builder.ts` uses `voyage-3` model
- [ ] Docs: All references to embeddings say 1024-dim and voyage-3
- [ ] Tests: All test scripts use voyage-3 model
- [ ] Migration comments: Old migrations have deprecation notes
- [ ] Vector search: Test query retrieves semantically similar journal entries (if embeddings regenerated)

---

## Boss Decision Points

1. **Existing journal embeddings:**
   - ✅ **Decision Made:** No embeddings exist (test data only), no preservation needed
   - Migration will clear any test embeddings - acceptable loss

2. **Timing:**
   - ✅ **Decision Made:** Do alignment NOW (before Chunk 1)
   - Clean foundation prevents cascading errors in file uploads implementation

---

## Execution Status: ✅ COMPLETE

All alignment tasks completed:

1. ✅ **Database Schema Fixed**
   - Created migration: `20251111000000_fix_embedding_dimensions_to_1024.sql`
   - Applied migration via `npx supabase db reset`
   - Verified: `journal.embedding` is now `VECTOR(1024)`
   - HNSW index recreated successfully

2. ✅ **Code Fixed**
   - Updated `src/lib/context-builder.ts` line 204
   - Changed model from `voyage-3-large` to `voyage-3`
   - Comment updated to reflect 1024 dimensions

3. ✅ **Documentation Updated**
   - Updated `docs/embeddings-architecture.md`
   - All references changed from 1536-dim to 1024-dim
   - All references changed from "Gemini" / "voyage-3-large" to "voyage-3"
   - Cost information added: $0.06/M tokens

4. ✅ **Test Scripts Verified**
   - `test-voyage.js` already uses `voyage-3` model (correct)
   - No changes needed

**All systems aligned. Ready to begin Chunk 1 of file uploads feature.**
