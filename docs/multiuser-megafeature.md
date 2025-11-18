# Multiuser Megafeature

## Goal

Production-ready multiuser authentication and authorization for 999 users.

## User Requirements (Canonical - As Specified by User)

The following requirements are **law** and override all recommendations in the original plan:

1. **Existing Data**: Delete all existing data in migration (clean slate)
2. **Auth UI**: Dedicated `/login` route at `oovar.ai` with Google OAuth
3. **Default Settings**: PostgreSQL trigger auto-creates user_settings on signup
4. **Storage Quota**: 1GB per user, no file count limit
5. **Quota Exceeded**: Hard reject uploads with error message
6. **Nuke Function**: User-scoped, deletes conversations/files but preserves user_settings
7. **Rate Limits**:
   - Max 1 concurrent chat streaming response per user
   - Max 1 concurrent file processing job per user
8. **Rate Limiter Storage**: Database-based (Supabase)
9. **Hosting**: Vercel (single instance, hobby/free tier)
10. **Admin**: Hardcoded `deepakpatnaik1@gmail.com` as admin with full data access
11. **Welcome Experience**: Empty state, no tutorial or welcome message
12. **Error Tracking**: Supabase built-in logs only (no Sentry)
13. **Staging Environment**: None (deploy directly to production)
14. **Legal Docs**: Create standard templates for privacy policy and ToS (no legal review)
15. **GDPR**: Skip for now (will add later)
16. **Shared Knowledge Base**: Add `is_public` boolean columns now to `files` and `journal` tables for future use
17. **Logout During File Processing**: Cancel file processing jobs when user logs out
18. **Account Deletion**: 90-day soft delete retention period
19. **Supabase Plan**: Start with Free tier, upgrade to Pro when needed
20. **SSE Authentication**: Pass auth token as query parameter (not session-based)
21. **Deployment**: Single server instance (no auto-scaling)

## Implementation Phases

### Phase 1: Authentication Foundation

#### 1.1 Supabase Auth Setup
- Enable Google OAuth provider in Supabase dashboard
- Configure OAuth redirect URLs (local: `http://localhost:5173/auth/callback`, production: TBD)
- Add email/password auth as fallback (optional, for testing)

#### 1.2 Auth UI/UX Flow
**Decision needed**: Choose one approach:
- **Option A**: Gate entire app behind login (redirect to `/login` if not authenticated)
- **Option B**: Show login modal overlay on main page
- **Option C**: Dedicated `/login` route with redirect back to app

**Tradeoffs**:
- Option A: More routes, redirect complexity, but **supports deep linking** (e.g., `/chat/conversation-123`)
- Option B: Simpler UX, no navigation interruption, but **breaks deep linking** (shared URLs fail)
- Option C: Same as A, explicit redirect handling, supports deep linking

**Recommendation**: Option A or C (dedicated route) - deep linking is critical for shared URLs

**Implementation** (assuming Option A chosen):
- Create `src/routes/login/+page.svelte` with Google OAuth button
- Create `src/routes/auth/callback/+page.server.ts` to handle OAuth callback
- Add auth middleware in `src/hooks.server.ts` to redirect unauthenticated users
- Preserve intended destination URL during redirect (e.g., redirect to `/login?redirect=/chat/conversation-123`)
- Add logout button in Settings panel
- Add user profile display (email, avatar) in UI header

#### 1.3 Session Management
- Store auth tokens in httpOnly cookies (Supabase default)
- Auth state managed via `$page.data.session` (SvelteKit pattern)
- Create `src/lib/stores/auth.ts` for client-side auth state
- Handle token refresh automatically (Supabase client handles this)

**Question**: What happens to active users during deployment? Do we force re-login?

#### 1.4 Multi-Tenant Supabase Client
**Critical**: Current code likely uses single global Supabase client. With RLS, need per-request clients initialized with user's auth token.

**Files requiring updates**:
- Create `src/lib/supabase-server.ts` for server-side authenticated clients
- Update all API endpoints to use per-request client initialization
- Audit client-side Supabase usage (if any direct queries exist, they need RLS awareness)

**Pattern**:
```typescript
// src/lib/supabase-server.ts
import { createClient } from '@supabase/supabase-js';

export function createAuthenticatedClient(authToken: string) {
  return createClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      }
    }
  );
}
```

