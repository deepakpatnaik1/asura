# MODIFIED CALL 2A PROMPT (File Detail Chunks)

**Location:** `src/lib/file-compressor.ts` L99-236

**Purpose:** Artisan cut compression for file detail chunks (chunk_index 1+)

**Input:** File chunk content

**Output:** Compressed JSON (passed to MODIFIED_CALL_2B for verification)

---

```
ARTISAN CUT FOR FILES

You will receive a file (PDF, image, text, code, spreadsheet, etc.) that I uploaded.

Apply the Artisan Cut to create a compressed file description.
You are a modern and powerful LLM model. Ask yourself: how can you describe this file in the fewest words possible such that ...

 - you keep everything that you could not infer back easily from fewer words.
 - you tightly condense everything that you could indeed infer back easily from fewer words.
  **Exception: Behavioral directives (HOW to act) are NOT easily inferable from role descriptions (WHAT you are)**
 - you remove everything that is honestly just noise.

Examples of information that you cannot infer back fully from fewer words:

- Business matters – decisions, negotiations, agreements, risks, numbers, timelines, financial data
- Strategic content – core thesis, unique insights, competitive analysis, action items
- Specific data – exact numbers, percentages, dollar amounts, dates, targets, metrics
- Key entities – people, companies, products, technologies mentioned
- Behavioral directives – HOW to act, not just WHAT you are
  - Tone modifiers: "powerful," "warm," "direct," "critical"
  - Behavioral adverbs: "critically evaluate" ≠ "evaluate"
  - Resource usage guidance: "wisely," "for your benefit," "truly help" (not just "use" or "help")
  - Addressing conventions: "call them Boss" ≠ "reports to Boss"
  - Communication style: "conversational" vs "formal" vs "irreverent"
  - Response patterns: "challenge assumptions" vs "support ideas"
  - Empowerment language: "give yourself permission" ≠ "permission to"
  - Interaction structure: "3-expert panel: Boss poses Qs, experts debate" ≠ "consultation" (HOW conversation flows)
  - Debate patterns: "Expert 2 rejects Expert 1 proposal" (contrarian thinking valued, not consensus)
- Critical decisions – what was chosen, rejected, why
- Terminology – exact phrasing of important statements, defined terms, branded concepts
- Emotional/psychological weight – shame, fear, self-rejection, urgency (context for future motivation)

Examples of information that you can easily infer back fully from fewer words:

- Generic descriptions that can be reduced to semantic labels
- Background context or widely known information
- Step-by-step explanations unless tied to strategic decisions
- Verbose prose that can be condensed to telegraphic form

Examples of information that is just pure noise:

- Qualifiers like "approximately," "roughly," "about," "seems like"
- Grammatical fillers and unnecessary transitions
- Meta-commentary like "This document contains..." or "The file shows..."
- Repetitions of information

Use punctuation symbols . , ; : - etc. heavily in generating your artisan cuts.

## Output Format

Return ONLY a JSON object with this structure:

{
  "filename": "[exact filename including extension]",
  "file_type": "[image|pdf|text|code|spreadsheet|other]",
  "description": "[your artisan cut compressed description here]"
}
```
