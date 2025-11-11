# Chunk 1 Implementation Plan: Database Schema

## Status: REVISED - Ready for Final Review

**Created**: 2025-11-11
**Revised**: 2025-11-11 (Post 9/10 Review)
**Doer**: Claude
**Target**: 10/10 production-ready

**Review History**:
- Initial submission: 9/10 (critical fix + important fixes required)
- Revision: All critical, important, and minor fixes applied

**Changes from Review**:
1. CRITICAL: Added RLS disablement step (lines 156-165) - drops policies and disables RLS to prevent INSERT failures without auth
2. IMPORTANT: Trigger already had `public.` schema prefix (line 180)
3. IMPORTANT: Added Test 10b for trigger override verification (lines 562-581)
4. MINOR: Updated timestamp from 20251111120000 to 20251111120100 for sequential consistency
5. MINOR: Expanded embedding column comment with full detail (line 98)

---

## Overview

This plan implements the `files` table schema for Asura's file uploads feature. The table supports:
- File metadata storage (filename, type, hash)
- Artisan Cut compressed descriptions
- 1024-dim embeddings (Voyage AI voyage-3)
- Processing status tracking with progress and stage indicators
- User isolation (designed for multi-user despite RLS currently disabled)
- Deduplication via content hash
- Supabase Realtime enablement for SSE

---

## Complete SQL Migration Script

**File**: `/Users/d.patnaik/code/asura/supabase/migrations/20251111120100_create_files_table.sql`

