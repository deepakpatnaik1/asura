# Database Tests - Quick Start Guide

## Current Status: 18/136 Tests Passing (13.2%)

### Run Tests

```bash
# Run all database tests
npx vitest run tests/integration/database/

# Run only passing tests (schema validation)
npx vitest run tests/integration/database/schema.test.ts

# Run with verbose output
npx vitest run tests/integration/database/ --reporter=verbose

# Watch mode (auto-rerun on changes)
npx vitest tests/integration/database/
```

### Why Only 18 Tests Pass?

The remote Supabase database has an **old schema** (from `file-feature-planning` branch).

**Missing columns**:
- `description` (Artisan Cut compressed text)
- `embedding` (VECTOR(1024) for Voyage AI)
- `updated_at` (auto-updating timestamp)

**Extra columns**:
- `total_chunks` (for old chunking approach)
- `processed_chunks` (for old chunking approach)

### Fix: Apply New Migration

```bash
# Option 1: Apply migration via Supabase CLI
npx supabase db push

# Option 2: Apply migration manually
# Copy content of: supabase/migrations/20251111120100_create_files_table.sql
# Run in Supabase SQL Editor: https://supabase.com/dashboard/project/hsxjcowijclwdxcmhbhs/sql/new
```

### After Migration

All 136 tests should pass:
```bash
npx vitest run tests/integration/database/
# Expected: 136/136 passing
```

### Test Coverage

- **schema.test.ts**: Schema validation (18 tests) ✅ PASSING
- **files-crud.test.ts**: CRUD operations (32 tests) ⚠️ BLOCKED
- **vector-search.test.ts**: Vector similarity (20 tests) ⚠️ BLOCKED
- **integrity.test.ts**: Data integrity (25 tests) ⚠️ BLOCKED
- **user-isolation.test.ts**: RLS policies (20 tests) ⚠️ BLOCKED
- **advanced-operations.test.ts**: Complex queries (25 tests) ⚠️ BLOCKED

### Environment Setup

Tests use remote Supabase with service role key:

```env
PUBLIC_SUPABASE_URL=https://hsxjcowijclwdxcmhbhs.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...  # Full key in .env
```

Service role key bypasses RLS and has full database access.

### Documentation

- **README.md**: Detailed schema analysis and recommendations
- **TEST-SUMMARY.md**: Complete test execution report
- **QUICK-START.md**: This file

### Need Help?

See full analysis in **TEST-SUMMARY.md** or **README.md**
