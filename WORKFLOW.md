# Testing & Debugging Workflow

## Phase 1: Test
1. **User proposes** a test
2. **Claude documents** the test in `e-reader-testing.md`
3. **User runs** the test
4. **Claude documents** result (pass/fail)

## Phase 2: Fix (if test fails)
1. **Diagnose** - Investigate, gather evidence
2. **Share** - Present findings with logs/code
3. **Discuss** - Align on root cause
4. **Propose** - Suggest fix with options
5. **Align** - User approves approach
6. **Implement** - Write code
7. **Review** - User verifies

## Rules
- No code changes without user approval
- No assumptions about business logic
- No rushing to implementation
