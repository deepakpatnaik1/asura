# Multiuser Implementation - Work Breakdown

**Based on**: [multiuser-canonical-plan.md](multiuser-canonical-plan.md)

This document organizes the multiuser implementation into logical, independently testable chunks.

---

## 🔍 Chunk 0: Prerequisites & Discovery (MUST DO FIRST)

**Goal**: Gather critical information needed to execute the plan safely.

**Duration**: 2-3 hours

**Tasks**:
1. **Audit Context Builder** - Read [src/lib/context-builder.ts](src/lib/context-builder.ts)
   - List all Supabase queries
   - Identify which queries need `user_id` filtering
   - Document functions that need `userId` parameter added

2. **Audit Client-Side Queries** - Search codebase for direct Supabase access
   - `grep -r "createClient" src/`
   - `grep -r ".from(" src/**/*.svelte`
   - List all files with client-side database queries

3. **Research External API Rate Limits**
   - Fireworks AI: Document req/sec and tokens/min limits
   - Voyage AI: Document req/sec limits
   - Confirm current batch processing (5 concurrent, 5s delay) is safe

4. **Test CASCADE Delete Behavior**
   - Create test user in local Supabase
   - Insert test data across all tables
   - Delete user from `auth.users`
   - Verify CASCADE works for: superjournal, journal, files, file_chunks, user_settings

5. **Document Findings**
   - Create summary document with audit results
   - Flag any surprises or blockers
   - Update canonical plan if needed

**Deliverables**:
- `docs/multiuser-prerequisites-audit.md` with all findings
- Green light to proceed OR list of blockers to address

**Testing**: Manual verification of audit results

---

## 🔐 Chunk 1: Basic Authentication (No Data Isolation Yet)

**Goal**: Get Google OAuth login working. Users can log in, but no data isolation yet.

**Duration**: 4-6 hours

**Tasks**:
1. **Supabase Auth Setup**
   - Enable Google OAuth in Supabase dashboard
   - Configure redirect URLs (local + production placeholder)
   - Get OAuth credentials from Google Cloud Console

2. **Create Login Page** - `src/routes/login/+page.svelte`
   - Google OAuth button
   - Basic styling

3. **Create OAuth Callback** - `src/routes/auth/callback/+page.server.ts`
   - Handle OAuth code exchange
   - Redirect to home on success

4. **Add Auth Middleware** - `src/hooks.server.ts`
   - Create server Supabase client
   - Protect all routes except `/login` and `/auth/callback`
   - Add `locals.getSession()` helper

5. **Create Auth Store** - `src/lib/stores/auth.ts`
   - Client-side session store
   - Auth state change listener

6. **Update Root Layout** - `src/routes/+layout.svelte`
   - Initialize auth store
   - Subscribe to auth changes

7. **Add Logout Button** - Update `src/routes/+page.svelte`
   - Logout handler
   - Sign out from Supabase

8. **Update TypeScript Types** - `src/app.d.ts`
   - Add `locals.supabase` and `locals.getSession` types

**Files Created**:
- `src/routes/login/+page.svelte`
- `src/routes/auth/callback/+page.server.ts`
- `src/lib/stores/auth.ts`

**Files Updated**:
- `src/hooks.server.ts`
- `src/routes/+layout.svelte`
- `src/routes/+page.svelte`
- `src/app.d.ts`

**Testing**:
- ✅ Can log in with Google account
- ✅ Redirected to `/login` when not authenticated
- ✅ Can access main page after login
- ✅ Can log out successfully
- ✅ Session persists across page refreshes

**Dependencies**: None

---

## 🗄️ Chunk 2: Database Schema Migration

**Goal**: Add `user_id` and `is_public` columns to all tables. Nuke existing data.

**Duration**: 2-3 hours

**Tasks**:
1. **Create Migration** - `supabase/migrations/20251118000000_add_multiuser_columns.sql`
   - Add `user_id` columns to: superjournal, journal, files, user_settings
   - Add `is_public` columns to: journal, files
   - Add CASCADE delete constraints
   - Create indexes for performance
   - TRUNCATE all existing data
   - Make `user_id` NOT NULL

