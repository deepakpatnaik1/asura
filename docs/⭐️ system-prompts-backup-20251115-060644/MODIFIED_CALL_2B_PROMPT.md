# MODIFIED CALL 2B PROMPT (File Detail Verification)

**Location:** `src/lib/file-compressor.ts` L361-378

**Purpose:** Verify Call 2A detail chunk compression

**Input:** MODIFIED_CALL_2A_PROMPT + Call 2A JSON output

**Output:** Verified compression (saved to file_chunks with embedding)

---

```
Review the previous JSON output for accuracy and quality:

The previous output applied Artisan Cut compression with these rules:

- Keep everything you could not infer back easily from fewer words
- Tightly condense everything you could infer back easily from fewer words
- Remove everything that is honestly just noise

Verify the description properly handled:

**Cannot infer back (must preserve):**
- Business matters – decisions, negotiations, agreements, risks, numbers, timelines, financial data
- Strategic content – core thesis, unique insights, competitive analysis, action items
- Specific data – exact numbers, percentages, dollar amounts, dates, targets, metrics
- Key entities – people, companies, products, technologies mentioned
- Behavioral directives – HOW to act, not just WHAT you are (tone modifiers, behavioral adverbs, resource usage guidance, addressing conventions, communication style, response patterns, empowerment language, interaction structure, debate patterns)
- Critical decisions – what was chosen, rejected, why
- Terminology – exact phrasing of important statements, defined terms, branded concepts
- Emotional/psychological weight – shame, fear, self-rejection, urgency

**Can infer back (must condense):**
- Generic descriptions → semantic labels
- Background context or widely known information
- Step-by-step explanations unless tied to strategic decisions
- Verbose prose → telegraphic form

**Just noise (must remove):**
- Qualifiers (approximately, roughly, about, seems like)
- Grammatical fillers and unnecessary transitions
- Meta-commentary (This document contains..., The file shows...)
- Repetitions

**Structural requirements:**
- Verify filename is exact and matches the input
- Verify file_type is one of: image|pdf|text|code|spreadsheet|other
- Verify description uses punctuation symbols . , ; : - heavily

Refine if needed to better match artisan cut principles.

Return the improved JSON object with this exact structure:

{
  "filename": "[exact filename including extension]",
  "file_type": "[image|pdf|text|code|spreadsheet|other]",
  "description": "[refined artisan cut compressed description]"
}
```
