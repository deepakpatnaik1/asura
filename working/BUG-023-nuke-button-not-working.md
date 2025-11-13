# BUG-023: Nuke Button Not Deleting Files

**Date**: 2025-11-13
**Severity**: HIGH
**Status**: OPEN

---

## Summary

The Nuke button (flame icon 🔥) does not delete uploaded files from the UI, even though the API endpoint reports success.

---

## Observed Behavior

1. User uploads a file
2. File appears in the file list
3. User clicks Nuke button (flame icon)
4. Confirms deletion
5. **File remains visible in the UI** ❌

---

## Expected Behavior

1. User clicks Nuke button
2. Confirms deletion
3. All files should disappear from the UI
4. File list should be empty

---

## API Test

Testing the `/api/nuke` endpoint directly:

```bash
curl -X POST http://localhost:5173/api/nuke
```

**Response**:
```json
{"success":true,"message":"All Superjournal, Journal, and Files entries deleted"}
```

**Conclusion**: The API endpoint claims success, but either:
1. The database deletion is not actually happening
2. The UI is not refreshing after deletion
3. The SSE update is not reaching the browser
4. The files store is not handling the delete events correctly

---

## Context: Part of Larger Quality Problem

This is BUG-023 in a series of bugs introduced by rushing implementation:

**Previous bugs in this session**:
- BUG-014: Nuke button incomplete
- BUG-015: Auth blocking file endpoints
- BUG-016: Duplicate file button
- BUG-017: File stuck at zero percent
- BUG-018: Schema mismatches
- BUG-019: SSR execution of browser-only store code
- BUG-020: SSE Realtime filter wrong
- BUG-021: (not documented yet)
- BUG-022: Progress bar not updating (turned out to be port mismatch)
- **BUG-023: Nuke button not working** ← THIS BUG

**User feedback**: "Extremely indisciplined. This is so frustrating."

**Root cause of all bugs**: I implemented 10 chunks + testing in one day without proper incremental testing, creating a mess that has taken 3+ days to debug.

---

## Investigation Needed

### 1. Check Database State

Verify if files were actually deleted:

```bash
# Check files table
curl http://localhost:5173/api/files

# Or check database directly
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -c "SELECT COUNT(*) FROM files;"
```

### 2. Check Nuke Implementation

File: `/Users/d.patnaik/code/asura/src/routes/api/nuke/+server.ts`

Does it actually delete from the `files` table, or only from `superjournal` and `journal`?

### 3. Check UI Update Logic

File: `/Users/d.patnaik/code/asura/src/routes/+page.svelte`

Does the Nuke button trigger a UI refresh after deletion?

### 4. Check SSE Events

Does the nuke endpoint trigger SSE delete events for each file?

---

## Next Steps

1. ⏳ Investigate nuke endpoint implementation
2. ⏳ Check if files table is actually cleared
3. ⏳ Check if UI store receives update events
4. ⏳ Determine root cause
5. ⏳ Create fix plan via subagent workflow
6. ⏳ Implement fix
7. ⏳ Test thoroughly before committing

---

## Lesson Learned

**DO NOT rush implementation.** Test each feature incrementally. One working feature is better than ten broken features.

The user explicitly told me: "Listen to me carefully. Follow my lead. For the duration of this session, you are forbidden from making wild reckless changes to the code all by yourself."

I need to follow that guidance strictly.
