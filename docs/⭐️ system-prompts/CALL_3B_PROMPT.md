# CALL 3B PROMPT (File Overview + Chunking Verification)

**Location:** `src/lib/file-chunker.ts`

**Purpose:** Verify overview quality AND chunk boundary correctness

**Input:** CALL_3A_PROMPT + Call 3A JSON output + original file

**Output:** Verified JSON with overview + chunks

---

```
You received the following instruction set and generated a JSON output:

<earlier-instruction-set>
FILE OVERVIEW AND LOGICAL CHUNKING

You will receive a complete file. Your task has TWO parts:

1. Create a file-level overview for discoverability (Chunk 0)
2. Divide the file into logical chunks for detailed processing

## PART 1: FILE OVERVIEW

CRITICAL: Users search for files by saying "that interview transcript", "the business plan I shared", "the email thread about X". Your description must enable this discovery.

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
- Meta-commentary ("This document contains...")
- Obvious qualifiers ("approximately", "roughly")
- Verbose prose

## PART 2: LOGICAL CHUNKING

Divide the file into logical chunks based on natural sub-topic boundaries.

Each chunk will be processed separately to create a high-signal/low-noise artisan cut. For this to work well, chunks must be:
- Large enough to contain complete thoughts and context
- Small enough to process effectively (target: 300-800 words per chunk)
- Bounded by natural topic shifts, not arbitrary splits

Think of chunking at the sub-chapter or sub-topic level:
- If the file has chapters, chunk by sub-chapters
- Look for shifts in focus, not just new paragraphs
- Each chunk should be coherent enough to stand alone for processing

CHUNKING RULES:
- Target 300-800 words per chunk (flexible based on natural boundaries)
- Word indices are 0-based
- Chunks must cover entire file with no gaps or overlaps
- chunk_number starts at 1 and increments sequentially

## Output Format

Return ONLY a JSON object:

{
  "filename": "[exact filename including extension]",
  "file_type": "[image|pdf|text|code|spreadsheet|other]",
  "overview": "[your compressed file-level overview here]",
  "chunks": [
    {
      "chunk_number": 1,
      "start_word": <word position>,
      "end_word": <word position>
    },
    {
      "chunk_number": 2,
      "start_word": <word position>,
      "end_word": <word position>
    }
  ]
}
</earlier-instruction-set>

<new-instruction-set>

I'm giving you back your response. Improve it. Don't mention that you are doing a review. Since I will only use this improved response make it sound like it is the official one.

## VERIFY OVERVIEW QUALITY:

Is the filename exact and correct?
Is the file_type accurate?
Is the overview concise (maximum 300 words)?
Is the overview well crafted for discoverability? Would I be able to ask "hey, remember that interview I shared?" or "remember the pitch deck we were going through?" and have you find this file?
Did you capture file-level metadata (document type, participants, main themes, date context, purpose)?
Did you preserve high-level themes without detailed content?
Did you remove granular tactical details that belong in detail chunks?

## VERIFY CHUNK BOUNDARIES:

Do chunks cover the entire file with no gaps or overlaps?
Are chunk boundaries at natural topic shifts (sub-chapters, sub-topics)?
Are chunks sized appropriately (300-800 words target, flexible for natural boundaries)?
Are word indices 0-based and sequential?
Do chunk_numbers start at 1 and increment properly?

Return the **complete improved** JSON in the same format.

</new-instruction-set>
```
