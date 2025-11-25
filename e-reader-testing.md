# E-Reader Systematic Testing & Debugging

## Overview

**Project**: Asura E-Reader Module
**Date Started**: 2024-11-25
**Testing Lead**: User
**Documentation**: Claude

## E-Reader Architecture Summary

### Core Components

1. **Frontend** ([src/routes/reader/+page.svelte](src/routes/reader/+page.svelte))
   - Paste area for HTML article input
   - Article display with processed content
   - Q&A chat interface for article questions
   - Charts carousel for visual content
   - Article library dropdown for switching between articles
   - Abort button for canceling processing

2. **API Endpoints** (src/routes/api/reader/*)
   - `/upload` - Receives HTML, creates article record
   - `/convert-pdf` - Generates PDF, uploads to storage & Anthropic
   - `/filter-charts` - AI-powered chart relevance filtering
   - `/process-article` - Main AI processing with Brave Search
   - `/charts` - Fetches charts for an article
   - `/chat` - Q&A interface with article context
   - `/chat-history` - Loads previous Q&A sessions
   - `/articles` - Lists all user articles
   - `/article` - Gets single article details

3. **Database Tables**
   - `articles` - Stores article content, PDFs, Anthropic file IDs
   - `article_charts` - Stores extracted charts/images
   - `article_chat` - Stores Q&A conversation history
   - `user_settings` - Persists active article selection

4. **External Services**
   - **Anthropic Files API** - PDF and image uploads for context
   - **Brave Search API** - Real-time web search during processing
   - **Supabase Storage** - PDF and image file storage

### Processing Flow

1. User pastes HTML article content
2. `/upload` creates article record, extracts title
3. `/convert-pdf` generates PDF, extracts images, uploads to Anthropic
4. `/filter-charts` determines which images are relevant charts
5. `/process-article` runs AI analysis with web search
6. Article displays with processed content
7. Charts load in carousel (filtered for relevance)
8. User can ask questions via Q&A interface

---

## Test Plan

We will systematically test each component of the e-reader. Tests will be documented as:
- **Test ID**: Unique identifier (T-001, T-002, etc.)
- **Test Case**: What we're testing
- **Expected Result**: What should happen
- **Actual Result**: What actually happened
- **Status**: ✅ PASS | ❌ FAIL | ⚠️ PARTIAL | ⏸️ PENDING
- **Notes**: Additional observations

---

## Test Sessions

### Session 1: 2024-11-25

#### T-001: Paste Area Visual Styling
- Requirement: Pitch black interior, text matches message body styling
- Fix: Removed frosted glass, set `background: rgb(0, 0, 0)`
- Status: ✅ PASS

#### T-002: Processing Overlay & Auto-Send
- Requirement: Auto-send on paste, frosted glass overlay over article, spinner on top
- Fix: Added `.processing-overlay` with `backdrop-filter: blur(8px)`, z-index layering (paste-area: 20, overlay: 25, spinner: 30)
- Status: ✅ PASS

#### T-003: Article Upload & Processing
- Initial Bug: "Failed to create article record" (RLS without policies)
- Fix Applied: Migration `20251125000000_add_reader_rls_policies.sql` + code fix for `locals.supabase`
- Retest Result: ⚠️ PARTIAL PASS
  - ✅ Article created
  - ✅ PDF converted
  - ✅ Charts filtered
  - ✅ AI response streaming
  - ❌ "Failed to save results to database" error at end

#### T-003a: Markdown Formatting Issue
- Bug: Minor markdown formatting issue in rendered article
- Severity: 🟢 LOW
- Status: ✅ FIXED

#### T-003b: Canvas Scrolling During Stream
- Bug: Thumbnail/chart area scrolls during AI response streaming
- Expected: Should be fixed in place like input bar
- Severity: 🟡 MEDIUM
- Status: ✅ FIXED (canvas now sticky)

#### T-005: Charts Not Displaying
- Bug: Article has images/charts but canvas area shows nothing
- Expected: Charts extracted from article should appear in canvas carousel
- Severity: 🔴 CRITICAL
- Status: ✅ FIXED

**Investigation Session 2 (2025-11-25):**

Console logs revealed:
```
[Log] [Charts] Loaded – 6 – "charts"
[Error] Failed to load resource: the server responded with a status of 400 () (chart-1.jpg)
... (all 6 charts fail with 400)
```

**Root Cause:** URL construction in `charts/+server.ts` was missing the bucket name.

```typescript
// BUG: Missing bucket name
`${PUBLIC_SUPABASE_URL}/storage/v1/object/public/${chart.thumbnail_path}`
// Resulted in: .../object/public/article-thumbnails/...

// FIX: Added bucket name 'articles'
`${PUBLIC_SUPABASE_URL}/storage/v1/object/public/articles/${chart.thumbnail_path}`
// Now produces: .../object/public/articles/article-thumbnails/...
```

**Additional Fix:** Made `articles` storage bucket public in Supabase Dashboard.

**Result:** Thumbnails and image carousel now display correctly.

#### T-003c: Database Save Failure
- Bug: Red error box: "Failed to save results to database"
- Console: `[Pipeline] Error: Failed to save results to database`
- Root Cause: CHECK constraint `notes_status_check` only allows `'processing'` and `'ready'`, but code tried to set `'complete'`
- Fix: Changed `status: 'complete'` → `status: 'ready'` in process-article endpoint
- Severity: 🔴 CRITICAL
- Status: ✅ FIXED

---

## Bug Tracker

| Bug ID | Test ID | Description | Severity | Status | Root Cause | Fix Applied |
|--------|---------|-------------|----------|--------|------------|-------------|
| B-001 | T-003 | Article creation fails with RLS policy violation | 🔴 CRITICAL | ✅ FIXED | RLS enabled but no policies existed; code used ANON_KEY | Migration 20251125000000 |

**Severity Levels:**
- 🔴 **CRITICAL**: Blocks core functionality
- 🟠 **HIGH**: Major feature broken
- 🟡 **MEDIUM**: Feature partially working
- 🟢 **LOW**: Minor issue, cosmetic

---

## Investigation Notes

### B-001 Investigation (2025-11-25)

**Symptoms:**
- Red error box: "Failed to create article record"
- Console: "new row violates row-level security policy for table 'articles'"

**Root Cause Analysis:**

1. **RLS Enabled Without Policies**: All three e-reader tables (`articles`, `article_charts`, `article_chat`) had RLS enabled but NO policies defined. This blocks all operations.

2. **Wrong Supabase Client**: All reader endpoints used `PUBLIC_SUPABASE_ANON_KEY` instead of `SUPABASE_SERVICE_ROLE_KEY`. The anon key respects RLS (which was blocking everything), while service role bypasses RLS.

3. **Column Name Mismatch**: `article_chat` table had column `note_id` but code expected `article_id`. Latent bug not yet triggered due to RLS blocking earlier.

**Decision:** Add proper RLS policies (proper security fix) rather than switching to service role key (quick bypass).

**Tables Affected:**
| Table | RLS Enabled | Policies Before | Policies After |
|-------|-------------|-----------------|----------------|
| articles | Yes | None | 4 (CRUD) |
| article_charts | Yes | None (migration unapplied) | 4 (CRUD) |
| article_chat | Yes | None | 4 (CRUD) |

**Additional Fix:** Renamed `article_chat.note_id` to `article_chat.article_id` for consistency.

---

## Resolution Log

### B-001 Resolution (2025-11-25)

**Fix Applied:** Migration `20251125000000_add_reader_rls_policies.sql`

**Changes:**
1. Renamed `article_chat.note_id` → `article_chat.article_id`
2. Added 4 RLS policies to `articles` (SELECT, INSERT, UPDATE, DELETE)
3. Added 4 RLS policies to `article_charts` (SELECT, INSERT, UPDATE, DELETE)
4. Added 4 RLS policies to `article_chat` (SELECT, INSERT, UPDATE, DELETE)
5. Added performance indexes on `article_chat`

**Policy Pattern:**
- SELECT: `auth.uid() = user_id OR is_admin(auth.uid())`
- INSERT/UPDATE/DELETE: `auth.uid() = user_id`

**To Apply:**
1. Go to Supabase Dashboard SQL Editor
2. Copy contents of `supabase/migrations/20251125000000_add_reader_rls_policies.sql`
3. Run the migration
4. Verify with test queries in migration comments

**Verification Status:** ⏸️ PENDING (awaiting migration application)

---

### Session 2: 2025-11-25 (continued)

#### T-004: Article Delete Functionality
- **Status**: ✅ COMPLETE

**Individual Delete** (trash icon in dropdown):
- 3-second countdown modal, dropdown stays open during delete
- Retry logic (3 attempts, exponential backoff)
- `isDeleting` state prevents concurrent deletes
- Cleans up: Supabase Storage (3 buckets), database (CASCADE)
- Skips Anthropic Files API (files auto-expire)

**Nuke Button** (flame icon):
- Separate `/api/reader/nuke` endpoint
- 3-second countdown modal (same UI)
- Deletes ALL user's e-reader data
- Cleans up: all storage files, all database records
- Clears local state (articles, currentArticle, charts, chatHistory)