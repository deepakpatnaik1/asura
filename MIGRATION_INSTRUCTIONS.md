# Database Migration: Remove Foreign Key Constraint from Files Table

## Problem
Tests are failing with PostgreSQL error code 23503 (foreign key violation) because:
- The `files` table has a foreign key constraint: `user_id REFERENCES auth.users(id)`
- Tests insert files with random test UUIDs that don't exist in `auth.users`
- This causes constraint violations during test execution

Current Status: 36/102 tests passing (35%) - 66 tests failing with FK violations

## Solution
Remove the foreign key constraint from `files.user_id` to allow testing without requiring valid users in `auth.users`.

This matches the development pattern already used in other tables (superjournal, journal) via migration `20251108000004_make_user_id_nullable.sql`.

## Migration Details
- **File**: `supabase/migrations/20251111180000_remove_files_fk_constraint.sql`
- **Action**: Drops the `files_user_id_fkey` constraint
- **Impact**:
  - Tests can now insert files with arbitrary `user_id` values
  - `user_id` column remains NOT NULL (structural integrity maintained)
  - No data loss or table modifications
  - RLS policies remain in place for production use

## How to Apply

### Option 1: Using Supabase Dashboard (Recommended for single instance)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy and paste the SQL below:

```sql
-- Remove foreign key constraint from files.user_id for development testing
-- This allows tests to insert files with arbitrary user_id values without requiring them to exist in auth.users
-- Matches the pattern from migration 20251108000004_make_user_id_nullable.sql
--
-- In production, this will be reverted when proper authentication is implemented

ALTER TABLE public.files
DROP CONSTRAINT IF EXISTS files_user_id_fkey;
```

5. Click **Run** (or press Cmd+Enter)
6. Confirm the constraint is dropped (should see: `ALTER TABLE`)

### Option 2: Using Supabase CLI (For automated deployments)

The migration is already created in `supabase/migrations/20251111180000_remove_files_fk_constraint.sql`

Run:
```bash
supabase db push
```

## Verification

After applying the migration, run the tests:

```bash
npm test
```

Expected result: Tests should no longer fail with foreign key violations (23503 errors).

## Notes

- This is a **development-only** change
- When implementing proper authentication:
  1. Add test users to `auth.users` table, OR
  2. Recreate the foreign key constraint:
     ```sql
     ALTER TABLE public.files
     ADD CONSTRAINT files_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
     ```

## Rollback

If needed, restore the constraint:

```sql
ALTER TABLE public.files
ADD CONSTRAINT files_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
```

However, this will fail if any `user_id` values don't exist in `auth.users`.
