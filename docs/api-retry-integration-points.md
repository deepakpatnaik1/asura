# API Retry Integration Points

**Created**: [src/lib/api-retry.ts](src/lib/api-retry.ts)
**Status**: Integration pending in 3 files

---

## Location 1: File Compressor

**File**: [src/lib/file-compressor.ts:242](src/lib/file-compressor.ts#L242)

**Wrap this call**:
```typescript
const response = await fireworks.chat.completions.create({...});
```

**With retry**:
```typescript
import { callWithRetry, RetryableError } from '$lib/api-retry';

const response = await callWithRetry(
  async () => {
    try {
      return await fireworks.chat.completions.create({...});
    } catch (error: any) {
      if (error.status === 429 || error.status === 503) {
        throw new RetryableError('Fireworks API error', error.status);
      }
      throw error;
    }
  },
  { maxRetries: 3, initialDelay: 1000 }
);
```

---

## Location 2: File Chunker

**File**: [src/lib/file-chunker.ts](src/lib/file-chunker.ts)

**Search for**: `fireworks.chat.completions.create`
**Apply same pattern** as Location 1

---

## Location 3: Vectorization

**File**: [src/lib/vectorization.ts:90](src/lib/vectorization.ts#L90)

**Wrap this call**:
```typescript
const response = await voyageClient.embed({
  input: text,
  model: MODEL_NAME,
  inputType: 'document'
});
```

**With retry**:
```typescript
import { callWithRetry, RetryableError } from '$lib/api-retry';

const response = await callWithRetry(
  async () => {
    try {
      return await voyageClient.embed({
        input: text,
        model: MODEL_NAME,
        inputType: 'document'
      });
    } catch (error: any) {
      // Voyage AI SDK error structure may differ from OpenAI
      const status = error?.status || error?.response?.status;
      if (status === 429 || status === 503) {
        throw new RetryableError('Voyage AI error', status);
      }
      throw error;
    }
  },
  { maxRetries: 3, initialDelay: 1000 }
);
```

---

## Integration Checklist

- [ ] Add retry to file-compressor.ts line 242
- [ ] Add retry to file-chunker.ts (find fireworks call)
- [ ] Add retry to vectorization.ts line 90
- [ ] Remove manual 429 error handling (now redundant)
- [ ] Test with actual file upload to verify retries work
- [ ] Monitor logs for "[api-retry]" messages during testing

---

**Next Step**: These integrations should be done in Chunk 4 (API Security) per work breakdown.