2. **Run Migration Locally**
   - `npx supabase db reset`
   - Verify schema changes in Supabase Studio

3. **Verify CASCADE Deletes**
   - Insert test data with test user
   - Delete test user
   - Confirm all related data deleted

**Files Created**:
- `supabase/migrations/20251118000000_add_multiuser_columns.sql`

**Testing**:
- ✅ Migration runs without errors
- ✅ All tables have `user_id` column
- ✅ `journal` and `files` have `is_public` column
- ✅ Indexes created successfully
- ✅ CASCADE delete verified with test data
- ✅ All existing data nuked

**Dependencies**: Chunk 0 (CASCADE verification)

---

## 🔍 Chunk 3: Update Vector Search Functions

**Goal**: Modify vector search functions to filter by `user_id` and support `is_public`.

**Duration**: 1-2 hours

**Tasks**:
1. **Create Migration** - `supabase/migrations/20251118000001_update_vector_search_functions.sql`
   - Update `search_journal_by_embedding()` with `user_id_filter` parameter
   - Update `search_file_chunks()` with `user_id_filter` parameter
   - Add `is_public` logic: `WHERE (user_id = user_id_filter OR is_public = true)`

2. **Run Migration Locally**
   - `npx supabase db reset` (re-runs all migrations)
   - Test functions in Supabase Studio

3. **Manual Test Vector Search**
   - Create two test users
   - Insert journal entries for each user
   - Call vector search functions
   - Verify user A can't see user B's data

**Files Created**:
- `supabase/migrations/20251118000001_update_vector_search_functions.sql`

**Testing**:
- ✅ Functions accept `user_id_filter` parameter
- ✅ Functions return user's own data
- ✅ Functions return public data (when `is_public = true`)
- ✅ Functions don't return other users' private data

**Dependencies**: Chunk 2 (schema migration)

---

## 🔧 Chunk 4: Context Builder & Multi-Tenant Supabase Client

**Goal**: Update context builder to pass `userId` and create authenticated Supabase client helper.

**Duration**: 3-4 hours

**Tasks**:
1. **Create Server Supabase Helper** - `src/lib/supabase-server.ts`
   - `createAuthenticatedClient(authToken)` function
   - `createAdminClient()` function

2. **Update Context Builder** - `src/lib/context-builder.ts`
   - Add `userId: string` parameter
   - Add `supabase: SupabaseClient` parameter
   - Pass `user_id_filter` to vector search functions
   - Add `.eq('user_id', userId)` to all direct queries
   - Update function signature

3. **Update Chat Endpoint** - `src/routes/api/chat/+server.ts`
   - Get session and userId
   - Create authenticated Supabase client
   - Pass userId to context builder
   - Add error handling for missing session

4. **Audit & Update Based on Chunk 0 Findings**
   - Apply user_id filtering to all queries identified in audit

**Files Created**:
- `src/lib/supabase-server.ts`

**Files Updated**:
- `src/lib/context-builder.ts`
- `src/routes/api/chat/+server.ts`

**Testing**:
- ✅ Chat endpoint requires authentication (401 if not logged in)
- ✅ Context builder only loads current user's data
- ✅ Vector search only returns current user's memories/files
- ✅ Superjournal only shows current user's turns

**Dependencies**: Chunk 0 (context builder audit), Chunk 1 (auth), Chunk 3 (vector search functions)

---

## 🚪 Chunk 5: API Authentication for All Endpoints

**Goal**: Add auth checks to all remaining API endpoints.

**Duration**: 2-3 hours

**Tasks**:
1. **Update File Upload** - `src/routes/api/files/upload/+server.ts`
   - Add session check
   - Create authenticated client
   - Add userId to file record

2. **Update File Get** - `src/routes/api/files/[id]/+server.ts`
   - Add session check
   - Create authenticated client
   - RLS will automatically filter by user_id

3. **Update File Delete** - `src/routes/api/files/[id]/+server.ts`
   - Add session check
   - Create authenticated client
   - RLS will automatically filter by user_id

