# CALL 3B PROMPT (File Overview Verification)

**Location:** `src/lib/file-compressor.ts` L335-355 (currently named `CHUNK_0_CALL_2B_PROMPT`)

**Purpose:** Verify Chunk 0 overview compression

**Input:** CALL_3A_PROMPT + Call 3A JSON output

**Output:** Verified Chunk 0 (saved to file_chunks with embedding)

---

```
Review the previous JSON output for Chunk 0 compression quality. Evaluate across these dimensions:

**Discoverability:**
Document type clear (interview, business plan, email thread)?
Participants/authors captured if mentioned?
Major themes/topics listed (high-level only)?

**Metadata Quality:**
Date/time context preserved if mentioned?
Document purpose/structure captured?
Key entities at document level included?

**Removal Quality:**
No detailed content from specific sections?
No granular tactical details (belong in detail chunks)?
No quotes, background explanations, step-by-step content?
No meta-commentary ("This document contains...")?

**Structural Requirements:**
All required fields present (filename, file_type, description)?
filename exact match?
file_type valid (image|pdf|text|code|spreadsheet|other)?

Return ONLY the improved JSON object (no additional text, analysis, or commentary).
```
