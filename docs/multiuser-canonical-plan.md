# Multiuser Implementation - Canonical Plan

**Based on user requirements documented in [multiuser-megafeature.md](multiuser-megafeature.md)**

This is the executable implementation plan derived from user requirements. All recommendations and questions from the original megafeature document have been resolved.

---

## Prerequisites (Complete These First)

Before starting Phase 1, complete these audit tasks:

### 1. Context Builder Audit
- **File**: [src/lib/context-builder.ts](src/lib/context-builder.ts)
- **Action**: Read file and identify all Supabase queries
- **Goal**: Document which queries need `user_id` filtering
- **Output**: List of functions that need userId parameter added

### 2. Client-Side Supabase Query Audit
- **Action**: `grep -r "createClient" src/` and `grep -r ".from(" src/**/*.svelte`
- **Goal**: Find all client-side direct database access
- **Output**: List of files with client-side queries that need RLS awareness

### 3. External API Rate Limits Research
- **Fireworks AI**: Document req/sec and tokens/min limits from API docs
- **Voyage AI**: Document req/sec limits from API docs
- **Goal**: Determine if current batch processing (5 concurrent, 5s delay) respects limits
- **Output**: Confirmed rate limits + retry strategy if needed

### 4. CASCADE Delete Verification
- **Action**: Test in local Supabase
  ```sql
  -- Create test user
  INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'test@example.com');

  -- Insert test data with test user_id
  -- ... (superjournal, journal, files, user_settings)

  -- Delete user
  DELETE FROM auth.users WHERE email = 'test@example.com';

  -- Verify CASCADE worked
  SELECT COUNT(*) FROM superjournal WHERE user_id = <test_user_id>; -- should be 0
  SELECT COUNT(*) FROM journal WHERE user_id = <test_user_id>; -- should be 0
  SELECT COUNT(*) FROM files WHERE user_id = <test_user_id>; -- should be 0
  SELECT COUNT(*) FROM file_chunks WHERE file_id IN (SELECT id FROM files WHERE user_id = <test_user_id>); -- should be 0
  ```
- **Goal**: Confirm CASCADE DELETE works as expected
- **Output**: Verified CASCADE behavior

---

## Phase 1: Authentication Foundation

### 1.1 Supabase Auth Setup

**Tasks**:
1. Enable Google OAuth provider in Supabase dashboard
2. Configure OAuth redirect URLs:
   - Local: `http://localhost:5173/auth/callback`
   - Production: `https://oovar.ai/auth/callback`
3. Get OAuth credentials from Google Cloud Console
4. Save credentials in Supabase Auth settings

**Verification**: Test OAuth flow in Supabase dashboard

---

### 1.2 Auth UI Implementation

**Create Login Page**: `src/routes/login/+page.svelte`
```svelte
<script lang="ts">
  import { supabase } from '$lib/supabase-client';

  async function handleGoogleLogin() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (error) {
      console.error('Login error:', error);
    }
  }
</script>

<div class="login-container">
  <h1>Welcome to Oovar</h1>
  <button on:click={handleGoogleLogin}>
    Sign in with Google
  </button>
</div>
```

**Create OAuth Callback Handler**: `src/routes/auth/callback/+page.server.ts`
```typescript
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
  const code = url.searchParams.get('code');

  if (code) {
    const { data, error } = await locals.supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Auth callback error:', error);
      throw redirect(303, '/login');
    }
  }

  throw redirect(303, '/');
};
```

**Add Auth Middleware**: `src/hooks.server.ts`
```typescript
import { createServerClient } from '@supabase/ssr';
import { redirect, type Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.supabase = createServerClient(
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get: (key) => event.cookies.get(key),
        set: (key, value, options) => event.cookies.set(key, value, options),
        remove: (key, options) => event.cookies.delete(key, options),
      },
    }
  );

  event.locals.getSession = async () => {
    const { data: { session } } = await event.locals.supabase.auth.getSession();
    return session;
  };

  const session = await event.locals.getSession();

  // Protect all routes except /login and /auth/callback
  const unprotectedRoutes = ['/login', '/auth/callback'];
  const isUnprotected = unprotectedRoutes.some(route => event.url.pathname.startsWith(route));

  if (!session && !isUnprotected) {
    throw redirect(303, '/login');
  }

  // Redirect to home if already logged in and trying to access login
  if (session && event.url.pathname === '/login') {
    throw redirect(303, '/');
  }

  return resolve(event);
};
```

**Add Logout Button**: Update main page with logout functionality
```typescript
// In src/routes/+page.svelte
async function handleLogout() {
  await supabase.auth.signOut();
  window.location.href = '/login';
}
```

**Files to Create**:
- `src/routes/login/+page.svelte`
- `src/routes/auth/callback/+page.server.ts`
- Update `src/hooks.server.ts`
- Update `src/app.d.ts` with types

---

### 1.3 Session Management