4. **Update Settings** - `src/routes/api/settings/+server.ts`
   - Add session check
   - Create authenticated client
   - Filter by user_id

5. **Update Nuke** - `src/routes/api/nuke/+server.ts`
   - Add session check
   - Will update to call user-scoped nuke function (created in Chunk 7)

6. **Update SSE Events** - `src/routes/api/files/events/+server.ts`
   - Get auth token from query parameter
   - Verify token and get user
   - Filter Realtime channel by user_id

7. **Update Client SSE Connection** - `src/routes/+page.svelte`
   - Pass auth token as query parameter to SSE endpoint

**Files Updated**:
- `src/routes/api/files/upload/+server.ts`
- `src/routes/api/files/[id]/+server.ts`
- `src/routes/api/settings/+server.ts`
- `src/routes/api/nuke/+server.ts`
- `src/routes/api/files/events/+server.ts`
- `src/routes/+page.svelte`

**Testing**:
- ✅ All endpoints return 401 when not authenticated
- ✅ File upload creates file with correct user_id
- ✅ File get only returns user's own files
- ✅ File delete only deletes user's own files
- ✅ Settings only shows/updates user's own settings
- ✅ SSE only broadcasts user's own file events

**Dependencies**: Chunk 1 (auth), Chunk 4 (supabase-server helper)

---

## 🛡️ Chunk 6: Row-Level Security (RLS)

**Goal**: Enable RLS and create policies to enforce data isolation at database level.

**Duration**: 2-3 hours

**Tasks**:
1. **Enable RLS** - `supabase/migrations/20251118000002_enable_rls.sql`
   - Enable RLS on all tables

2. **Create RLS Policies** - `supabase/migrations/20251118000003_create_rls_policies.sql`
   - Create `is_admin()` helper function
   - Create policies for: superjournal, journal, files, file_chunks, user_settings, models
   - Include admin bypass: `OR is_admin()`
   - Include `is_public` support for journal and files

3. **Run Migrations Locally**
   - `npx supabase db reset`
   - Verify policies created in Supabase Studio

4. **Test RLS Enforcement**
   - Create two test users
   - Attempt cross-user access via direct SQL queries
   - Verify RLS blocks unauthorized access
   - Verify admin can see all data

**Files Created**:
- `supabase/migrations/20251118000002_enable_rls.sql`
- `supabase/migrations/20251118000003_create_rls_policies.sql`

**Testing**:
- ✅ RLS enabled on all tables
- ✅ User A cannot SELECT user B's data
- ✅ User A cannot INSERT with user B's user_id
- ✅ User A cannot UPDATE user B's data
- ✅ User A cannot DELETE user B's data
- ✅ Admin (deepakpatnaik1@gmail.com) can access all data
- ✅ Public data (`is_public = true`) visible to all users
- ✅ Models table readable by all authenticated users

**Dependencies**: Chunk 2 (schema migration)

---

## 🗑️ Chunk 7: User-Scoped Nuke & Soft Delete

**Goal**: Update nuke function to be user-scoped and add soft delete for accounts.

**Duration**: 2-3 hours

**Tasks**:
1. **Create User-Scoped Nuke** - `supabase/migrations/20251118000004_update_nuke_function.sql`
   - `nuke_user_data(target_user_id)` function
   - Deletes: superjournal, journal, files (CASCADE handles chunks)
   - Preserves: user_settings

2. **Create Soft Delete** - `supabase/migrations/20251118000005_soft_delete_account.sql`
   - Add `deleted_at` column to `auth.users`
   - `soft_delete_account(target_user_id)` function
   - `cleanup_deleted_accounts()` function (90-day retention)
   - Note about setting up pg_cron scheduler

3. **Update Nuke API Endpoint** - `src/routes/api/nuke/+server.ts`
   - Call `nuke_user_data()` function
   - Pass current user's ID

4. **Run Migrations Locally**
   - `npx supabase db reset`

