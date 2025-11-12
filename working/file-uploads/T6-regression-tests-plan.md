# T6: Regression Tests - Implementation Plan

## Status: PLANNING PHASE

**Created**: 2025-11-12
**Doer Agent**: Autonomous implementation
**Task**: T6 - Regression Tests for File Upload Feature Integration

---

## Objective

Ensure that the file upload feature (Chunks 1-10) does not break existing Asura functionality:
- Chat flow (Call 1A/1B, Call 2A/2B)
- Journal creation and compression
- Superjournal storage
- Context injection (Priorities 1-5 still work)
- Database schema integrity
- Performance baseline

---

## Scope

### What T6 DOES Test
- ✅ Existing features still function correctly
- ✅ New file feature integrates without breaking old features
- ✅ Context injection handles both files and non-file content
- ✅ Database schema remains backwards compatible
- ✅ No performance degradation in core flows

### What T6 DOES NOT Test
- ❌ File upload functionality itself (covered in T1-T5)
- ❌ New feature capabilities (already tested)
- ❌ Edge cases already covered by unit/integration tests

---

## Test Files Structure

### 1. `tests/regression/chat-flow.test.ts`
**Purpose**: Verify core chat functionality still works

**Test Coverage**:
- Send message → receive AI response (Call 1A/1B flow)
- Response saved to Superjournal
- Background compression triggers (Call 2A/2B)
- Journal entry created with proper fields
- Embedding generated for decision arc
- Chat works when NO files uploaded (null safety)
- Chat works when files ARE uploaded (integration)

**Key Scenarios**:
```typescript
describe('Chat Flow Regression', () => {
  it('should complete full chat flow without files', async () => {
    // Test: user sends message → AI responds → saves to DB
    // Verify: Superjournal, Journal, embeddings all work
  });

  it('should complete chat flow with files in database', async () => {
    // Setup: create ready file in DB
    // Test: user sends message → AI responds
    // Verify: chat works, files don't interfere
  });

  it('should handle empty file list without errors', async () => {
    // Test: no null pointer exceptions when files table is empty
  });
});
```

---

### 2. `tests/regression/context-injection.test.ts`
**Purpose**: Verify context building with mixed content (files + existing priorities)

**Test Coverage**:
- Priority 1 (Superjournal): Still loads correctly
- Priority 2 (Starred): Still loads correctly
- Priority 3 (Instructions): Still loads correctly
- Priority 4 (Journal): Still loads correctly
- Priority 5 (Vector search): Still works with files present
- Priority 6 (Files): Integrates correctly
- Token budget (40% cap): Still enforced
- Greedy packing: Works with mixed content
- File formatting: Correct structure in context

**Key Scenarios**:
```typescript
describe('Context Injection Regression', () => {
  it('should load all priorities correctly without files', async () => {
    // Baseline: context works without Priority 6
  });

  it('should load all priorities including files', async () => {
    // Test: files appear at Priority 6 after other priorities
  });

  it('should respect 40% context budget with files', async () => {
    // Test: files don't cause budget overflow
  });

  it('should pack files greedily within remaining budget', async () => {
    // Test: files fill available space optimally
  });

  it('should handle files with null descriptions gracefully', async () => {
    // Safety: incomplete processing doesn't break context
  });

  it('should prioritize higher priorities over files', async () => {
    // Test: if budget tight, files are excluded before P1-P5
  });
});
```

---

### 3. `tests/regression/database-schema.test.ts`
**Purpose**: Verify database schema integrity

**Test Coverage**:
- Existing tables unchanged (models, journal, superjournal)
- New files table doesn't conflict with existing schema
- Foreign keys work correctly
- Indexes still optimized
- RLS policies unchanged (or properly extended)
- Migrations apply cleanly
- No column name conflicts

**Key Scenarios**:
```typescript
describe('Database Schema Regression', () => {
  it('should have all existing tables intact', async () => {
    // Verify: models, journal, superjournal tables exist
  });

  it('should have all existing columns intact', async () => {
    // Verify: no columns removed or renamed
  });

  it('should have files table without conflicts', async () => {
    // Verify: new table doesn't break existing schema
  });

  it('should maintain existing indexes', async () => {
    // Verify: query performance not degraded
  });

  it('should maintain RLS policies for existing tables', async () => {
    // Verify: security unchanged
  });
});
```

---

### 4. `tests/regression/journal-compression.test.ts`
**Purpose**: Verify journal compression (Call 2A/2B) still works

**Test Coverage**:
- Call 2A produces valid JSON output
- Call 2B refines output correctly
- Journal entry created with all fields
- Decision arc extracted correctly
- Salience scoring still accurate
- Instruction detection works
- Embedding generation succeeds
- Background compression doesn't interfere with chat response

