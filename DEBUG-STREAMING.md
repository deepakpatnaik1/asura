# BUG-STREAM-009: No Visible Streaming

## Problem
User reports no visible streaming - response appears instantly without character-by-character rendering.

## Investigation Steps

### 1. Check Browser Console
Look for these log messages in the browser console when sending a message:
- `[Chat Store] Response content-type: text/event-stream`
- `[Chat Store] Starting SSE stream handling`
- `[Chat Store] Chunk received, length: X Total: Y`
- `[Chat Store] Stream complete, final length: Z`

### 2. Possible Findings

**If you see "Response content-type: application/json"**:
- Backend NOT sending SSE, sending JSON instead
- Check `src/routes/api/chat/+server.ts` line 489-495
- Verify response headers include `Content-Type: text/event-stream`

**If you see "text/event-stream" but no chunk messages**:
- SSE detected but no chunks arriving
- Check network tab for actual response
- May be buffering issue

**If you see chunks but response still appears instant**:
- Chunks arriving too fast (AI generating very quickly)
- UI updates batched by Svelte reactivity
- Try longer/more complex prompt to see streaming

### 3. Add Debug Logging

Add to `src/lib/stores/chat.ts` line 90 (after `streamedText += data.content;`):
```typescript
console.log('[Chat Store] Chunk received, length:', data.content.length, 'Total:', streamedText.length);
```

Add to line 99 (after `// Stream complete`):
```typescript
console.log('[Chat Store] Stream complete, final length:', streamedText.length);
```

### 4. Test Cases

**Short question** (may be too fast to see streaming):
- "What is 2+2?"
- Expected: ~10-20 word response, may appear instant

**Medium question** (should show streaming):
- "Explain how photosynthesis works in plants"
- Expected: ~100-200 word response, should show streaming

**Long question** (definitely should show streaming):
- "Write a detailed essay about the causes and effects of World War II"
- Expected: ~500+ word response, clear streaming behavior

## Next Steps

1. User should test with longer prompt
2. Check browser console for debug logs
3. Report findings: which logs appear, timing of chunks
4. Check Network tab > Response preview to see if chunks arriving