**Files Created**:
- `supabase/migrations/20251118000004_update_nuke_function.sql`
- `supabase/migrations/20251118000005_soft_delete_account.sql`

**Files Updated**:
- `src/routes/api/nuke/+server.ts`

**Testing**:
- ✅ Nuke deletes all user's conversations and files
- ✅ Nuke preserves user_settings
- ✅ Nuke doesn't affect other users' data
- ✅ Soft delete marks account with `deleted_at` timestamp
- ✅ Cleanup function deletes accounts older than 90 days

**Dependencies**: Chunk 2 (schema), Chunk 6 (RLS)

---

## 🚦 Chunk 8: Rate Limiting (Database-Based)

**Goal**: Implement concurrent connection rate limiting (1 chat, 1 file upload per user).

**Duration**: 3-4 hours

**Tasks**:
1. **Create Rate Limiting Schema** - `supabase/migrations/20251118000006_rate_limiting.sql`
   - Create `rate_limits` table
   - `check_concurrent_limit()` function
   - `release_concurrent_slot()` function
   - `cleanup_stale_rate_limits()` function (remove connections >1 hour old)
   - Note about pg_cron scheduler

2. **Create Rate Limiter Helper** - `src/lib/rate-limiter.ts`
   - `checkConcurrentLimit()` wrapper
   - `releaseConcurrentSlot()` wrapper

3. **Update Chat Endpoint** - `src/routes/api/chat/+server.ts`
   - Check rate limit before processing (limit: 1)
   - Release slot in `finally` block
   - Return 429 if limit exceeded

4. **Update File Upload Endpoint** - `src/routes/api/files/upload/+server.ts`
   - Check rate limit before processing (limit: 1)
   - Pass connectionId to background processor
   - Release slot in background job's `finally` block
   - Return 429 if limit exceeded

5. **Update File Processor** - `src/lib/file-processor.ts`
   - Accept connectionId parameter
   - Release rate limit slot when processing completes

6. **Run Migration Locally**
   - `npx supabase db reset`

**Files Created**:
- `supabase/migrations/20251118000006_rate_limiting.sql`
- `src/lib/rate-limiter.ts`

**Files Updated**:
- `src/routes/api/chat/+server.ts`
- `src/routes/api/files/upload/+server.ts`
- `src/lib/file-processor.ts`

**Testing**:
- ✅ User can send 1 chat message (2nd message gets 429 until 1st completes)
- ✅ User can upload 1 file (2nd upload gets 429 until 1st completes)
- ✅ Rate limit slot released when operation completes
- ✅ Rate limit slot released on error
- ✅ Stale connections (>1 hour) cleaned up

**Dependencies**: Chunk 4 (authenticated client), Chunk 5 (API auth)

---

## 💾 Chunk 9: Storage Quota Enforcement (1GB per User)

**Goal**: Enforce 1GB storage limit per user with hard rejection.

**Duration**: 1-2 hours

**Tasks**:
1. **Update File Upload Endpoint** - `src/routes/api/files/upload/+server.ts`
   - Query user's current storage usage
   - Calculate total after upload
   - Reject with 413 if exceeds 1GB
   - Include helpful error message with current usage

2. **Add Storage Display to UI** (Optional bonus)
   - Show user their current storage usage
   - Show remaining quota

**Files Updated**:
- `src/routes/api/files/upload/+server.ts`
- `src/routes/+page.svelte` (optional)

**Testing**:
- ✅ Upload rejected when user has >1GB stored
- ✅ Error message shows current usage
- ✅ Upload succeeds when under quota
- ✅ Storage calculation accurate (sums file_size column)

**Dependencies**: Chunk 5 (file upload auth)

---

## ⛔ Chunk 10: Cancel File Processing on Logout

**Goal**: Abort in-progress file processing jobs when user logs out.

**Duration**: 2-3 hours

**Tasks**:
1. **Update File Processor** - `src/lib/file-processor.ts`
   - Track active jobs in Map with AbortController
   - Pass abort signal to all async operations
   - Handle AbortError and mark file as cancelled
   - Export `cancelUserJobs(userId)` function