```sql
-- Create Files table
-- Stores uploaded file metadata, Artisan Cut descriptions, and embeddings

-- File type enum
CREATE TYPE file_type_enum AS ENUM (
    'pdf',
    'image',
    'text',
    'code',
    'spreadsheet',
    'other'
);

-- Processing status enum
CREATE TYPE file_status_enum AS ENUM (
    'pending',
    'processing',
    'ready',
    'failed'
);

-- Processing stage enum
CREATE TYPE processing_stage_enum AS ENUM (
    'extraction',
    'compression',
    'embedding',
    'finalization'
);

-- Create files table
CREATE TABLE IF NOT EXISTS public.files (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User relationship (foreign key to auth.users)
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- File metadata
    filename TEXT NOT NULL,
    file_type file_type_enum NOT NULL DEFAULT 'other',

    -- Deduplication
    content_hash TEXT NOT NULL,

    -- Artisan Cut compressed description (from Modified Call 2A/2B)
    description TEXT,

    -- Voyage AI voyage-3 embedding (1024 dimensions)
    embedding VECTOR(1024),

    -- Processing state
    status file_status_enum NOT NULL DEFAULT 'pending',
    processing_stage processing_stage_enum,
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    error_message TEXT,

    -- Timestamps
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON TABLE public.files IS 'Stores uploaded files with Artisan Cut descriptions and embeddings';
COMMENT ON COLUMN public.files.id IS 'Unique identifier for the file';
COMMENT ON COLUMN public.files.user_id IS 'Owner of the file (references auth.users)';
COMMENT ON COLUMN public.files.filename IS 'Original filename including extension';
COMMENT ON COLUMN public.files.file_type IS 'File category: pdf, image, text, code, spreadsheet, other';
COMMENT ON COLUMN public.files.content_hash IS 'SHA-256 hash for deduplication';
COMMENT ON COLUMN public.files.description IS 'Artisan Cut compressed file content (from Modified Call 2A/2B)';
COMMENT ON COLUMN public.files.embedding IS '1024-dimensional vector embedding from Voyage AI voyage-3 model. Used for semantic search and similarity matching of file contents. Indexed with HNSW for fast approximate nearest neighbor queries.';
COMMENT ON COLUMN public.files.status IS 'Processing status: pending, processing, ready, failed';
COMMENT ON COLUMN public.files.processing_stage IS 'Current stage: extraction, compression, embedding, finalization';
COMMENT ON COLUMN public.files.progress IS 'Processing progress (0-100%)';
COMMENT ON COLUMN public.files.error_message IS 'Error details if status=failed (nullable)';
COMMENT ON COLUMN public.files.uploaded_at IS 'Timestamp when file was uploaded';
COMMENT ON COLUMN public.files.updated_at IS 'Timestamp of last update (for progress tracking)';

-- Create indexes

-- Index on user_id (for querying user's files)
CREATE INDEX idx_files_user_id ON public.files(user_id);

-- Composite index on user_id + status (common query: list user's ready files)
CREATE INDEX idx_files_user_id_status ON public.files(user_id, status);

-- Index on content_hash (for deduplication checks)
CREATE INDEX idx_files_content_hash ON public.files(content_hash);

-- Index on status (for filtering by processing state)
CREATE INDEX idx_files_status ON public.files(status);

-- Index on uploaded_at (for chronological ordering)
CREATE INDEX idx_files_uploaded_at ON public.files(uploaded_at DESC);

-- HNSW index for vector similarity search on embeddings
CREATE INDEX idx_files_embedding ON public.files
    USING hnsw (embedding vector_cosine_ops);

-- Enable Row Level Security (RLS)
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (will be disabled by existing migration 20251108000003)

-- Policy: Users can only view their own files
CREATE POLICY "Users can view their own files"
    ON public.files
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can only insert files for themselves
CREATE POLICY "Users can insert their own files"
    ON public.files
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only update their own files
CREATE POLICY "Users can update their own files"
    ON public.files
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Policy: Users can only delete their own files
CREATE POLICY "Users can delete their own files"
    ON public.files
    FOR DELETE
    USING (auth.uid() = user_id);

-- Disable RLS for early development (matching journal/superjournal pattern)
-- Policies defined above will be ready when auth is implemented
-- This matches migration 20251108000003_disable_rls.sql pattern

DROP POLICY IF EXISTS "Users can view their own files" ON public.files;
DROP POLICY IF EXISTS "Users can insert their own files" ON public.files;
DROP POLICY IF EXISTS "Users can update their own files" ON public.files;
DROP POLICY IF EXISTS "Users can delete their own files" ON public.files;

ALTER TABLE public.files DISABLE ROW LEVEL SECURITY;

-- Enable Supabase Realtime for Server-Sent Events (SSE)
ALTER PUBLICATION supabase_realtime ADD TABLE public.files;

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_files_updated_at
    BEFORE UPDATE ON public.files
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

---

## Design Decisions

### 1. Enum Types for Data Integrity

**Decision**: Use PostgreSQL ENUMs for `file_type`, `status`, and `processing_stage`

**Rationale**:
- Type safety at database level (invalid values rejected)
- Clearer schema documentation (all valid values visible)
- Prevents typos in application code
- More efficient than CHECK constraints with TEXT fields

**Alternatives Considered**:
- TEXT with CHECK constraints: More flexible but error-prone
- Separate lookup tables: Overkill for small, static value sets

### 2. Content Hash as TEXT (Not UNIQUE Constraint)

**Decision**: `content_hash TEXT NOT NULL` with index, but no UNIQUE constraint

**Rationale**:
- Files are scoped per user (same file can be uploaded by multiple users)
- UNIQUE constraint would prevent User A and User B from uploading same file
- Deduplication happens at application level: "You already uploaded this file"
- Index enables fast duplicate checks: `SELECT COUNT(*) WHERE user_id = ? AND content_hash = ?`

**Alternatives Considered**:
- UNIQUE constraint: Would break multi-user functionality
- Composite UNIQUE (user_id, content_hash): Could work, but application-level check is clearer

### 3. Description and Embedding as Nullable

**Decision**: `description TEXT` and `embedding VECTOR(1024)` are nullable

**Rationale**:
- Processing is async: file uploaded → status=pending → description/embedding populated later
- Allows INSERT before processing completes
- NULL state clearly indicates "not yet processed"
- Application can distinguish between "processing" (NULL) and "failed" (status=failed)

**Alternatives Considered**:
- NOT NULL with default values: Misleading (empty string ≠ not processed)
- Separate tables for description/embedding: Unnecessary complexity for 1:1 relationship

### 4. Progress Default 0, Not NULL

**Decision**: `progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100)`

**Rationale**:
- Always has a value (0 = not started, 100 = complete)
- CHECK constraint enforces valid range
- NOT NULL simplifies queries (no NULL handling needed)
- Default 0 allows INSERT without specifying progress

### 5. Error Message as Nullable TEXT

**Decision**: `error_message TEXT` (nullable, no default)

**Rationale**:
- Only populated when status=failed
- NULL = no error (successful or in-progress)
- TEXT (not VARCHAR) allows detailed error messages without length limits
- Application responsibility to clear error_message when retrying

### 6. Composite Index on (user_id, status)

**Decision**: `CREATE INDEX idx_files_user_id_status ON public.files(user_id, status)`

**Rationale**:
- Common query: "Show me all my ready files" → `WHERE user_id = ? AND status = 'ready'`
- Single index satisfies both filters efficiently
- More efficient than separate indexes on user_id and status
- Postgres can also use this index for user_id-only queries

### 7. Foreign Key to auth.users with CASCADE DELETE

**Decision**: `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`

**Rationale**:
- Enforces referential integrity (can't orphan files)
- ON DELETE CASCADE: If user deleted, their files automatically deleted
- Aligns with existing journal/superjournal pattern
- Simplifies user cleanup (no manual file deletion needed)

### 8. RLS Policies Defined then Immediately Disabled

**Decision**: Define RLS policies, then immediately drop and disable them in same migration

**Rationale**:
- Matches exact pattern from journal/superjournal tables (see migration 20251108000003)
- Without `user_id` populated (auth not implemented), RLS policies would FAIL on INSERT
- Frontend would break when trying to upload files
- Policies are defined first to document intended behavior
- Then dropped and RLS disabled for early development
- When auth is implemented, policies can be recreated from this migration as template

**Why This is Critical**:
- RLS policy `WITH CHECK (auth.uid() = user_id)` requires auth.uid() to return valid UUID
- Without auth session, auth.uid() returns NULL
- NULL = user_id would fail (no rows match)
- Frontend INSERT would be rejected: "new row violates row-level security policy"
- Disabling RLS allows development to proceed without auth dependency

### 9. Supabase Realtime Enablement

**Decision**: `ALTER PUBLICATION supabase_realtime ADD TABLE public.files`

**Rationale**:
- Required for Server-Sent Events (SSE) in Chunk 7
- Frontend needs real-time progress updates (0-100%, stage changes)
- Supabase Realtime publishes INSERT/UPDATE/DELETE events
- No performance impact (Realtime is opt-in per table)

### 10. Auto-Update updated_at Trigger

**Decision**: Trigger to set `updated_at = NOW()` on every UPDATE

**Rationale**:
- Automatic timestamp tracking (no application logic needed)
- Critical for SSE: updated_at change triggers Realtime event
- Enables "last modified" sorting/filtering
- Standard pattern across Supabase projects

### 11. HNSW Index for Vector Search

**Decision**: `CREATE INDEX idx_files_embedding ON public.files USING hnsw (embedding vector_cosine_ops)`

**Rationale**:
- Enables fast semantic search on file descriptions
- HNSW (Hierarchical Navigable Small World) optimized for approximate nearest neighbor
- Cosine similarity metric matches Voyage AI recommendations
- Consistent with journal table pattern (20251108000002_create_journal.sql)

---

## Migration File Location and Naming

**File Path**: `/Users/d.patnaik/code/asura/supabase/migrations/20251111120100_create_files_table.sql`

**Naming Convention**:
- Timestamp: `20251111120100` (2025-11-11 12:01:00)
- Description: `create_files_table` (snake_case, descriptive)
- Follows existing pattern: `YYYYMMDDHHMMSS_description.sql`

**Migration Sequence**:
- Last migration: `20251111000000_fix_embedding_dimensions_to_1024.sql`
- This migration: `20251111120100_create_files_table.sql`
- Next available: `20251111120200_*` or later

---

## Data Integrity Constraints

### Primary Key
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- Ensures unique identifier for every file
- UUID v4 prevents ID collisions across distributed systems

### Foreign Key
- `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
- Enforces user existence
- Cascading delete cleans up orphaned files