**Create Auth Store**: `src/lib/stores/auth.ts`
```typescript
import { writable } from 'svelte/store';
import type { Session } from '@supabase/supabase-js';

export const session = writable<Session | null>(null);
```

**Update Root Layout**: `src/routes/+layout.svelte`
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { session } from '$lib/stores/auth';
  import { supabase } from '$lib/supabase-client';

  onMount(() => {
    supabase.auth.getSession().then(({ data }) => {
      session.set(data.session);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, newSession) => {
      session.set(newSession);
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  });
</script>

<slot />
```

---

### 1.4 Multi-Tenant Supabase Client

**Create Server-Side Authenticated Client**: `src/lib/supabase-server.ts`
```typescript
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

export function createAuthenticatedClient(authToken: string) {
  return createClient(
    PUBLIC_SUPABASE_URL,
    env.PUBLIC_SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      }
    }
  );
}

export function createAdminClient() {
  return createClient(
    PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
}
```

**Update API Endpoints** (Pattern to apply to all endpoints):
```typescript
// Example: src/routes/api/chat/+server.ts
import { error } from '@sveltejs/kit';
import { createAuthenticatedClient } from '$lib/supabase-server';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.getSession();

  if (!session) {
    throw error(401, 'Unauthorized');
  }

  const userId = session.user.id;
  const supabase = createAuthenticatedClient(session.access_token);

  // Use userId and authenticated supabase client for all queries
  // ...
};
```

**Files to Update**:
- Create `src/lib/supabase-server.ts`
- Update `src/routes/api/chat/+server.ts`
- Update `src/routes/api/files/upload/+server.ts`
- Update `src/routes/api/files/[id]/+server.ts`
- Update `src/routes/api/settings/+server.ts`
- Update `src/routes/api/nuke/+server.ts`
- Update `src/routes/api/files/events/+server.ts`

---

## Phase 2: Database Schema Migration

### 2.1 Add user_id Columns + is_public for Future Shared Knowledge

**Migration File**: `supabase/migrations/20251118000000_add_multiuser_columns.sql`

```sql
-- Add user_id columns to all tables
ALTER TABLE superjournal ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE journal ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE files ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE user_settings ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add is_public columns for future shared knowledge base feature
ALTER TABLE journal ADD COLUMN is_public BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE files ADD COLUMN is_public BOOLEAN DEFAULT FALSE NOT NULL;

-- Create indexes for performance
CREATE INDEX idx_superjournal_user_id ON superjournal(user_id);
CREATE INDEX idx_journal_user_id ON journal(user_id);
CREATE INDEX idx_journal_is_public ON journal(is_public);
CREATE INDEX idx_files_user_id ON files(user_id);
CREATE INDEX idx_files_is_public ON files(is_public);
CREATE INDEX idx_user_settings_user_id ON user_settings(user_id);

-- Composite index for shared knowledge queries (future use)
CREATE INDEX idx_journal_user_public ON journal(user_id, is_public);
CREATE INDEX idx_files_user_public ON files(user_id, is_public);

-- Nuke all existing data (USER REQUIREMENT: Clean slate)
TRUNCATE superjournal, journal, files, file_chunks, user_settings CASCADE;

-- Make user_id NOT NULL after truncate
ALTER TABLE superjournal ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE journal ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE files ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE user_settings ALTER COLUMN user_id SET NOT NULL;
```

**Files to Create**:
- `supabase/migrations/20251118000000_add_multiuser_columns.sql`

---

### 2.2 Update Vector Search Functions

**Migration File**: `supabase/migrations/20251118000001_update_vector_search_functions.sql`

```sql
-- Update search_journal_by_embedding to include user_id filtering and is_public support
CREATE OR REPLACE FUNCTION search_journal_by_embedding(
  query_embedding vector(1024),
  match_threshold float,
  match_count int,
  user_id_filter uuid
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  boss_essence text,
  persona_essence text,
  decision_arc_summary text,
  salience_score int,
  is_starred boolean,
  is_instruction boolean,
  instruction_scope text,
  is_public boolean,
  created_at timestamptz,
  similarity float
)
AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.id,
    j.user_id,
    j.boss_essence,
    j.persona_essence,
    j.decision_arc_summary,
    j.salience_score,
    j.is_starred,
    j.is_instruction,
    j.instruction_scope,
    j.is_public,
    j.created_at,
    1 - (j.embedding <=> query_embedding) as similarity
  FROM journal j
  WHERE (j.embedding <=> query_embedding) < match_threshold
    AND (j.user_id = user_id_filter OR j.is_public = true)  -- User's own data OR public data
  ORDER BY j.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Update search_file_chunks to include user_id filtering and is_public support