**Question**: Are there any client-side direct Supabase queries? If so, they all need auditing.

### Phase 2: Database Schema Migration

#### 2.1 Add user_id to All Tables

**Migration file**: `supabase/migrations/YYYYMMDDHHMMSS_add_user_id_columns.sql`

Tables requiring user_id:
- `superjournal` (conversation working memory)
- `journal` (compressed memory)
- `files` (uploaded files metadata)
- `user_settings` (user preferences)

Tables NOT requiring user_id:
- `models` (shared catalog, admin-managed)
- `file_chunks` (inherits ownership via foreign key to files - redundant user_id adds index overhead and consistency risk)

**Migration SQL structure**:
```sql
ALTER TABLE superjournal ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE journal ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE files ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE user_settings ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX idx_superjournal_user_id ON superjournal(user_id);
CREATE INDEX idx_journal_user_id ON journal(user_id);
CREATE INDEX idx_files_user_id ON files(user_id);
CREATE INDEX idx_user_settings_user_id ON user_settings(user_id);
```

**Note**: `file_chunks` does NOT get user_id column. Ownership is established via `files.user_id` + foreign key relationship. Adding user_id to chunks creates:
- Redundant index maintenance
- Double storage overhead
- Consistency risk (chunk.user_id could diverge from file.user_id)

**Verification step**: Test CASCADE deletes in migration
```sql
-- After migration, verify CASCADE works:
-- 1. Create test user in auth.users
-- 2. Insert test data with test user_id
-- 3. DELETE FROM auth.users WHERE id = test_user_id
-- 4. Verify all related rows deleted from superjournal, journal, files, file_chunks, user_settings
```

#### 2.2 Backfill Existing Data

**Question**: How to handle existing data (development/testing data)?

**Options**:
- **Option A**: Create single admin user, backfill all existing data with admin user_id
- **Option B**: Delete all existing data, start fresh
- **Option C**: Attribute existing data to first authenticated user

**If Option B chosen**: Add to migration:
```sql
TRUNCATE superjournal, journal, files, file_chunks, user_settings CASCADE;
```

**If Option A chosen**: Create migration script to:
1. Create admin user in auth.users (use Supabase dashboard or Auth Admin API)
2. Update all tables: `UPDATE [table] SET user_id = '[admin-uuid]' WHERE user_id IS NULL;`
3. Add NOT NULL constraint: `ALTER TABLE [table] ALTER COLUMN user_id SET NOT NULL;`

#### 2.3 Update Vector Search Functions

**Modify existing functions** in `supabase/migrations/`:

`search_journal_by_embedding()`:
```sql
-- Add user_id parameter and filter
CREATE OR REPLACE FUNCTION search_journal_by_embedding(
  query_embedding vector(1024),
  match_threshold float,
  match_count int,
  user_id_filter uuid  -- NEW PARAMETER
)
RETURNS TABLE (...)
AS $$
BEGIN
  RETURN QUERY
  SELECT ...
  FROM journal
  WHERE embedding <=> query_embedding < match_threshold
    AND user_id = user_id_filter  -- NEW FILTER
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
```

Same pattern for `search_file_chunks()`, but filter via JOIN:
```sql
CREATE OR REPLACE FUNCTION search_file_chunks(
  query_embedding vector(1024),
  match_threshold float,
  match_count int,
  user_id_filter uuid  -- NEW PARAMETER
)
RETURNS TABLE (...)
AS $$
BEGIN
  RETURN QUERY
  SELECT fc.*
  FROM file_chunks fc
  INNER JOIN files f ON fc.file_id = f.id
  WHERE fc.embedding <=> query_embedding < match_threshold
    AND f.user_id = user_id_filter  -- FILTER VIA FILES TABLE
  ORDER BY fc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
```

**Question**: Should vector search ever cross user boundaries? (e.g., shared knowledge base feature in future?)

#### 2.4 Update Context Builder

**Critical**: `src/lib/context-builder.ts` calls vector search functions. Must pass userId through entire call chain.

**Files requiring updates**:
- `src/lib/context-builder.ts`: Add userId parameter, pass to search functions
- `src/routes/api/chat/+server.ts`: Pass userId from session to context builder