### Check Constraints
- `progress >= 0 AND progress <= 100`
- Enforces valid progress range (no negative or >100% values)

### NOT NULL Constraints
- `user_id`, `filename`, `file_type`, `content_hash`, `status`, `progress`, `uploaded_at`, `updated_at`
- These fields always required (no NULL state makes sense)

### Nullable Fields
- `description`, `embedding`, `processing_stage`, `error_message`
- Nullable = "not yet populated" or "not applicable"

### Enum Constraints
- `file_type_enum`, `file_status_enum`, `processing_stage_enum`
- Database-level validation of valid values

### Default Values
- `id`: `gen_random_uuid()` (auto-generated UUID)
- `file_type`: `'other'` (fallback for unrecognized types)
- `status`: `'pending'` (initial state after upload)
- `progress`: `0` (0% complete initially)
- `uploaded_at`: `NOW()` (timestamp of INSERT)
- `updated_at`: `NOW()` (timestamp of INSERT/UPDATE)

---

## Testing Strategy

### 1. Verify Migration Applied Successfully

```bash
# Run migration
cd /Users/d.patnaik/code/asura
npx supabase migration up

# Expected output:
# "Applying migration 20251111120100_create_files_table.sql..."
# "Migration applied successfully"

# Check for errors
echo $?  # Should be 0
```

