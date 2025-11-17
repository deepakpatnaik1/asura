# Supabase Infrastructure Decision

## Context

I work across two machines:
- **iMac** at home
- **MacBook Air** when I'm at coffee shops with my co-founder

This multi-machine workflow requires a shared database that both machines can access.

---

## Decision: Use Remote Supabase for Development

We are using **remote Supabase** as our development database.

**Current Configuration** (`.env` file):
```
PUBLIC_SUPABASE_URL=https://hsxjcowijclwdxcmhbhs.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

## Why Remote Supabase?

Given the multi-machine workflow, we need:
- ✅ Shared database state between iMac and MacBook Air
- ✅ Files uploaded on one machine appear on the other
- ✅ No manual sync or export/import hassles
- ✅ Single source of truth
- ✅ Migration changes applied once, work everywhere

**Trade-off:**
- ❌ Requires internet connection (acceptable since we're often at coffee shops anyway)

---

## Supabase Client Usage Patterns

### Server-side API Routes (`src/routes/api/**/*.ts`)
**Use:** `SUPABASE_SERVICE_ROLE_KEY` from `$env/static/private`

**Purpose:** Bypasses Row Level Security (RLS)

**Example:**
```typescript
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
```

### Client-side/Shared Library Code (`src/lib/*.ts`)
**Use:** `PUBLIC_SUPABASE_ANON_KEY` from `$env/static/public`

**Purpose:** Respects Row Level Security (RLS)

**Example:**
```typescript
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
```

---

## Local Supabase Not Used

The local Supabase instance at `http://127.0.0.1:54321` is **not being used**.

**To stop it:**
```bash
npx supabase stop
```

---

## Production Deployment

When we deploy to production, we'll create a **separate production Supabase project**.

For now, the remote Supabase instance in `.env` serves as our "development database" accessible from both machines.

---

## Date
January 2025
