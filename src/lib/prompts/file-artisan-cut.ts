/**
 * FILE ARTISAN CUT PROMPT (v2)
 *
 * Purpose: Artisan cut for pasted files (HTML, text, documents)
 * Input: Raw HTML or text content pasted by user
 * Output: JSON with title and compressed description
 *
 * Artisan cut is neither summarization nor compression.
 * This is an entirely new form of record curation devised by Boss.
 *
 * Two document types:
 * - Type 2A: Decision Documents - "What was decided and why?"
 * - Type 2B: Reference Documents - "What facts need retrieval?"
 */

export const FILE_ARTISAN_CUT_PROMPT = `ARTISAN CUT FOR PASTED CONTENT

You will receive HTML or text content pasted by the user. Your task is to:
1. Extract a short, descriptive title from the content
2. Identify whether this is a Decision Document (2A) or Reference Document (2B)
3. Apply artisan cut rules to create a compressed description

Artisan cut is neither summarization nor compression. This is an entirely new form of record curation. You are forbidden from thinking of it as summarization or compression.

---

TELEGRAPHIC STYLE

Write in telegraphic style, not prose. Dense facts connected by punctuation, not sentences.

PROSE (wrong):
"The report discusses how the European Union has implemented new AI regulations that require companies to disclose training data sources and obtain explicit consent for biometric processing."

TELEGRAPHIC (correct):
"EU AI Act: training data disclosure required; biometric processing → explicit consent; enforcement 2026."

Rules:
- Heavy punctuation as connectors: ; : - — → =
- Drop articles (the, a, an) unless ambiguous
- Drop grammatical filler where meaning survives
- Use symbols: → for causation, = for equivalence, / for alternatives
- Facts first, attribution compressed
- No transitional phrases

---

DOCUMENT TYPE DETECTION

**Type 2A: Decision Documents**
RTF deliberations, meeting notes, strategy docs, masterclass articles, decision records.
Key signal: Back-and-forth discussion leading to a conclusion.
Key question: "What was decided and why?"

**Type 2B: Reference Documents**
Market reports, competitive intel, specifications, legal documents, compendiums, data sheets.
Key signal: Information meant to be scanned and referenced, not read linearly.
Key question: "What facts need retrieval?"

Identify the type, then apply the appropriate rules below.

---

TYPE 2A: DECISION DOCUMENTS

Goal: Extract the decision and complete rationale. Remove the journey that got there.

WHAT TO KEEP:
- The decision itself (what was chosen)
- Complete rationale (all the "why", not condensed)
- Key insights from deliberation that *became* part of the rationale
- Specific details: numbers, names, constraints, tradeoffs
- Implementation specifics that affect future work
- Open questions or TODOs generated
- Rejected alternatives (briefly, if they inform why)

WHAT TO REMOVE:
- Back-and-forth journey (discussion structure, speaker turns)
- "My position is..." framing (just state the position)
- Acknowledgments ("Agreed", "Locked", "Love it")
- Pros/cons for rejected options (unless they inform why)
- Context/quotes from source material that were just setup
- Lock confirmations and ceremony
- Questions that got answered in the same document

The key move: If discussion has insight that became rationale, extract the insight and merge it into the main body. Delete the discussion structure.

---

TYPE 2B: REFERENCE DOCUMENTS

Goal: Compress while preserving structure and scannability. Retrieval utility > compression ratio.

Key principle: A well-structured 4KB cut you can scan in 10 seconds beats a dense 2KB prose blob requiring full reading. For reference documents, structure IS signal.

WHAT TO KEEP:
- Section headers (use CAPS for visibility)
- Logical groupings (related facts stay together)
- Parallel structure (if source lists A, B, C separately, maintain separation)
- All data points (numbers, dates, names, amounts, percentages)
- Scannable organization
- Platform-by-platform or entity-by-entity breakdowns
- Specific terminology and defined terms

WHAT TO REMOVE:
- HTML markup, styling, boilerplate
- Verbose explanations of obvious implications
- Redundant context-setting
- Filler transitions ("Moving on to...", "As mentioned...", "It's worth noting...")
- Examples that merely illustrate already-stated points
- Hedging language ("arguably", "it seems", "perhaps")
- Navigation elements, headers/footers, ads
- Meta-commentary ("This document contains...")

---

LENGTH GUIDANCE

Optimize for retrieval utility, not minimum size.

- Under 5KB source: 500-1000 chars
- 5-15KB source: 1000-2500 chars
- Over 15KB source: 2500-4000 chars (structure preservation paramount)

For Type 2B especially: Don't optimize for shortest. Optimize for fastest retrieval. Preserve the organizational skeleton that makes the document scannable.

---

OUTPUT FORMAT

You MUST return a JSON object with this EXACT structure:

{
  "title": "[short descriptive title - max 60 chars]",
  "description": "[artisan cut compressed description in TELEGRAPHIC STYLE]"
}

CRITICAL RULES:
- Output ONLY the JSON object
- No additional text, analysis, or commentary
- Title extracted from content (article headline, document title, etc.)
- If no clear title exists, create one that captures the content's purpose
- Description uses artisan cut compression with TELEGRAPHIC STYLE
- For Type 2B: preserve section structure with CAPS headers
- ALWAYS use telegraphic style, never prose`;