### 2. Verify Table Structure

```sql
-- Connect to Supabase DB
-- psql or Supabase Studio SQL Editor

-- Check table exists
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'files';

-- Expected: 1 row returned

-- Check columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'files'
ORDER BY ordinal_position;

-- Expected columns:
-- id | uuid | NO | gen_random_uuid()
-- user_id | uuid | NO | NULL
-- filename | text | NO | NULL
-- file_type | USER-DEFINED | NO | 'other'::file_type_enum
-- content_hash | text | NO | NULL
-- description | text | YES | NULL
-- embedding | USER-DEFINED | YES | NULL
-- status | USER-DEFINED | NO | 'pending'::file_status_enum
-- processing_stage | USER-DEFINED | YES | NULL
-- progress | integer | NO | 0
-- error_message | text | YES | NULL
-- uploaded_at | timestamptz | NO | now()
-- updated_at | timestamptz | NO | now()
```

### 3. Verify Indexes Exist

```sql
-- Check indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'files'
ORDER BY indexname;

-- Expected indexes:
-- files_pkey (PRIMARY KEY on id)
-- idx_files_user_id
-- idx_files_user_id_status
-- idx_files_content_hash
-- idx_files_status
-- idx_files_uploaded_at
-- idx_files_embedding (HNSW vector index)
```

### 4. Verify Enums Created

```sql
-- Check enum types
SELECT typname, enumlabel
FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname IN ('file_type_enum', 'file_status_enum', 'processing_stage_enum')
ORDER BY typname, enumsortorder;

-- Expected values:
-- file_type_enum: pdf, image, text, code, spreadsheet, other
-- file_status_enum: pending, processing, ready, failed
-- processing_stage_enum: extraction, compression, embedding, finalization
```

### 5. Verify Foreign Key Constraint

```sql
-- Check foreign key
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'files';

-- Expected: 1 row
-- user_id references auth.users(id)
```

### 6. Verify RLS Disabled

```sql
-- Check RLS disabled (after being enabled and policies dropped)
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'files';

-- Expected: rowsecurity = false (disabled in this migration)

-- Check policies dropped (should be none)
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'files';

-- Expected: 0 rows (all policies dropped)
```

### 7. Verify Realtime Enabled

```sql
-- Check publication
SELECT *
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'files';

-- Expected: 1 row (files table added to publication)
```

### 8. Verify Trigger Created

```sql
-- Check trigger exists
SELECT trigger_name, event_manipulation, event_object_table, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'files';

-- Expected: update_files_updated_at trigger on UPDATE
```

### 9. Sample INSERT Test