**Pattern**:
```typescript
// src/lib/context-builder.ts
export async function buildContext(userId: string, userMessage: string) {
  // ... existing logic ...

  // When calling vector search:
  const { data: journalResults } = await supabase.rpc('search_journal_by_embedding', {
    query_embedding: embedding,
    match_threshold: 0.7,
    match_count: 10,
    user_id_filter: userId  // NEW PARAMETER
  });
}
```

**Question**: Does context builder have direct Supabase queries that need user_id filtering?

### Phase 3: Row-Level Security (RLS)

#### 3.1 Enable RLS on All Tables

**Migration file**: `supabase/migrations/YYYYMMDDHHMMSS_enable_rls.sql`

```sql
ALTER TABLE superjournal ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE models ENABLE ROW LEVEL SECURITY;
```

#### 3.2 Create RLS Policies

**Superjournal Policies**:
```sql
-- Users can only read their own data
CREATE POLICY superjournal_select_policy ON superjournal
  FOR SELECT USING (auth.uid() = user_id);

-- Users can only insert their own data
CREATE POLICY superjournal_insert_policy ON superjournal
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only update their own data
CREATE POLICY superjournal_update_policy ON superjournal
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can only delete their own data
CREATE POLICY superjournal_delete_policy ON superjournal
  FOR DELETE USING (auth.uid() = user_id);
```

**Apply same pattern to**: journal, files, user_settings

**File Chunks Policies** (inherit ownership from files via JOIN):
```sql
CREATE POLICY file_chunks_select_policy ON file_chunks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM files
      WHERE files.id = file_chunks.file_id
      AND files.user_id = auth.uid()
    )
  );

-- Same pattern for INSERT, UPDATE, DELETE
```

**Models Table Policies** (read-only for all authenticated users):
```sql
CREATE POLICY models_select_policy ON models
  FOR SELECT USING (auth.role() = 'authenticated');
```

**Question**: Do we need admin users who can see all data? If yes, add admin role check to policies.

#### 3.3 Update Nuke Function

**Current issue**: `nuke_everything()` function truncates all tables globally.