2. **Create Cancel Endpoint** - `src/routes/api/files/cancel/+server.ts`
   - Get userId from session
   - Call `cancelUserJobs(userId)`
   - Return success

3. **Update Logout Handler** - `src/routes/+page.svelte`
   - Call cancel endpoint before signing out
   - Wait for cancellation to complete

**Files Created**:
- `src/routes/api/files/cancel/+server.ts`

**Files Updated**:
- `src/lib/file-processor.ts`
- `src/routes/+page.svelte`

**Testing**:
- ✅ File processing aborted when user logs out
- ✅ File marked as 'cancelled' in database
- ✅ Rate limit slot released on cancellation
- ✅ Logout completes successfully after cancellation

**Dependencies**: Chunk 5 (file upload), Chunk 8 (rate limiting)

---

## ✅ Chunk 11: Input Validation with Zod

**Goal**: Add input validation to all API endpoints.

**Duration**: 2-3 hours

**Tasks**:
1. **Install Zod** - `npm install zod`

2. **Create Validation Schemas** - `src/lib/validation.ts`
   - `chatMessageSchema` (message length, persona)
   - `fileUploadSchema` (filename, size, type)
   - `settingsUpdateSchema` (persona, model IDs)

3. **Apply to Chat Endpoint** - `src/routes/api/chat/+server.ts`
   - Validate request body with Zod
   - Return 400 on validation error

4. **Apply to File Upload** - `src/routes/api/files/upload/+server.ts`
   - Validate file metadata
   - Return 400 on validation error

5. **Apply to Settings** - `src/routes/api/settings/+server.ts`
   - Validate settings update
   - Return 400 on validation error

**Files Created**:
- `src/lib/validation.ts`

**Files Updated**:
- `src/routes/api/chat/+server.ts`
- `src/routes/api/files/upload/+server.ts`
- `src/routes/api/settings/+server.ts`

**Testing**:
- ✅ Chat rejects messages >100KB
- ✅ Chat rejects invalid persona
- ✅ File upload rejects files >10MB
- ✅ File upload rejects invalid file types
- ✅ Settings rejects invalid model IDs
- ✅ Validation errors return helpful messages

**Dependencies**: Chunk 5 (API endpoints)

---

## 🎯 Chunk 12: Default User Settings (Database Trigger)

**Goal**: Auto-create default settings when new user signs up.

**Duration**: 1-2 hours

**Tasks**:
1. **Create Migration** - `supabase/migrations/20251118000007_default_user_settings.sql`
   - `create_default_user_settings()` trigger function
   - Gets default model IDs from `models` table
   - Inserts default settings for new user
   - Trigger on `auth.users` INSERT

2. **Run Migration Locally**
   - `npx supabase db reset`

3. **Test Trigger**
   - Create new test user via Supabase Auth
   - Verify `user_settings` row created automatically
   - Verify default values correct

**Files Created**:
- `supabase/migrations/20251118000007_default_user_settings.sql`

**Testing**:
- ✅ New user signup creates user_settings row
- ✅ Default persona is 'gunnar'
- ✅ Default models set correctly
- ✅ No application code needed (zero runtime overhead)

**Dependencies**: Chunk 2 (schema)

---

## 📄 Chunk 13: Legal Documentation (Privacy Policy & ToS)

**Goal**: Create privacy policy and terms of service pages.

**Duration**: 1-2 hours

**Tasks**:
1. **Create Privacy Policy** - `src/routes/privacy/+page.svelte`
   - Standard template covering data collection, usage, storage, retention
   - Mention Google OAuth, Fireworks AI, Voyage AI, Supabase
   - 90-day retention after deletion
   - 1GB storage limit

2. **Create Terms of Service** - `src/routes/terms/+page.svelte`
   - Standard template covering usage limits, acceptable use, liability
   - Rate limits: 1 concurrent chat, 1 concurrent file upload
   - Storage limit: 1GB per user
   - File size limit: 10MB per file

3. **Add Links to Footer/Login Page**
   - Link to privacy policy
   - Link to terms of service