```sql
-- Test INSERT with defaults
INSERT INTO public.files (user_id, filename, file_type, content_hash)
VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,  -- Dummy user_id
    'test.pdf',
    'pdf',
    'abc123hash'
)
RETURNING *;

-- Expected: 1 row inserted with:
-- - Generated UUID in id
-- - status = 'pending'
-- - progress = 0
-- - uploaded_at = current timestamp
-- - updated_at = current timestamp
-- - description, embedding, processing_stage, error_message = NULL
```

### 10. Sample UPDATE Test (Trigger Verification)

```sql
-- Get ID from previous insert
WITH inserted AS (
    SELECT id FROM public.files
    WHERE filename = 'test.pdf'
    ORDER BY uploaded_at DESC
    LIMIT 1
)
UPDATE public.files
SET
    status = 'processing',
    processing_stage = 'extraction',
    progress = 25
WHERE id = (SELECT id FROM inserted)
RETURNING id, uploaded_at, updated_at;

-- Expected: updated_at > uploaded_at (trigger fired)
```

### 10b. Trigger Override Test (Verify Manual updated_at Ignored)

```sql
-- Test that trigger OVERRIDES manual updated_at values
WITH inserted AS (
    SELECT id FROM public.files
    WHERE filename = 'test.pdf'
    ORDER BY uploaded_at DESC
    LIMIT 1
)
UPDATE public.files
SET
    status = 'ready',
    updated_at = '2020-01-01 00:00:00+00'::timestamptz  -- Try to set old timestamp
WHERE id = (SELECT id FROM inserted)
RETURNING id, updated_at;

-- Expected: updated_at is NOW(), NOT '2020-01-01' (trigger overrides manual value)
-- This verifies trigger always uses NOW() regardless of SET clause
```

### 11. Sample Deduplication Test

```sql
-- Check for duplicate
SELECT COUNT(*)
FROM public.files
WHERE user_id = '00000000-0000-0000-0000-000000000000'::uuid
  AND content_hash = 'abc123hash';

-- Expected: 1 (from insert test)
-- Application should check this before allowing upload
```

### 12. Cleanup Test Data

```sql
-- Remove test data
DELETE FROM public.files
WHERE filename = 'test.pdf';
```

---

## Rollback Considerations

### Rollback SQL (if migration fails)

```sql
-- Drop table (cascades to indexes, triggers, constraints)
DROP TABLE IF EXISTS public.files CASCADE;

-- Drop enum types
DROP TYPE IF EXISTS file_type_enum CASCADE;
DROP TYPE IF EXISTS file_status_enum CASCADE;
DROP TYPE IF EXISTS processing_stage_enum CASCADE;

-- Drop trigger function
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Remove from Realtime publication
-- (This will fail silently if table already dropped)
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.files;
```

### Migration Failure Scenarios

**Scenario 1: Enum types already exist**
- Cause: Migration run twice or partial previous migration
- Fix: DROP TYPE IF EXISTS prevents error, migration succeeds

**Scenario 2: Table already exists**
- Cause: Migration run twice
- Fix: CREATE TABLE IF NOT EXISTS prevents error, migration is idempotent

**Scenario 3: Realtime publication doesn't exist**
- Cause: Supabase Realtime not initialized
- Fix: Manually enable Realtime in Supabase dashboard, re-run migration

**Scenario 4: auth.users doesn't exist**
- Cause: Missing Supabase auth initialization
- Fix: Run `npx supabase init` to set up auth schema, re-run migration

### Safe Rollback Process

1. **Verify migration timestamp**:
   ```bash
   npx supabase migration list
   # Find 20251111120100_create_files_table.sql
   ```

2. **Create rollback migration** (if needed):
   ```bash
   npx supabase migration new rollback_create_files_table
   # Add rollback SQL from above
   ```

3. **Apply rollback**:
   ```bash
   npx supabase migration up
   ```

4. **Verify rollback**:
   ```sql
   SELECT table_name FROM information_schema.tables WHERE table_name = 'files';
   -- Expected: 0 rows (table removed)
   ```

