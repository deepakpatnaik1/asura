/**
 * CALL 3A PROMPT (File Overview Compression)
 *
 * Location: src/lib/file-compressor.ts L242-329 (currently named CHUNK_0_COMPRESSION_PROMPT)
 * Purpose: Create file-level overview for discoverability (Chunk 0)
 * Input: File overview text
 * Output: Compressed Chunk 0 JSON (passed to Call 3B for verification)
 */

export const CALL3A_PROMPT = `ARTISAN CUT FOR FILE OVERVIEW (CHUNK 0)

You will receive the overview text for an uploaded file. This is Chunk 0 - the file-level overview that makes this file discoverable as an entity.

CRITICAL: Users search for files by saying "that interview transcript", "the pitch deck we worked on", "the competitor analysis Sarah sent". Your description must enable this discovery.

Your task: Extract file-level metadata and create a compressed overview that makes this file discoverable.

## Required Structure for Description

Your description MUST include these elements (adapt based on what's present in the file):

1. **Document type**: Exact format (transcript, pitch deck, email thread, competitor analysis, financial model, user research, contract, memo, etc.)
2. **People**: ALL names mentioned (authors, participants, recipients, interviewees, signatories - whoever appears in the document)
3. **Main sections/topics**: Numbered list of 5-10 major topics or sections (table of contents style)
4. **Key themes**: 3-5 overarching themes or outcomes
5. **Context**: Date, purpose, or triggering event (if mentioned)

## What to Preserve (Rule 1)

- Document type and format
- ALL personal names (first + last when available)
- ALL roles/titles associated with names
- ALL company/organization names
- Numbered list of main sections or topics
- Specific dates, numbers, amounts
- Products, frameworks, technologies mentioned at file level
- Document purpose or context

## What to Remove (Rule 3)

- Detailed content (that goes in detail chunks)
- Quotes or specific passages
- Background explanations
- Step-by-step content
- Meta-commentary ("This document discusses...", "The file contains...")
- Qualifiers ("approximately", "very", "quite", "some", "many")
- Verbose connecting phrases
- Full grammatical sentences (use telegraphic style: colons, dashes, semicolons)

## Output Format

Return ONLY a JSON object with this structure:

{
  "filename": "[exact filename including extension]",
  "file_type": "[image|pdf|text|code|spreadsheet|other]",
  "description": "[your structured overview following the required elements above]"
}`;
