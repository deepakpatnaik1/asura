# General Fixes

## 2025-11-25: Remove Call 1B, Stream Call 1A Directly

**Rationale**: Anthropic models have improved significantly. The two-call approach (1A generates, 1B refines) is no longer necessary. Streaming 1A directly reduces latency and cost.

**Changes**:
- `src/routes/api/chat/+server.ts`:
  - Removed `CALL1B_PROMPT` import
  - Converted Call 1A from `createMessage()` to `createMessageStream()`
  - Removed all Call 1B code (~50 lines)
  - Simplified `saveConversationToDatabase()` signature (removed `call1BTokens` param)
  - Token tracking now only counts single call

**Result**: Single streaming call instead of two sequential calls. ~50% reduction in tokens used per message.

**Test Status**: PASSED

**Note**: Initial test failed due to unrelated database issue (`user_settings` had stale model identifier `claude-haiku-4-5` instead of `claude-haiku-4-5-20251001`). Fixed via SQL update, streaming now works correctly.

---

## 2025-11-25: Simplify Call 2A/2B to Call 2

**Rationale**: Same as Call 1 - models have improved, verification step no longer needed.

**Changes**:
- `src/routes/api/chat/+server.ts`:
  - Removed `CALL2B_PROMPT` import
  - Removed Call 2B block (~40 lines)
  - Renamed variables: `call2AJson` → `compressionJson`
  - Updated logging to "Call 2"

**Result**: Single compression call instead of two. 50% fewer compression API calls.

**Test Status**: PASSED

**Test**: User asked "what is an asteroid"
- Decision arc: "Exploratory question: seeking foundational definition/context on asteroids"
- Embedding: 1024-dim vector generated via Voyage AI and saved to journal