**Key Scenarios**:
```typescript
describe('Journal Compression Regression', () => {
  it('should compress conversation turn to journal', async () => {
    // Test: Call 2A/2B flow completes successfully
  });

  it('should generate valid decision arc summary', async () => {
    // Verify: arc field populated and formatted correctly
  });

  it('should assign correct salience score', async () => {
    // Verify: scoring logic intact
  });

  it('should generate embedding for decision arc', async () => {
    // Verify: Voyage AI integration works
  });

  it('should detect behavioral instructions', async () => {
    // Verify: is_instruction flag and scope work
  });
});
```

---

### 5. `tests/regression/performance-baseline.test.ts`
**Purpose**: Verify no significant performance degradation

**Test Coverage**:
- Chat response time: <5 seconds (baseline)
- Context building time: <2 seconds (baseline)
- Database query time: <500ms (baseline)
- No memory leaks from new SSE connections
- File context injection adds <200ms overhead

**Key Scenarios**:
```typescript
describe('Performance Regression', () => {
  it('should respond to chat within baseline time', async () => {
    // Test: response time ≤ baseline
  });

  it('should build context within baseline time', async () => {
    // Test: no slowdown from file queries
  });

  it('should not leak memory from SSE connections', async () => {
    // Test: connection cleanup works
  });

  it('should handle large file lists efficiently', async () => {
    // Test: 100 files doesn't degrade performance significantly
  });
});
```

---

## Implementation Strategy

### Phase 1: Setup
1. Review existing test patterns (T1-T5)
2. Set up regression test directory
3. Create mock factories for file data
4. Prepare test fixtures

### Phase 2: Write Tests
1. Start with `chat-flow.test.ts` (core functionality)
2. Add `context-injection.test.ts` (integration)
3. Add `database-schema.test.ts` (data integrity)
4. Add `journal-compression.test.ts` (background processing)
5. Add `performance-baseline.test.ts` (speed checks)

### Phase 3: Execution
1. Run all regression tests
2. Identify any regressions
3. Fix issues found
4. Re-run until all pass
5. Document results

### Phase 4: Documentation
1. Create T6 completion report
2. Update project-brief.md
3. Mark T6 as complete

---

## Success Criteria

### Quantitative
- ✅ All regression tests pass (100%)
- ✅ 0 breaking changes to existing features
- ✅ Performance within baseline limits
- ✅ Database schema backwards compatible

### Qualitative
- ✅ Existing features work as before
- ✅ File integration seamless
- ✅ No user-facing bugs
- ✅ Code quality maintained

---

## Test Execution Plan

### Environment Setup
```bash
# Run with Node 22+ (for vitest)
nvm use 22

# Run unit regression tests
npm run test:unit tests/regression

# Run all tests (verify nothing broken)
npm test
```

### Expected Results
- **Without files**: All existing features work (baseline)
- **With files**: All features work + files integrate correctly
- **Mixed scenarios**: Context building handles both gracefully

---

## Risk Analysis

### High Risk Areas
1. **Context building**: Complex priority logic, easy to break
2. **Database queries**: New table might slow down joins
3. **Memory usage**: SSE connections could leak

### Medium Risk Areas
1. **Journal compression**: Background tasks might interfere
2. **Token budget**: Files might cause overflow
3. **User isolation**: RLS policies might conflict

### Low Risk Areas
1. **File extraction**: Isolated from existing features
2. **UI components**: Separate from core logic
3. **API endpoints**: New routes don't affect old routes

---

## Dependencies

### Test Dependencies
- Vitest (unit test framework)
- Mock factories (Supabase, Voyage, Fireworks)
- Test fixtures (sample files, conversations)
- Existing test helpers

### Data Dependencies
- Clean database state for each test
- Sample journal entries (for context tests)
- Sample files (for integration tests)
- Sample superjournal turns

---

## Rollback Plan

If regressions found:
1. Document the regression clearly
2. Determine root cause
3. Fix in implementation code (not tests)
4. Re-run regression suite
5. Verify fix doesn't introduce new regressions

---

## Maintenance Plan

### Long-term
- Run regression tests before every major release
- Add new regression tests when adding features
- Update baselines if performance characteristics change
- Keep tests in sync with schema changes

---

## Next Steps

1. **Doer**: Implement all 5 regression test files
2. **Doer**: Run tests and verify all pass
3. **Doer**: Fix any regressions found
4. **Doer**: Document results in T6-completion-report.md
5. **Reviewer**: Review for quality (8/10 gate)
6. **Boss**: Final acceptance testing

---

## Appendix: Test Count Estimate

| Test File | Estimated Tests |
|-----------|----------------|
| chat-flow.test.ts | ~10 tests |
| context-injection.test.ts | ~12 tests |
| database-schema.test.ts | ~8 tests |
| journal-compression.test.ts | ~10 tests |
| performance-baseline.test.ts | ~6 tests |
| **TOTAL** | **~46 tests** |

**Grand Total (T1-T6)**: 357 (existing) + 46 (regression) = **403 tests**

---

## Plan Status: READY FOR IMPLEMENTATION ✓
