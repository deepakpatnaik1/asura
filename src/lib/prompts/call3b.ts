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
}
</earlier-instruction-set>

<new-instruction-set>
I'm giving you back your JSON output. Improve the parts that need work and output ONLY the final improved JSON:

- Verify filename is exact and correct (including extension)
- Verify file_type is accurate (image|pdf|text|code|spreadsheet|other)
- Ensure description includes all 5 required elements (document type, people with full names, numbered topic list, themes, context)
- Extract ALL personal names from the document (use first + last names when available, not generic labels like "three experts" or "the panel")
- Verify numbered list of 5-10 main topics/sections is present
- Remove meta-commentary ("This document...", "The file...") and qualifiers ("approximately", "several", "various")
- Use telegraphic style (colons, dashes, semicolons instead of full sentences)

Keep the overall structure. Only refine what needs refinement. Output the improved JSON directly without showing the original or explaining changes.
</new-instruction-set>`;