CREATE OR REPLACE FUNCTION search_file_chunks(
  query_embedding vector(1024),
  match_threshold float,
  match_count int,
  user_id_filter uuid
)
RETURNS TABLE (
  id uuid,
  file_id uuid,
  chunk_index int,
  chunk_text text,
  boss_essence text,
  persona_essence text,
  decision_arc_summary text,
  is_overview boolean,
  created_at timestamptz,
  similarity float
)
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fc.id,
    fc.file_id,
    fc.chunk_index,
    fc.chunk_text,
    fc.boss_essence,
    fc.persona_essence,
    fc.decision_arc_summary,
    fc.is_overview,
    fc.created_at,
    1 - (fc.embedding <=> query_embedding) as similarity
  FROM file_chunks fc
  INNER JOIN files f ON fc.file_id = f.id
  WHERE (fc.embedding <=> query_embedding) < match_threshold
    AND (f.user_id = user_id_filter OR f.is_public = true)  -- User's own files OR public files
  ORDER BY fc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
```

**Files to Create**:
- `supabase/migrations/20251118000001_update_vector_search_functions.sql`

---

### 2.3 Update Context Builder

**File to Update**: `src/lib/context-builder.ts`

**Pattern**:
```typescript
export async function buildContext(
  userId: string,  // NEW PARAMETER
  userMessage: string,
  supabase: SupabaseClient  // Authenticated client
) {
  // Generate embedding for semantic search
  const embedding = await generateEmbedding(userMessage);

  // Call vector search with user_id filter
  const { data: journalResults, error: journalError } = await supabase.rpc(
    'search_journal_by_embedding',
    {
      query_embedding: embedding,
      match_threshold: 0.7,
      match_count: 10,
      user_id_filter: userId  // NEW PARAMETER
    }
  );

  // Same pattern for file chunks
  const { data: fileChunkResults, error: fileError } = await supabase.rpc(
    'search_file_chunks',
    {
      query_embedding: embedding,
      match_threshold: 0.7,
      match_count: 5,
      user_id_filter: userId  // NEW PARAMETER
    }
  );

  // All other Supabase queries need .eq('user_id', userId) filter
  const { data: superjournal } = await supabase
    .from('superjournal')
    .select('*')
    .eq('user_id', userId)  // NEW FILTER
    .order('created_at', { ascending: false })
    .limit(5);

  const { data: starred } = await supabase
    .from('journal')
    .select('*')
    .eq('user_id', userId)  // NEW FILTER
    .eq('is_starred', true);

  // ... rest of context building logic
}
```

**Update Chat Endpoint**: `src/routes/api/chat/+server.ts`
```typescript
export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const userId = session.user.id;
  const supabase = createAuthenticatedClient(session.access_token);

  // Pass userId to context builder
  const context = await buildContext(userId, userMessage, supabase);

  // ... rest of chat logic
};
```

**Files to Update**:
- `src/lib/context-builder.ts`
- `src/routes/api/chat/+server.ts`

---

## Phase 3: Row-Level Security (RLS)

### 3.1 Enable RLS on All Tables

**Migration File**: `supabase/migrations/20251118000002_enable_rls.sql`

```sql
-- Enable RLS on all tables
ALTER TABLE superjournal ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE models ENABLE ROW LEVEL SECURITY;
```

---

### 3.2 Create RLS Policies with Admin Access

**Migration File**: `supabase/migrations/20251118000003_create_rls_policies.sql`

```sql
-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (SELECT email FROM auth.users WHERE id = auth.uid()) = 'deepakpatnaik1@gmail.com';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Superjournal Policies
CREATE POLICY superjournal_select_policy ON superjournal
  FOR SELECT USING (auth.uid() = user_id OR is_admin());

CREATE POLICY superjournal_insert_policy ON superjournal
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY superjournal_update_policy ON superjournal
  FOR UPDATE USING (auth.uid() = user_id OR is_admin());

CREATE POLICY superjournal_delete_policy ON superjournal
  FOR DELETE USING (auth.uid() = user_id OR is_admin());

-- Journal Policies (includes is_public support for shared knowledge)
CREATE POLICY journal_select_policy ON journal
  FOR SELECT USING (auth.uid() = user_id OR is_public = true OR is_admin());

CREATE POLICY journal_insert_policy ON journal
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY journal_update_policy ON journal
  FOR UPDATE USING (auth.uid() = user_id OR is_admin());

CREATE POLICY journal_delete_policy ON journal
  FOR DELETE USING (auth.uid() = user_id OR is_admin());

-- Files Policies (includes is_public support for shared knowledge)
CREATE POLICY files_select_policy ON files
  FOR SELECT USING (auth.uid() = user_id OR is_public = true OR is_admin());

CREATE POLICY files_insert_policy ON files
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY files_update_policy ON files
  FOR UPDATE USING (auth.uid() = user_id OR is_admin());

CREATE POLICY files_delete_policy ON files
  FOR DELETE USING (auth.uid() = user_id OR is_admin());

-- File Chunks Policies (inherits from files via JOIN)
CREATE POLICY file_chunks_select_policy ON file_chunks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM files
      WHERE files.id = file_chunks.file_id
      AND (files.user_id = auth.uid() OR files.is_public = true)
    ) OR is_admin()
  );

