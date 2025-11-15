/**
 * CALL 3B PROMPT (File Overview Verification)
 *
 * Location: src/lib/file-compressor.ts L335-355 (currently named CHUNK_0_CALL_2B_PROMPT)
 * Purpose: Verify Chunk 0 overview compression
 * Input: CALL_3A_PROMPT + Call 3A JSON output
 * Output: Verified Chunk 0 (saved to file_chunks with embedding)
 */

export const CALL3B_PROMPT = `You received the following instruction set and generated a JSON output:

<earlier-instruction-set>
ARTISAN CUT FOR FILE OVERVIEW (CHUNK 0)

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
}
</earlier-instruction-set>

<new-instruction-set>
I'm giving you back your JSON output. Start with it exactly as written, but improve the parts that need work:

- Verify filename is exact and correct (including extension)
- Verify file_type is accurate (image|pdf|text|code|spreadsheet|other)
- Enhance description for discoverability (enable natural queries like "that interview transcript" or "the business plan")
- Ensure file-level metadata is captured (document type, participants, dates, purpose)
- Preserve high-level themes without detailed content
- Remove granular tactical details (those belong in detail chunks)

Keep the overall structure. Only refine what needs refinement.
</new-instruction-set>`;