**Files Created**:
- `src/routes/privacy/+page.svelte`
- `src/routes/terms/+page.svelte`

**Files Updated**:
- `src/routes/login/+page.svelte` (add links)

**Testing**:
- ✅ Privacy policy page loads
- ✅ Terms of service page loads
- ✅ Links accessible from login page

**Dependencies**: None (can be done anytime)

---

## 🧪 Chunk 14: Multiuser Isolation Testing

**Goal**: Verify user data isolation with automated tests.

**Duration**: 3-4 hours

**Tasks**:
1. **Create Test File** - `tests/multiuser-isolation.test.ts`
   - Test: User A cannot see User B's conversations
   - Test: User A cannot see User B's files
   - Test: User A cannot access User B's file via API
   - Test: Vector search doesn't return other users' data
   - Test: SSE doesn't broadcast other users' events
   - Test: Admin can see all users' data

2. **Create Test Helpers**
   - Helper to create test users
   - Helper to log in as different users
   - Helper to create test data for users

3. **Run Tests**
   - `npm run test:e2e tests/multiuser-isolation.test.ts`

**Files Created**:
- `tests/multiuser-isolation.test.ts`

**Testing**:
- ✅ All isolation tests pass
- ✅ RLS enforcement verified
- ✅ Admin access verified
- ✅ Public data sharing works (when `is_public = true`)

**Dependencies**: Chunks 1-12 (all functionality implemented)

---

## 🚀 Chunk 15: Production Deployment

**Goal**: Deploy to Vercel with production Supabase instance.

**Duration**: 3-4 hours

**Tasks**:
1. **Supabase Production Setup**
   - Create new Supabase project (or use existing)
   - Enable Google OAuth with production credentials
   - Configure redirect URL: `https://oovar.ai/auth/callback`
   - Run all migrations in production
   - Enable connection pooler (Supavisor)
   - Set up pg_cron for cleanup jobs (rate limits, soft deletes)

2. **Google OAuth Production Setup**
   - Create OAuth client in Google Cloud Console
   - Add authorized redirect URI: `https://oovar.ai/auth/callback`
   - Get production credentials
   - Add to Supabase Auth settings

3. **Vercel Deployment**
   - Connect GitHub repo to Vercel
   - Set environment variables:
     - `PUBLIC_SUPABASE_URL`
     - `PUBLIC_SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_ROLE_KEY`
     - `FIREWORKS_API_KEY`
     - `VOYAGE_API_KEY`
   - Deploy

4. **Production Testing**
   - Test login flow
   - Create test account
   - Send chat message
   - Upload file
   - Test nuke button
   - Verify rate limiting
   - Verify storage quota
   - Check Supabase logs

5. **Monitoring Setup**
   - Set up alerts in Supabase dashboard:
     - Database connection pool >80%
     - Auth failure rate >10%
     - Slow queries >1 second

**Deliverables**:
- Live production app at `oovar.ai`
- Monitoring alerts configured
- Documentation for production environment

**Testing**:
- ✅ Production login works
- ✅ All features functional in production
- ✅ No secrets exposed in client code
- ✅ Monitoring alerts active
- ✅ Performance acceptable (p95 latency <2s)

**Dependencies**: Chunks 1-14 (all implementation and testing complete)

---

## Summary

**Total Chunks**: 16 (0-15)
**Estimated Duration**: 35-50 hours
**Recommended Order**: Sequential (0 → 1 → 2 → ... → 15)

**Checkpoints** (Good stopping points for review):
- ✅ After Chunk 1: Basic auth working
- ✅ After Chunk 6: RLS enabled, data isolated
- ✅ After Chunk 11: All security hardening complete
- ✅ After Chunk 14: All tests passing
- ✅ After Chunk 15: Production deployed

**Critical Path**:
Chunk 0 → Chunk 1 → Chunk 2 → Chunk 3 → Chunk 4 → Chunk 5 → Chunk 6

Everything else can be parallelized or reordered after Chunk 6, but sequential execution is safest.