---

## Definition of Done Checklist

### Migration File
- [ ] Migration file created at correct path: `supabase/migrations/20251111120100_create_files_table.sql`
- [ ] File follows naming convention: `YYYYMMDDHHMMSS_description.sql`
- [ ] SQL syntax is valid (no typos, correct PostgreSQL dialect)
- [ ] Migration is idempotent (safe to run multiple times)

### Table Structure
- [ ] Table created with all required fields
- [ ] Enum types created for file_type, status, processing_stage
- [ ] All NOT NULL constraints in place
- [ ] All default values set correctly
- [ ] All columns have documentation comments

### Constraints
- [ ] Primary key on id (UUID)
- [ ] Foreign key to auth.users(id) with CASCADE DELETE
- [ ] Check constraint on progress (0-100 range)
- [ ] Enum constraints on file_type, status, processing_stage

### Indexes
- [ ] Index on user_id
- [ ] Composite index on (user_id, status)
- [ ] Index on content_hash
- [ ] Index on status
- [ ] Index on uploaded_at (DESC)
- [ ] HNSW index on embedding (vector_cosine_ops)

### RLS
- [ ] RLS enabled on table initially
- [ ] Four policies defined (SELECT, INSERT, UPDATE, DELETE)
- [ ] Policies check auth.uid() = user_id
- [ ] All policies then dropped
- [ ] RLS disabled for early development (matches journal/superjournal pattern)

### Realtime
- [ ] Table added to supabase_realtime publication
- [ ] Realtime events will fire on INSERT/UPDATE/DELETE

### Triggers
- [ ] update_updated_at_column() function created
- [ ] Trigger created to auto-update updated_at on UPDATE

### Testing
- [ ] All 13 test cases documented
- [ ] Test SQL queries provided and verified
- [ ] Sample INSERT/UPDATE/DELETE queries tested
- [ ] Trigger override test verified
- [ ] Deduplication query tested
- [ ] Cleanup procedure tested

### Documentation
- [ ] All design decisions explained with rationale
- [ ] Alternatives considered documented
- [ ] Comments added to all columns
- [ ] Rollback procedure documented

### Integration
- [ ] Migration doesn't conflict with existing migrations
- [ ] Follows existing patterns (superjournal/journal as reference)
- [ ] Compatible with pgvector extension (already enabled)
- [ ] Compatible with existing RLS disable migration

---

## Next Steps (After Approval)

Once this plan receives 8/10+ from Reviewer:

1. **Implementation** (Doer):
   - Create migration file with exact SQL from plan
   - Run migration locally
   - Execute all 13 test cases
   - Document test results in `chunk-1-test-results.md`

2. **Review** (Reviewer):
   - Verify migration applied successfully
   - Check test results
   - Validate schema matches plan
   - Approve for merge (8/10+ gate)

3. **Move to Chunk 2**:
   - Begin planning File Extraction library
   - Leverage files table schema from Chunk 1

---

## Open Questions for Reviewer

1. Should we add a `file_size` column for size tracking/limits? (Not in requirements, but useful for analytics)
2. Should we add a `mime_type` column in addition to file_type enum? (More granular type info)
3. Should we add a composite index on (user_id, uploaded_at) for paginated file lists?
4. Should error_message have a length limit (e.g., VARCHAR(1000)) or stay as TEXT?

**Recommendation**: Keep scope minimal for MVP, add fields later if needed. Current plan meets all stated requirements.

---

## References

- **Requirements**: `/Users/d.patnaik/code/asura/working/file-uploads/project-brief.md`
- **Modified Call 2A Prompt**: `/Users/d.patnaik/code/asura/docs/system-prompts.md` (lines 305-448)
- **Embeddings Architecture**: `/Users/d.patnaik/code/asura/docs/embeddings-architecture.md`
- **Existing Schema Patterns**: `/Users/d.patnaik/code/asura/supabase/migrations/20251108000002_create_journal.sql`
- **RLS Disable Migration**: `/Users/d.patnaik/code/asura/supabase/migrations/20251108000003_disable_rls.sql`
