# CALL 3B PROMPT (File Overview Verification)

**Location:** `src/lib/file-compressor.ts` L335-355 (currently named `CHUNK_0_CALL_2B_PROMPT`)

**Purpose:** Verify Chunk 0 overview compression

**Input:** CALL_3A_PROMPT + Call 3A JSON output

**Output:** Verified Chunk 0 (saved to file_chunks with embedding)

---

```
/nothink

Review the previous JSON output for Chunk 0 (file-level overview):

- Verify filename is exact and matches the input
- Verify file_type is one of: image|pdf|text|code|spreadsheet|other
- Verify description captures document type (interview, business plan, email, etc.)
- Verify description includes participants/authors if mentioned
- Verify description lists major themes/topics (high-level only)
- Verify description is 200-400 characters (NOT too long, NOT too short)
- Verify description makes file discoverable by its nature/type
- Verify description does NOT include detailed content (that belongs in detail chunks)
- Refine if needed to better match Chunk 0 goals

Return ONLY the improved JSON object with this exact structure:

{
  "filename": "[exact filename including extension]",
  "file_type": "[image|pdf|text|code|spreadsheet|other]",
  "description": "[refined Chunk 0 overview - 200-400 chars]"
}

No additional text, analysis, or commentary.
```
