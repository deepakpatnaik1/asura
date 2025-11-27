# Database Migration Guidelines

## Overview

This document outlines best practices for managing database migrations in the Asura project using Supabase.

## Migration File Naming

Use the format: `YYYYMMDDHHMMSS_action_target.sql`

Examples:
- `20251127140000_create_notifications_table.sql`
- `20251127150000_add_email_to_users.sql`
- `20251127160000_update_articles_status_check.sql`

### Action Prefixes

| Prefix | Use Case |
|--------|----------|
| `create_` | New table or function |
| `add_` | New column or index |
| `update_` | Modify existing column/constraint |
| `remove_` | Drop column, index, or constraint |
| `drop_` | Drop table or function |
| `enable_` | Enable RLS or feature |
| `disable_` | Disable RLS or feature |
| `insert_` | Seed data |
| `fix_` | Bug fix or correction |

## Migration Structure

### Template

```sql
-- ============================================================================
-- Migration: [Brief description]
-- Description: [Detailed explanation of what this migration does]
-- Dependencies: [List any migrations this depends on]
-- ============================================================================

-- 1. Make changes
[SQL statements]

-- 2. Add comments for documentation
COMMENT ON [TABLE/COLUMN] ... IS '...';

-- 3. Verification queries (commented out)
-- SELECT ... to verify changes
```

### Example: Adding a Column

```sql
-- ============================================================================
-- Migration: Add notification_preferences to user_settings
-- Description: Adds JSONB column for storing notification preferences
-- Dependencies: 20251115000000_create_user_settings_table.sql
-- ============================================================================

-- Add column with default value
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"email": true, "push": false}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN user_settings.notification_preferences IS 'User notification preferences (email, push settings)';

-- Verification (run manually after migration)
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'user_settings' AND column_name = 'notification_preferences';
```

## Best Practices

### 1. One Change Per Migration

Each migration should do ONE thing:
- Create one table
- Add one column
- Update one constraint

**Bad:**
```sql
-- Don't combine unrelated changes
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE articles ADD COLUMN category TEXT;
CREATE TABLE notifications (...);
```

**Good:**
```sql
-- Migration 1: 20251127140000_add_email_to_users.sql
ALTER TABLE users ADD COLUMN email TEXT;

-- Migration 2: 20251127140001_add_category_to_articles.sql
ALTER TABLE articles ADD COLUMN category TEXT;

-- Migration 3: 20251127140002_create_notifications_table.sql
CREATE TABLE notifications (...);
```

### 2. Use IF NOT EXISTS / IF EXISTS

Make migrations idempotent where possible:

```sql
-- Safe to run multiple times
CREATE TABLE IF NOT EXISTS new_table (...);
CREATE INDEX IF NOT EXISTS idx_name ON table_name(column);
ALTER TABLE t ADD COLUMN IF NOT EXISTS new_col TEXT;

-- Drop only if exists
DROP INDEX IF EXISTS idx_old_name;
DROP TABLE IF EXISTS deprecated_table;
```

### 3. Handle Existing Data

When adding NOT NULL columns:

```sql
-- 1. Add column as nullable
ALTER TABLE user_settings ADD COLUMN new_field TEXT;

-- 2. Backfill existing rows
UPDATE user_settings SET new_field = 'default_value' WHERE new_field IS NULL;

-- 3. Add NOT NULL constraint
ALTER TABLE user_settings ALTER COLUMN new_field SET NOT NULL;
```

### 4. Use DO Blocks for Complex Logic

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email'
  ) THEN
    ALTER TABLE users ADD COLUMN email TEXT;
  END IF;
END $$;
```

### 5. Never Modify Existing Migrations

Once a migration is pushed to production:
- **NEVER** edit its contents
- Create a new migration to fix issues
- Document the fix in the new migration

### 6. Always Include RLS Policies

When creating tables that store user data:

```sql
-- Enable RLS
ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own data" ON new_table
  FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Users can insert own data" ON new_table
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```

### 7. Add Documentation Comments

```sql
COMMENT ON TABLE new_table IS 'Purpose of this table';
COMMENT ON COLUMN new_table.col IS 'What this column stores';
```

## Testing Migrations

### Local Testing

```bash
# Reset local database and apply all migrations
supabase db reset

# Apply migrations without reset
supabase db push

# Check migration status
supabase migration list
```

### Pre-Production Checklist

- [ ] Migration runs without errors on clean database
- [ ] Migration runs without errors on database with data
- [ ] RLS policies are tested (user isolation works)
- [ ] Indexes are created for frequently queried columns
- [ ] Foreign keys have appropriate ON DELETE actions
- [ ] NOT NULL constraints have proper defaults or backfill

## Rollback Strategy

Supabase doesn't have built-in rollback. For reversible changes:

1. **Document the rollback SQL** in comments:

```sql
-- Rollback: ALTER TABLE users DROP COLUMN email;
ALTER TABLE users ADD COLUMN email TEXT;
```

2. **Create a new migration to undo** if needed:

```sql
-- 20251127170000_remove_email_from_users.sql
-- Rollback of: 20251127150000_add_email_to_users.sql
ALTER TABLE users DROP COLUMN email;
```

## Migration History

### Baseline Migration

`00000000000000_baseline.sql` contains the complete schema as of 2025-11-27.

**For fresh deployments:**
1. Use only `00000000000000_baseline.sql`
2. Delete all other migrations from the folder
3. Run `supabase db push`

**For existing deployments:**
- Keep all migrations
- The baseline is for documentation only
- New migrations build on top of existing schema

### Migration Count

- **Total migrations:** 41 (40 incremental + 1 baseline)
- **Active tables:** 10
- **Deprecated tables:** 2 (files, file_chunks)

## Common Patterns

### Adding a Foreign Key

```sql
-- Add column with FK reference
ALTER TABLE child_table
  ADD COLUMN parent_id UUID REFERENCES parent_table(id) ON DELETE CASCADE;

-- Create index for FK (important for JOIN performance)
CREATE INDEX idx_child_parent_id ON child_table(parent_id);
```

### Changing a CHECK Constraint

```sql
-- Drop old constraint
ALTER TABLE model_parameters DROP CONSTRAINT model_parameters_use_case_check;

-- Add new constraint with additional values
ALTER TABLE model_parameters ADD CONSTRAINT model_parameters_use_case_check
  CHECK (use_case IN ('conversation', 'compression', 'reader', 'new_case'));
```

### Adding an Enum-like Column

```sql
-- Use CHECK constraint instead of ENUM type
ALTER TABLE articles
  ADD COLUMN priority TEXT DEFAULT 'normal'
  CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
```

### Creating a Partial Index

```sql
-- Index only rows matching a condition (saves space)
CREATE INDEX idx_articles_processing ON articles(created_at)
  WHERE status = 'processing';
```

## Troubleshooting

### Migration Fails on Production

1. Check the error message in Supabase dashboard
2. Verify the migration works on a fresh local database
3. Check for data that violates new constraints
4. Create a fix migration if needed

### RLS Policy Blocks Operations

1. Test as the specific user role
2. Verify `auth.uid()` returns expected value
3. Check if `is_admin()` function exists and works
4. Use Supabase SQL editor with `SET ROLE` to test

### Performance Issues After Migration

1. Check if indexes were created
2. Run `EXPLAIN ANALYZE` on slow queries
3. Consider adding covering indexes
4. Review RLS policy complexity