CREATE POLICY file_chunks_insert_policy ON file_chunks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM files
      WHERE files.id = file_chunks.file_id
      AND files.user_id = auth.uid()
    ) OR is_admin()
  );

CREATE POLICY file_chunks_update_policy ON file_chunks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM files
      WHERE files.id = file_chunks.file_id
      AND files.user_id = auth.uid()
    ) OR is_admin()
  );

CREATE POLICY file_chunks_delete_policy ON file_chunks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM files
      WHERE files.id = file_chunks.file_id
      AND files.user_id = auth.uid()
    ) OR is_admin()
  );

-- User Settings Policies
CREATE POLICY user_settings_select_policy ON user_settings
  FOR SELECT USING (auth.uid() = user_id OR is_admin());

CREATE POLICY user_settings_insert_policy ON user_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_settings_update_policy ON user_settings
  FOR UPDATE USING (auth.uid() = user_id OR is_admin());

CREATE POLICY user_settings_delete_policy ON user_settings
  FOR DELETE USING (auth.uid() = user_id OR is_admin());

-- Models Table (read-only for all authenticated users)
CREATE POLICY models_select_policy ON models
  FOR SELECT USING (auth.role() = 'authenticated');
```

**Files to Create**:
- `supabase/migrations/20251118000002_enable_rls.sql`
- `supabase/migrations/20251118000003_create_rls_policies.sql`

---

### 3.3 Update Nuke Function (User-Scoped)

**Migration File**: `supabase/migrations/20251118000004_update_nuke_function.sql`

```sql
-- User-scoped nuke function (preserves user_settings per requirement #6)
CREATE OR REPLACE FUNCTION nuke_user_data(target_user_id uuid)
RETURNS void AS $$
BEGIN
  DELETE FROM superjournal WHERE user_id = target_user_id;
  DELETE FROM journal WHERE user_id = target_user_id;
  DELETE FROM files WHERE user_id = target_user_id;  -- CASCADE handles file_chunks
  -- Do NOT delete user_settings (preserves persona, model preferences)
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Update Nuke API Endpoint**: `src/routes/api/nuke/+server.ts`
```typescript
import { error } from '@sveltejs/kit';
import { createAuthenticatedClient } from '$lib/supabase-server';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const userId = session.user.id;
  const supabase = createAuthenticatedClient(session.access_token);

  const { error: nukeError } = await supabase.rpc('nuke_user_data', {
    target_user_id: userId
  });

  if (nukeError) {
    console.error('Nuke error:', nukeError);
    throw error(500, 'Failed to delete user data');
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
```

**Files to Create**:
- `supabase/migrations/20251118000004_update_nuke_function.sql`

**Files to Update**:
- `src/routes/api/nuke/+server.ts`

---

### 3.4 Soft Delete Account Function (90-Day Retention)

**Migration File**: `supabase/migrations/20251118000005_soft_delete_account.sql`

```sql
-- Add deleted_at column to track soft deletes
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Soft delete account function
CREATE OR REPLACE FUNCTION soft_delete_account(target_user_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE auth.users
  SET deleted_at = NOW()
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Scheduled function to permanently delete accounts after 90 days
CREATE OR REPLACE FUNCTION cleanup_deleted_accounts()
RETURNS void AS $$
BEGIN
  DELETE FROM auth.users
  WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: Set up pg_cron or external scheduler to call cleanup_deleted_accounts() daily
-- Example with pg_cron (if enabled):
-- SELECT cron.schedule('cleanup-deleted-accounts', '0 2 * * *', 'SELECT cleanup_deleted_accounts()');
```

**Files to Create**:
- `supabase/migrations/20251118000005_soft_delete_account.sql`

---

## Phase 4: API Security Hardening

### 4.1 Rate Limiting (Database-Based)

**Migration File**: `supabase/migrations/20251118000006_rate_limiting.sql`

```sql
-- Rate limiting table for concurrent connections
CREATE TABLE rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  operation_type text NOT NULL,  -- 'chat' or 'file_upload'
  connection_id text NOT NULL,
  created_at timestamptz DEFAULT NOW(),

  UNIQUE(user_id, operation_type, connection_id)
);

CREATE INDEX idx_rate_limits_user_op ON rate_limits(user_id, operation_type);

-- Function to check concurrent limit
CREATE OR REPLACE FUNCTION check_concurrent_limit(
  p_user_id uuid,
  p_operation_type text,
  p_limit int,
  p_connection_id text
)
RETURNS boolean AS $$
DECLARE
  current_count int;
BEGIN
  -- Count current connections for this user and operation
  SELECT COUNT(*) INTO current_count
  FROM rate_limits
  WHERE user_id = p_user_id
    AND operation_type = p_operation_type;

  -- If already at or over limit and this is a new connection, reject
  IF current_count >= p_limit THEN
    -- Check if this specific connection already exists
    IF NOT EXISTS (
      SELECT 1 FROM rate_limits
      WHERE user_id = p_user_id
        AND operation_type = p_operation_type
        AND connection_id = p_connection_id
    ) THEN
      RETURN false;  -- Limit exceeded
    END IF;
  END IF;

  -- Register this connection
  INSERT INTO rate_limits (user_id, operation_type, connection_id)
  VALUES (p_user_id, p_operation_type, p_connection_id)
  ON CONFLICT (user_id, operation_type, connection_id) DO NOTHING;

  RETURN true;  -- Allowed
END;
$$ LANGUAGE plpgsql;

-- Function to release concurrent slot
CREATE OR REPLACE FUNCTION release_concurrent_slot(
  p_user_id uuid,
  p_operation_type text,
  p_connection_id text
)
RETURNS void AS $$
BEGIN
  DELETE FROM rate_limits
  WHERE user_id = p_user_id
    AND operation_type = p_operation_type
    AND connection_id = p_connection_id;
END;
$$ LANGUAGE plpgsql;

-- Cleanup stale connections (older than 1 hour)
CREATE OR REPLACE FUNCTION cleanup_stale_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM rate_limits
  WHERE created_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup (requires pg_cron or external scheduler)
-- SELECT cron.schedule('cleanup-stale-rate-limits', '*/5 * * * *', 'SELECT cleanup_stale_rate_limits()');
```

**Create Rate Limiter Helper**: `src/lib/rate-limiter.ts`
```typescript
import type { SupabaseClient } from '@supabase/supabase-js';

export async function checkConcurrentLimit(
  supabase: SupabaseClient,
  userId: string,
  operationType: 'chat' | 'file_upload',
  limit: number,
  connectionId: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_concurrent_limit', {
    p_user_id: userId,
    p_operation_type: operationType,
    p_limit: limit,
    p_connection_id: connectionId
  });

  if (error) {
    console.error('Rate limit check error:', error);
    return false;
  }

  return data as boolean;
}

export async function releaseConcurrentSlot(
  supabase: SupabaseClient,
  userId: string,
  operationType: 'chat' | 'file_upload',
  connectionId: string
): Promise<void> {
  const { error } = await supabase.rpc('release_concurrent_slot', {
    p_user_id: userId,
    p_operation_type: operationType,
    p_connection_id: connectionId
  });

  if (error) {
    console.error('Rate limit release error:', error);
  }
}
```

**Update Chat Endpoint**: `src/routes/api/chat/+server.ts`
```typescript
import { checkConcurrentLimit, releaseConcurrentSlot } from '$lib/rate-limiter';

export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const userId = session.user.id;
  const supabase = createAuthenticatedClient(session.access_token);
  const connectionId = crypto.randomUUID();

  // Check rate limit (USER REQUIREMENT #7: Max 1 concurrent chat)
  const allowed = await checkConcurrentLimit(supabase, userId, 'chat', 1, connectionId);
  if (!allowed) {
    throw error(429, 'Too many concurrent chat sessions. Please wait for current response to complete.');
  }

  try {
    // Stream chat response...
  } finally {
    // Always release slot, even on error
    await releaseConcurrentSlot(supabase, userId, 'chat', connectionId);
  }
};
```

**Update File Upload Endpoint**: `src/routes/api/files/upload/+server.ts`
```typescript
import { checkConcurrentLimit, releaseConcurrentSlot } from '$lib/rate-limiter';

export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const userId = session.user.id;
  const supabase = createAuthenticatedClient(session.access_token);
  const connectionId = crypto.randomUUID();

  // Check rate limit (USER REQUIREMENT #7: Max 1 concurrent file upload)
  const allowed = await checkConcurrentLimit(supabase, userId, 'file_upload', 1, connectionId);
  if (!allowed) {
    throw error(429, 'Too many concurrent file uploads. Please wait for current upload to complete.');
  }

  try {
    // Process file upload...

    // Start background processing (will release slot when done)
    processFileInBackground(fileId, userId, connectionId);

  } catch (err) {
    await releaseConcurrentSlot(supabase, userId, 'file_upload', connectionId);
    throw err;
  }
};

async function processFileInBackground(fileId: string, userId: string, connectionId: string) {
  try {
    await processFile(fileId, userId);
  } finally {
    const adminClient = createAdminClient();
    await releaseConcurrentSlot(adminClient, userId, 'file_upload', connectionId);
  }
}
```

**Files to Create**:
- `supabase/migrations/20251118000006_rate_limiting.sql`
- `src/lib/rate-limiter.ts`

**Files to Update**:
- `src/routes/api/chat/+server.ts`
- `src/routes/api/files/upload/+server.ts`

---

### 4.2 Storage Quota Enforcement (1GB per User)

**Update File Upload Endpoint**: `src/routes/api/files/upload/+server.ts`
```typescript
export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const userId = session.user.id;
  const supabase = createAuthenticatedClient(session.access_token);

  // Get file from request
  const formData = await request.formData();
  const file = formData.get('file') as File;
  const fileSize = file.size;

  // Check current storage usage (USER REQUIREMENT #4: 1GB per user)
  const { data: files } = await supabase
    .from('files')
    .select('file_size')
    .eq('user_id', userId);

  const totalStorage = files?.reduce((sum, f) => sum + (f.file_size || 0), 0) || 0;
  const QUOTA = 1024 * 1024 * 1024;  // 1GB in bytes

  // USER REQUIREMENT #5: Hard reject if quota exceeded
  if (totalStorage + fileSize > QUOTA) {
    throw error(413, `Storage quota exceeded. You have used ${(totalStorage / 1024 / 1024).toFixed(2)}MB of your 1GB limit. This file would exceed your quota.`);
  }

  // Continue with upload...
};
```

**Files to Update**:
- `src/routes/api/files/upload/+server.ts`

---

### 4.3 SSE Authentication (Token Query Parameter)

**Update SSE Endpoint**: `src/routes/api/files/events/+server.ts`
```typescript
import { error } from '@sveltejs/kit';
import { createAuthenticatedClient } from '$lib/supabase-server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  // USER REQUIREMENT #20: Auth token as query parameter (not session)
  const token = url.searchParams.get('token');

  if (!token) {
    throw error(401, 'Missing auth token');
  }

  // Verify token and get user
  const supabase = createAuthenticatedClient(token);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw error(401, 'Invalid auth token');
  }

  const userId = user.id;

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      // Subscribe to user-specific Realtime channel
      const channel = supabase
        .channel(`user:${userId}:files`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'files',
            filter: `user_id=eq.${userId}`
          },
          (payload) => {
            const event = `data: ${JSON.stringify(payload)}\n\n`;
            controller.enqueue(new TextEncoder().encode(event));
          }
        )
        .subscribe();

      // Keep connection alive
      const keepAlive = setInterval(() => {
        controller.enqueue(new TextEncoder().encode(': keepalive\n\n'));
      }, 30000);

      // Cleanup on close
      return () => {
        clearInterval(keepAlive);
        channel.unsubscribe();
      };
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
};
```

**Update Client-Side SSE Connection**: `src/routes/+page.svelte`
```typescript
// Get auth token for SSE
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;

// Connect to SSE with token
const eventSource = new EventSource(`/api/files/events?token=${token}`);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle file updates...
};
```

**Files to Update**:
- `src/routes/api/files/events/+server.ts`
- `src/routes/+page.svelte` (or wherever SSE is connected)

---

### 4.4 Cancel File Processing on Logout

**Create Logout Handler**: Update logout function to cancel active file processing

```typescript
// src/lib/file-processor.ts
const activeProcessingJobs = new Map<string, { userId: string, fileId: string, abortController: AbortController }>();

export async function processFile(fileId: string, userId: string) {
  const abortController = new AbortController();
  activeProcessingJobs.set(fileId, { userId, fileId, abortController });

  try {
    // Pass abort signal to all async operations
    await extractText(fileId, { signal: abortController.signal });
    await chunkFile(fileId, { signal: abortController.signal });
    // ... rest of processing
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log(`File processing cancelled for file ${fileId}`);
      // Mark file as cancelled
      const adminClient = createAdminClient();
      await adminClient
        .from('files')
        .update({ status: 'cancelled', error_message: 'Processing cancelled due to user logout' })
        .eq('id', fileId)
        .eq('user_id', userId);
    } else {
      throw err;
    }
  } finally {
    activeProcessingJobs.delete(fileId);
  }
}

export function cancelUserJobs(userId: string) {
  for (const [fileId, job] of activeProcessingJobs.entries()) {
    if (job.userId === userId) {
      job.abortController.abort();
      activeProcessingJobs.delete(fileId);
    }
  }
}
```

**Update Logout Handler**: `src/routes/+page.svelte`
```typescript
async function handleLogout() {
  // Cancel active file processing (USER REQUIREMENT #17)
  await fetch('/api/files/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  await supabase.auth.signOut();
  window.location.href = '/login';
}
```

**Create Cancel Endpoint**: `src/routes/api/files/cancel/+server.ts`
```typescript
import { error } from '@sveltejs/kit';
import { cancelUserJobs } from '$lib/file-processor';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
  const session = await locals.getSession();
  if (!session) throw error(401, 'Unauthorized');

  const userId = session.user.id;
  cancelUserJobs(userId);

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
```

**Files to Update**:
- `src/lib/file-processor.ts`
- `src/routes/+page.svelte`

**Files to Create**:
- `src/routes/api/files/cancel/+server.ts`

---

### 4.5 Input Validation with Zod

**Install Zod**: `npm install zod`

**Create Validation Schemas**: `src/lib/validation.ts`
```typescript
import { z } from 'zod';

export const chatMessageSchema = z.object({
  message: z.string().min(1).max(100000),  // 100KB limit
  persona: z.enum(['gunnar', 'kirby'])
});

export const fileUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  fileSize: z.number().max(10 * 1024 * 1024),  // 10MB max
  fileType: z.enum(['application/pdf', 'text/plain', 'text/markdown'])
});

export const settingsUpdateSchema = z.object({
  selected_persona: z.enum(['gunnar', 'kirby']).optional(),
  selected_conversation_model: z.string().uuid().optional(),
  selected_compression_model: z.string().uuid().optional()
});
```

**Apply Validation to Endpoints**:
```typescript
// Example: src/routes/api/chat/+server.ts
import { chatMessageSchema } from '$lib/validation';

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json();

  // Validate input
  const parsed = chatMessageSchema.safeParse(body);
  if (!parsed.success) {
    throw error(400, 'Invalid input: ' + parsed.error.message);
  }

  const { message, persona } = parsed.data;

  // Continue with validated data...
};
```

**Files to Create**:
- `src/lib/validation.ts`

**Files to Update**:
- `src/routes/api/chat/+server.ts`
- `src/routes/api/files/upload/+server.ts`
- `src/routes/api/settings/+server.ts`

---

## Phase 5: User Onboarding & Defaults

### 5.1 Create Default Settings on First Login (Database Trigger)

**Migration File**: `supabase/migrations/20251118000007_default_user_settings.sql`

```sql
-- Function to create default user settings
CREATE OR REPLACE FUNCTION create_default_user_settings()
RETURNS TRIGGER AS $$
DECLARE
  default_conversation_model uuid;
  default_compression_model uuid;
BEGIN
  -- Get default model IDs
  SELECT id INTO default_conversation_model FROM models WHERE name = 'Qwen3-235B Thinking' LIMIT 1;
  SELECT id INTO default_compression_model FROM models WHERE name = 'Qwen3-235B Instruct' LIMIT 1;

  -- Insert default settings for new user
  INSERT INTO user_settings (
    user_id,
    selected_persona,
    selected_conversation_model,
    selected_compression_model
  )
  VALUES (
    NEW.id,
    'gunnar',
    default_conversation_model,
    default_compression_model
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create default settings on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_user_settings();
```

**Files to Create**:
- `supabase/migrations/20251118000007_default_user_settings.sql`

---

### 5.2 Empty State UI (No Welcome Message)

**USER REQUIREMENT #11**: Show empty state with no tutorial or welcome message.

**Update Main Page**: `src/routes/+page.svelte`
```svelte
{#if messages.length === 0}
  <div class="empty-state">
    <p>No conversations yet. Start chatting!</p>
  </div>
{/if}
```

**Files to Update**:
- `src/routes/+page.svelte`

---

## Phase 6: Legal Documentation

### 6.1 Privacy Policy (Standard Template)

**Create Privacy Policy**: `src/routes/privacy/+page.svelte`

```markdown
# Privacy Policy for Oovar

**Last Updated**: [Date]

## Data We Collect
- Google account information (email, name, profile picture)
- Chat conversations and AI responses
- Uploaded files (PDF, TXT, MD)
- Usage data (timestamps, file sizes)

## How We Use Your Data
- To provide AI chat and file processing services
- To improve our services
- To communicate with you about your account

## Data Storage
- All data is stored securely on Supabase (PostgreSQL)
- File storage: Up to 1GB per user
- Conversation history: Compressed using AI for efficient storage

## Data Retention
- Active account data: Retained indefinitely while account is active
- Deleted accounts: Data retained for 90 days, then permanently deleted
- You can delete your conversations at any time using the "Nuke Everything" button

## Third-Party Services
- Google OAuth for authentication
- Fireworks AI for chat responses
- Voyage AI for semantic search
- Supabase for data storage

## Your Rights
- Access your data at any time
- Delete your data using the "Nuke Everything" button
- Request account deletion (contact support)

## Contact
For privacy concerns, contact: [Your Email]
```

**Files to Create**:
- `src/routes/privacy/+page.svelte`

---

### 6.2 Terms of Service (Standard Template)

**Create Terms of Service**: `src/routes/terms/+page.svelte`

```markdown
# Terms of Service for Oovar

**Last Updated**: [Date]

## Acceptance of Terms
By using Oovar, you agree to these terms.

## Service Description
Oovar provides AI-powered chat and file processing services.

## Account Requirements
- Must have a Google account
- Must be 18 years or older
- One account per user

## Usage Limits
- Storage: 1GB per user
- Concurrent chat sessions: 1 at a time
- Concurrent file uploads: 1 at a time
- File size limit: 10MB per file

## Acceptable Use
You agree NOT to:
- Upload illegal or harmful content
- Attempt to bypass usage limits
- Share your account credentials
- Use the service to harm others

## Data and Privacy
- See our Privacy Policy for details
- We reserve the right to delete accounts that violate terms
- You own your data and can delete it at any time

## Service Availability
- We strive for 99% uptime but make no guarantees
- We may modify or discontinue the service at any time

## Liability
- Service provided "as is" without warranties
- We are not liable for data loss or service interruptions
- Maximum liability limited to amount paid (currently $0 for free tier)

## Changes to Terms
We may update these terms. Continued use constitutes acceptance.

## Contact
For questions: [Your Email]
```

**Files to Create**:
- `src/routes/terms/+page.svelte`

---

## Phase 7: Testing & Deployment

### 7.1 User Isolation Testing

**Test Script**: `tests/multiuser-isolation.test.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Multiuser Isolation', () => {
  test('User A cannot see User B data', async ({ browser }) => {
    // Create two separate browser contexts (two users)
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // User A logs in and creates conversation
    await pageA.goto('/login');
    // ... login with User A credentials
    await pageA.fill('input[type="text"]', 'Test message from User A');
    await pageA.click('button[type="submit"]');
    await pageA.waitForSelector('text=Test message from User A');

    // User B logs in
    await pageB.goto('/login');
    // ... login with User B credentials

    // Verify User B does not see User A's message
    const messagesB = await pageB.locator('[data-role="boss"]').count();
    expect(messagesB).toBe(0);

    await contextA.close();
    await contextB.close();
  });

  test('User A cannot access User B file via direct API', async ({ request }) => {
    // Upload file as User A
    const responseA = await request.post('/api/files/upload', {
      headers: { Authorization: `Bearer ${tokenA}` },
      multipart: { file: fileA }
    });
    const fileA = await responseA.json();

    // Attempt to access User A's file as User B
    const responseB = await request.get(`/api/files/${fileA.id}`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });

    expect(responseB.status()).toBe(404);  // RLS should block access
  });
});
```

**Files to Create**:
- `tests/multiuser-isolation.test.ts`

---

### 7.2 Deployment Checklist

**Pre-Deployment**:
1. ✅ Run all migrations on local Supabase (`npx supabase db reset`)
2. ✅ Test CASCADE delete locally (see Prerequisites section)
3. ✅ Verify all API endpoints have auth checks
4. ✅ Verify all Supabase queries include user_id filtering
5. ✅ Run all tests: `npm run test:all`
6. ✅ Build passes: `npm run build`
7. ✅ Audit for secrets in client code: `grep -r "FIREWORKS_API_KEY" src/`

**Supabase Production Setup**:
1. Create new Supabase project at oovar.ai
2. Enable Google OAuth provider
3. Configure OAuth redirect URL: `https://oovar.ai/auth/callback`
4. Run all migrations in order (check migration sequence)
5. Enable connection pooler (Supavisor)
6. Verify RLS policies are enabled
7. Set up pg_cron for cleanup jobs (rate limits, soft deletes)

**Google OAuth Setup**:
1. Create OAuth client in Google Cloud Console
2. Add authorized redirect URI: `https://oovar.ai/auth/callback`
3. Add credentials to Supabase Auth settings

**Vercel Deployment**:
1. Connect GitHub repo to Vercel
2. Set environment variables:
   - `PUBLIC_SUPABASE_URL`
   - `PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `FIREWORKS_API_KEY`
   - `VOYAGE_API_KEY`
3. Deploy
4. Test login flow on production
5. Create test account and verify:
   - Default settings created
   - Chat works
   - File upload works
   - Nuke button works
   - Storage quota enforced
   - Rate limiting works

---

### 7.3 Monitoring Setup

**Metrics to Monitor** (via Supabase Dashboard):
- Database connection pool usage (alert at >80%)
- Slow queries (>1 second)
- Auth success/failure rates
- File processing success/failure rates
- Storage usage per user

**Set Up Alerts**:
- Database connection pool >80%
- Auth failure rate >10%
- File processing failure rate >20%

---

## Summary

This canonical plan implements all 21 user requirements:

1. ✅ Nuke existing data in migration
2. ✅ `/login` route with Google OAuth at oovar.ai
3. ✅ PostgreSQL trigger for default settings
4. ✅ 1GB storage quota per user
5. ✅ Hard reject on quota exceeded
6. ✅ User-scoped nuke (preserves settings)
7. ✅ Rate limits: 1 chat, 1 file upload concurrent
8. ✅ Database-based rate limiting
9. ✅ Vercel hosting (single instance)
10. ✅ Hardcoded admin: deepakpatnaik1@gmail.com
11. ✅ Empty state, no welcome message
12. ✅ Supabase logs only
13. ✅ No staging environment
14. ✅ Standard legal templates
15. ✅ Skip GDPR for now
16. ✅ `is_public` columns for future shared knowledge
17. ✅ Cancel file processing on logout
18. ✅ 90-day soft delete
19. ✅ Start on Free tier
20. ✅ SSE token query parameter
21. ✅ Single server instance

**Next Steps**: Complete Prerequisites audit tasks, then execute phases 1-7 in order.
