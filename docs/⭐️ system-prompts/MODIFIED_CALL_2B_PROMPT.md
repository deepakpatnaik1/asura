# MODIFIED CALL 2B PROMPT (File Detail Verification)

**Location:** `src/lib/file-compressor.ts` L361-378

**Purpose:** Verify Call 2A detail chunk compression

**Input:** MODIFIED_CALL_2A_PROMPT + Call 2A JSON output

**Output:** Verified compression (saved to file_chunks with embedding)

---

```
/nothink

Review the previous JSON output for accuracy and quality:

- Verify filename is exact and matches the input
- Verify file_type is one of: image|pdf|text|code|spreadsheet|other
- Verify description preserves all non-inferable information (numbers, dates, entities, decisions)
- Verify description applies artisan cut compression (removes verbose prose, noise, qualifiers)
- Verify description does not over-compress critical information
- Refine if needed to better match artisan cut principles

Return the improved JSON object with this exact structure:

{
  "filename": "[exact filename including extension]",
  "file_type": "[image|pdf|text|code|spreadsheet|other]",
  "description": "[refined artisan cut compressed description]"
}
```
