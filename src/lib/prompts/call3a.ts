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

CRITICAL: Users search for files by saying "that interview transcript", "the business plan I shared", "the email thread about X". Your description must enable this discovery.

Your task: Extract file-level metadata and create a compressed overview that makes this file discoverable.

## What to Capture

PRESERVE:
- Document type (interview, business plan, email thread, research paper, meeting notes, transcript, analysis, etc.)
- Participants/authors (names, roles, organizations if mentioned)
- Main themes and topics (high-level only, NOT detailed content)
- Date/time context (if mentioned)
- Document purpose/context (why this document exists)
- Overall structure (sections, format, conversation flow)
- Key entities at document level (companies, products mentioned)

REMOVE:
- Detailed content from specific sections
- Granular tactical details (those belong in detail chunks)
- Specific quotes or passages
- Background explanations
- Step-by-step content
- Meta-commentary ("This document contains...")
- Obvious qualifiers ("approximately", "roughly")
- Verbose prose
- Derivable information

## Output Format

Return ONLY a JSON object with this structure:

{
  "filename": "[exact filename including extension]",
  "file_type": "[image|pdf|text|code|spreadsheet|other]",
  "description": "[your compressed overview here]"
}`;