**Options**:
- **Option A**: Make nuke user-scoped (delete only current user's data, preserve user_settings)
- **Option B**: Remove nuke function entirely in production
- **Option C**: Make nuke admin-only
- **Option D**: Delete user from auth.users (CASCADE handles all user data)

**Updated function (Option A - user-scoped nuke)**:
```sql
CREATE OR REPLACE FUNCTION nuke_user_data(target_user_id uuid)
RETURNS void AS $$
BEGIN
  DELETE FROM superjournal WHERE user_id = target_user_id;
  DELETE FROM journal WHERE user_id = target_user_id;
  DELETE FROM files WHERE user_id = target_user_id;  -- CASCADE handles file_chunks
  -- Do NOT delete user_settings (preserves preferences)
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Alternative (Option D - full user deletion)**:
```sql
CREATE OR REPLACE FUNCTION delete_user_account(target_user_id uuid)
RETURNS void AS $$
BEGIN
  -- Cascade delete handles superjournal, journal, files, file_chunks, user_settings
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Question**: Should nuke preserve user_settings or delete everything including settings?

### Phase 4: API Security Hardening

#### 4.1 Auth Token Validation

**Pattern for all API endpoints** (`+server.ts` files):

```typescript
import { error } from '@sveltejs/kit';
import { createAuthenticatedClient } from '$lib/supabase-server';

export async function POST({ request, locals }) {
  const session = await locals.getSession();

  if (!session) {
    throw error(401, 'Unauthorized');
  }

  const userId = session.user.id;
  const supabase = createAuthenticatedClient(session.access_token);

  // Use userId in all database queries and pass authenticated client
  // ...
}
```

**Files requiring updates**:
- `src/routes/api/chat/+server.ts`
- `src/routes/api/files/upload/+server.ts`
- `src/routes/api/files/[id]/+server.ts`
- `src/routes/api/settings/+server.ts`
- `src/routes/api/nuke/+server.ts`
- `src/routes/api/files/events/+server.ts` (SSE endpoint)

#### 4.2 Background Job Authentication

**Decision**: Background jobs MUST use service role key with explicit user_id checks.

**Why this is the only viable option**:
- User auth tokens expire (15min-1hr), background jobs can take 5+ minutes for file processing
- User could log out mid-processing, invalidating token
- User could delete session, orphaning the job
- Database triggers cannot call external APIs (Fireworks AI, Voyage AI)

**Implementation pattern**:
```typescript
// src/lib/file-processor.ts
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  env.PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY  // Service role bypasses RLS
);

async function processFile(fileId: string, userId: string) {
  // CRITICAL: Service role bypasses RLS, so we MUST validate userId explicitly
  const { data: file } = await supabaseAdmin
    .from('files')
    .select('*')
    .eq('id', fileId)
    .eq('user_id', userId)  // CRITICAL: explicit user_id check
    .single();

  if (!file || file.user_id !== userId) {
    throw new Error('Unauthorized');
  }

  // Process file (chunking, compression, embedding)...

  // CRITICAL: Always include user_id in WHERE clause when using service role
  await supabaseAdmin
    .from('files')
    .update({ status: 'completed', progress: 100 })
    .eq('id', fileId)
    .eq('user_id', userId);  // CRITICAL: prevent cross-user updates

  // Same pattern for file_chunks inserts
  await supabaseAdmin
    .from('file_chunks')
    .insert(chunks.map(chunk => ({
      file_id: fileId,
      // Verify file ownership via JOIN in application logic before insert
      ...chunk
    })));
}
```

**Security rules for service role usage**:
1. Always include `user_id` in WHERE clauses for SELECT/UPDATE/DELETE
2. Verify ownership before any write operation
3. Never trust `fileId` alone - always check `file.user_id === userId`
4. Log all service role operations for audit trail

**Question**: What happens to in-progress file processing if user logs out mid-processing? Should jobs continue or abort?

**Recommendation**: Jobs continue - user logout doesn't mean "cancel processing". User can see results on next login.

#### 4.3 SSE Real-Time Security

**Answer**: Supabase Realtime respects RLS policies natively (as of late 2023).

**Implementation**: Use authenticated Realtime channels with user-specific filters.

```typescript
// src/routes/api/files/events/+server.ts
export async function GET({ locals }) {
  const session = await locals.getSession();

  if (!session) {
    throw error(401, 'Unauthorized');
  }

  const userId = session.user.id;
  const supabase = createAuthenticatedClient(session.access_token);

  // Subscribe to user-specific channel with RLS-aware filter
  const channel = supabase
    .channel(`user:${userId}:files`)
    .on('postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'files',
        filter: `user_id=eq.${userId}`  // Supabase Realtime supports filters
      },
      (payload) => {
        // RLS ensures only user's events are received
        // Send SSE event to client
      }
    )
    .subscribe();

  // Return SSE stream
}
```

**Key advantage**: Realtime filtering happens at database level, not application level. No resource leak from processing all users' events.

**Verification**: Test that User A does not receive User B's file events even on same channel.

#### 4.4 Secrets Management Audit

**Current state**: Review `.env` file usage

**Required changes**:
- `SUPABASE_SERVICE_ROLE_KEY`: Server-only (never expose to client)
- `PUBLIC_SUPABASE_ANON_KEY`: Can be public (RLS protects data)
- `FIREWORKS_API_KEY`: Server-only
- `VOYAGE_API_KEY`: Server-only

**Verify**:
- No API keys in client-side code
- All API calls to Fireworks/Voyage happen server-side
- Environment variables prefixed with `PUBLIC_` only for truly public values
- Check build output for accidental key inclusion
- Scan git history for committed secrets (use `git-secrets` or similar)

#### 4.5 Rate Limiting

**Decision**: Rate limiting must be based on **concurrent connections**, not requests-per-minute.

**Why requests-per-minute is wrong**:
- Chat API: One request holds connection open for 30+ seconds (streaming response)
- File upload: One request triggers 2-5 minute background processing
- Counting these as "1 request" allows users to flood system with 60 concurrent long-running operations

**Correct approach**: Limit concurrent operations per user
- Chat API: Max 3 concurrent chat sessions per user
- File upload: Max 2 concurrent file processing jobs per user
- Settings: Traditional request-per-minute (30/min) is fine for quick operations

**Implementation**:
```typescript
// src/lib/rate-limiter.ts
const concurrentConnections = new Map<string, Set<string>>();

export function checkConcurrentLimit(userId: string, operationType: string, limit: number, connectionId: string): boolean {
  const key = `${userId}:${operationType}`;

  if (!concurrentConnections.has(key)) {
    concurrentConnections.set(key, new Set());
  }

  const connections = concurrentConnections.get(key)!;

  if (connections.size >= limit && !connections.has(connectionId)) {
    return false;  // Limit exceeded
  }

  connections.add(connectionId);
  return true;
}

export function releaseConcurrentSlot(userId: string, operationType: string, connectionId: string) {
  const key = `${userId}:${operationType}`;
  const connections = concurrentConnections.get(key);

  if (connections) {
    connections.delete(connectionId);
    if (connections.size === 0) {
      concurrentConnections.delete(key);
    }
  }
}
```

**Usage in chat endpoint**:
```typescript
export async function POST({ request, locals }) {
  const session = await locals.getSession();
  const userId = session.user.id;
  const connectionId = crypto.randomUUID();

  if (!checkConcurrentLimit(userId, 'chat', 3, connectionId)) {
    throw error(429, 'Too many concurrent chat sessions');
  }

  try {
    // Stream chat response...
  } finally {
    releaseConcurrentSlot(userId, 'chat', connectionId);
  }
}
```

**Options for persistence**:
- **Option A**: Upstash Redis (external service, $10/mo, persistent across restarts, distributed)
- **Option B**: In-memory Map (loses state on server restart, free, single-instance only)
- **Option C**: Database-based counter (adds DB load, persistent)

**Question**: Do we need distributed rate limiting (multi-instance deployment) or is single-instance sufficient?

#### 4.6 Input Validation

**Add validation for**:
- File uploads: size (10MB max), type (PDF/TXT/MD only), filename sanitization
- Chat messages: length (prevent DoS with 100KB message limit)
- Settings updates: validate model IDs exist in models table
- User input sanitization: prevent XSS, SQL injection (though RLS + parameterized queries handle SQL injection)

**Library recommendation**: Zod for schema validation

**Example**:
```typescript
import { z } from 'zod';

const chatMessageSchema = z.object({
  message: z.string().max(100000),  // 100KB limit
  persona: z.enum(['gunnar', 'kirby'])
});

export async function POST({ request, locals }) {
  const body = await request.json();
  const parsed = chatMessageSchema.safeParse(body);

  if (!parsed.success) {
    throw error(400, 'Invalid input');
  }

  // Use parsed.data
}
```

#### 4.7 Connection Pooling & Database Limits

**Critical issue**: Supabase connection limits
- Free tier: 60 concurrent connections
- Pro tier ($25/mo): 200 concurrent connections

**Risk**: With 999 users × concurrent requests, connection pool exhaustion is likely.

**Mitigation options**:
- **Option A**: Use Supabase connection pooler (Supavisor, built-in)
- **Option B**: Implement pgBouncer separately
- **Option C**: Upgrade to Team plan (400 connections, $599/mo)

**Recommendation**: Use Supabase connection pooler (Option A) on Pro plan. Monitor connection pool usage in production.

**Monitoring alert**: Database connection pool > 80% of limit

#### 4.8 External API Rate Limits

**Fireworks AI rate limits** (verify current limits):
- Need to check Fireworks docs for requests/second, tokens/minute limits
- File processing batches: 5 concurrent compressions with 5s delay
- Question: Will 50 concurrent file uploads overwhelm Fireworks rate limits?

**Voyage AI rate limits** (verify current limits):
- Need to check Voyage docs for requests/second limits
- Embedding batches: 5 concurrent embeddings with 5s delay
- Question: What happens if we hit rate limit? Retry logic needed?

**Recommendation**: Add retry logic with exponential backoff for both APIs. Monitor API error rates (429 Too Many Requests).

### Phase 5: User Onboarding & Defaults

#### 5.1 Create Default Settings on First Login

**Recommendation**: Use database trigger for zero runtime overhead.

**Option A - Database Trigger** (recommended):
```sql
CREATE OR REPLACE FUNCTION create_default_user_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_settings (user_id, selected_persona, selected_conversation_model, selected_compression_model)
  VALUES (NEW.id, 'gunnar', 'default-conversation-model', 'default-compression-model');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_user_settings();
```

**Option B - Auth Hook** (NOT RECOMMENDED - has bugs):
```typescript
// BROKEN: event.locals.settingsChecked is not persisted across requests
// SvelteKit event.locals is request-scoped, this won't work as intended
const settingsHook = async ({ event, resolve }) => {
  const session = event.locals.session;

  if (session) {
    if (!event.locals.settingsChecked) {  // This resets every request!
      // Database hit on EVERY request - performance issue
    }
  }
  return resolve(event);
};
```

**If auth hook is required** (e.g., Supabase triggers not available), store flag in session cookie:
```typescript
const settingsHook = async ({ event, resolve }) => {
  const session = event.locals.session;

  if (session) {
    // Check cookie flag instead of event.locals
    const settingsInitialized = event.cookies.get('settings_initialized');

    if (!settingsInitialized) {
      const { data: settings } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

      if (!settings) {
        await supabase.from('user_settings').insert({ /* ... */ });
      }

      // Set cookie flag to prevent future checks
      event.cookies.set('settings_initialized', 'true', {
        path: '/',
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 365  // 1 year
      });
    }
  }

  return resolve(event);
};
```

**Recommendation**: Use database trigger (Option A) unless Supabase doesn't support triggers on auth.users.

#### 5.2 Welcome Experience

**Question**: Should new users see a welcome message or tutorial?

**Options**:
- Empty state with "Upload your first file" prompt
- Pre-populated example conversation (requires seeding journal/superjournal)
- Onboarding modal explaining features
- No special treatment (just empty chat)

#### 5.3 Storage Quota Enforcement

**Critical missing piece**: What happens when a user hits their storage limit?

**Need to decide**:
- Per-user storage quota (e.g., 100MB per user, 10 files max)?
- What happens on quota exceeded?
  - Reject upload with error message?
  - Delete oldest files FIFO?
  - Allow overages with warning?

**Implementation** (if enforcing quota):
```typescript
export async function POST({ request, locals }) {
  const session = await locals.getSession();
  const userId = session.user.id;

  // Check current storage usage
  const { data: files } = await supabase
    .from('files')
    .select('file_size')
    .eq('user_id', userId);

  const totalStorage = files.reduce((sum, f) => sum + f.file_size, 0);
  const QUOTA = 100 * 1024 * 1024;  // 100MB

  if (totalStorage + uploadSize > QUOTA) {
    throw error(413, 'Storage quota exceeded');
  }

  // Proceed with upload
}
```

**Question**: Should we enforce per-user storage limits? What are the limits?

### Phase 6: Testing & Validation

#### 6.1 User Isolation Testing

**Test cases**:
1. Create User A and User B (two Google accounts or email/password)
2. User A creates conversation, uploads file
3. User B attempts to access User A's data via:
   - Direct API calls with User B's token (should 401 or return empty)
   - Database queries (RLS should block)
   - SSE events (should not receive User A's events)
   - Vector search (should not return User A's memories/files)
4. Verify User B sees empty state (no data leakage)
5. User A deletes account, verify all User A's data CASCADE deleted (verify in database)

#### 6.2 Edge Cases

**Test scenarios**:
- Logged out user tries to access chat page (should redirect to /login)
- Expired auth token (should refresh automatically or prompt re-login)
- Concurrent sessions (same user, multiple tabs/browsers)
- User deletes account while file processing active (orphaned jobs?)
- File processing running when user logs out (does job continue?)
- File processing fails mid-way (error visible to user on next login?)
- User uploads file, immediately logs out, logs back in (file status preserved?)
- User exceeds storage quota (upload rejected with clear error message?)
- User hits concurrent connection limit (new requests rejected with 429)

**Answer**: In-progress file processing continues even if user logs out. Background jobs are independent of user session.

#### 6.3 Load Testing

**Target**: 50-100 concurrent users

**Metrics to track**:
- API response times (p50, p95, p99)
- Database connection pool saturation
- Vector search performance (does it scale with 999 users × 100 journal entries each?)
- File processing queue (do 50 concurrent uploads overwhelm Fireworks/Voyage rate limits?)
- SSE connection count and memory usage
- Background job queue depth
- External API error rates (429 from Fireworks/Voyage)

**Tools**: k6, Artillery, or Playwright in parallel

**Specific test scenarios**:
- 50 users simultaneously uploading files
- 100 users with active chat sessions (streaming responses)
- 999 users with existing data, 50 concurrent vector searches
- Database query performance with 999 × 1000 journal entries
- Concurrent connection limit enforcement (attempt 10 concurrent chats per user)

#### 6.4 Storage Cost Projection

**Calculate** (with realistic assumptions):
- 999 users × 10MB max files × **10 files per user** = ~100GB file storage
- 999 users × 1000 journal entries × 1KB each = ~1GB compressed memory
- Vector embeddings: 999 users × 1000 vectors × 1024 dim × 4 bytes = ~4.1GB raw (+ pgvector overhead = ~5-6GB)

**Example with 10 files per user**:
- Files: ~100GB
- Journal: ~1GB
- Vectors: ~6GB
- **Total storage: ~107GB**

**Supabase costs**:
- Pro plan base: $25/month (includes 8GB database, 100GB file storage)
- Additional database storage: 0GB needed (107GB total, files stored separately)
- Additional file storage: 7GB × $0.021/GB/month = ~$0.15/month
- **Total: ~$25.15/month**

**Note**: Previous calculation was misleading. Supabase Pro plan ($25/mo) includes 100GB storage. Only overage is charged.

**Question**: Should we enforce per-user storage limits (e.g., 100MB per user, 10 files max) to prevent single user consuming entire quota?

**Recommendation**: Enforce per-user limits. Example: 100MB per user, 20 files max. This allows ~10 users to max out before hitting plan limit.

### Phase 7: Deployment & Monitoring

#### 7.1 Production Environment Setup

**Supabase Production Project**:
- Create new project (or use existing)
- Run all migrations in order (verify migration sequence)
- Configure auth providers (Google OAuth production credentials)
- Set up database backups (Supabase automatic backups, verify retention policy)
- Configure Realtime (authenticated channel subscriptions)
- Enable connection pooler (Supavisor)

**Environment Variables**:
- Update `.env.production` with production Supabase URL/keys
- Rotate all API keys (Fireworks, Voyage) if dev keys were committed to git
- Verify no secrets in git history (use git-secrets or similar)

#### 7.2 Deployment Strategy

**Question**: What hosting platform?
- Vercel (recommended for SvelteKit, zero-config, auto-scaling)
- Netlify (similar to Vercel)
- Self-hosted (more control, more maintenance)

**Deployment checklist**:
- Build passes (`npm run build`)
- All tests pass (`npm run test:all`)
- Environment variables configured in hosting platform
- Database migrations applied to production
- Auth redirect URLs updated (Google OAuth console)
- Verify Supabase production project has correct RLS policies enabled
- Verify CASCADE delete works (test in staging)
- Test login flow in production (create test user)
- Verify connection pooler enabled

**Question**: Should we deploy to staging first? If yes, need staging Supabase project + environment.

#### 7.3 Rollback Plan

**If multiuser migration breaks production**:

**IMPORTANT**: DO NOT drop user_id columns if any users have signed up. This loses all data.

**Correct rollback procedure**:
1. Disable auth requirement (allow unauthenticated access temporarily)
2. Restore from backup (Supabase Point-in-Time Recovery to pre-migration state)
3. Fix bugs in migration/code
4. Redeploy previous Git commit
5. Re-run migration with fixes

**Alternative (if no users yet)**:
1. Drop user_id columns:
   ```sql
   ALTER TABLE superjournal DROP COLUMN user_id;
   ALTER TABLE journal DROP COLUMN user_id;
   ALTER TABLE files DROP COLUMN user_id;
   ALTER TABLE user_settings DROP COLUMN user_id;
   ```
2. Disable RLS:
   ```sql
   ALTER TABLE superjournal DISABLE ROW LEVEL SECURITY;
   -- etc.
   ```
3. Redeploy previous commit

**Question**: Should we test rollback procedure in staging first?

**Recommendation**: Yes, test rollback in staging before production deployment.

#### 7.4 Monitoring & Error Tracking

**Metrics to monitor**:
- Auth success/failure rates
- API error rates (401, 403, 500) by endpoint
- Database query performance (slow query log)
- File processing success/failure rates
- Vector search latency
- Background job queue depth and processing time
- SSE connection count
- Database connection pool usage
- External API error rates (429 from Fireworks/Voyage)
- Concurrent connection limit hits (429 from rate limiter)

**Error tracking options**:
- Sentry (recommended, ~$26/month for 50K events)
- LogRocket (session replay + errors, ~$99/month)
- Supabase logs (limited retention, free)

**Alerting**:
- Auth failure rate > 10%
- API error rate > 5%
- Database connection pool > 80%
- File processing failure rate > 20%
- Slow queries > 1 second
- External API 429 errors > 5/minute

**Question**: Budget for error tracking service?

#### 7.5 User Documentation

**Required docs**:
- Login flow (Google OAuth, privacy notice)
- Privacy policy (data storage, AI processing, data retention)
- Terms of service (acceptable use, storage limits, API rate limits)
- Feature guide (chat, files, settings, nuke functionality)
- FAQ (account deletion, data export, storage limits, concurrent session limits)

**Question**: Legal review needed for privacy policy/ToS?

**Question**: GDPR compliance needed? (data export, right to deletion, consent management)

## Remaining Open Questions (Must Be Resolved Before Implementation)

**Critical - Blocking for Implementation**:
1. **Context builder audit**: Does [src/lib/context-builder.ts](src/lib/context-builder.ts) have direct Supabase queries needing user_id filtering? **ACTION: Read the file and audit**
2. **Client-side queries audit**: Are there any client-side direct Supabase queries in `.svelte` files? **ACTION: Grep codebase for `createClient` imports and `.from()` calls**
3. **Fireworks rate limits**: What are current Fireworks AI rate limits (req/sec, tokens/min)? **ACTION: Read Fireworks API docs**
4. **Voyage rate limits**: What are current Voyage AI rate limits (req/sec)? **ACTION: Read Voyage API docs**
5. **CASCADE verification**: Does deleting from `auth.users` actually CASCADE to all tables? **ACTION: Test in local Supabase**

## Risk Assessment

**Critical Risk**:
- Context builder not updated with user_id (breaks vector search entirely)
- CASCADE delete not verified (could orphan data or fail to delete)
- External API rate limits unknown (could fail at scale)

**High Risk**:
- RLS policy bugs (user A accessing user B's data)
- File processing orphaned files (storage cost escalation)
- Connection pool exhaustion (60 connections on free tier, 200 on Pro)
- Fireworks/Voyage rate limit exceeded (no retry logic)

**Medium Risk**:
- Rate limiting based on requests/min instead of concurrent connections (fixed in plan)
- Vector search performance at scale (999 users × 1000 entries = 1M vectors)
- Storage cost calculations incomplete (fixed: ~$25/month on Pro plan)
- Rollback plan could cause data loss if executed incorrectly

**Low Risk**:
- Auth token management (Supabase handles this well)
- Session persistence (standard httpOnly cookies)
- Database migrations (well-tested pattern)
- Auth UI choice (all options work, A/C recommended for deep linking)
- SSE filtering (Supabase Realtime supports RLS natively)

## Success Criteria

- [ ] 999 users can authenticate via Google OAuth
- [ ] User A cannot access User B's data (verified via tests)
- [ ] RLS policies block unauthorized access
- [ ] SSE events filtered by user_id via Realtime RLS (no data leakage)
- [ ] File processing respects user ownership (service role + explicit user_id checks)
- [ ] Vector search scoped to user data (context builder updated)
- [ ] Background jobs authenticate correctly with service role (no RLS bypass bugs)
- [ ] Load test passes with 50-100 concurrent users
- [ ] Storage costs within budget (~$25/month on Pro plan with 100GB storage)
- [ ] All tests pass (unit, integration, E2E, isolation)
- [ ] Rollback procedure documented and tested in staging (no data loss)
- [ ] No secrets in client-side code or git history
- [ ] Rate limiting enforced (concurrent connections, not requests/min)
- [ ] Default user_settings created on first login via database trigger (zero runtime overhead)
- [ ] Connection pool monitoring enabled (alert at 80%)
- [ ] CASCADE delete verified in migration tests
- [ ] Per-user storage quotas enforced (100MB per user recommended)
- [ ] External API retry logic implemented (Fireworks, Voyage 429 errors)
