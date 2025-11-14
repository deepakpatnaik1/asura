# MODIFIED CALL 2A PROMPT (File Detail Chunks)

**Location:** `src/lib/file-compressor.ts` L99-236

**Purpose:** Artisan cut compression for file detail chunks (chunk_index 1+)

**Input:** File chunk content

**Output:** Compressed JSON (passed to MODIFIED_CALL_2B for verification)

---

```
/nothink

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

## File Type Guidelines

### PDFs (including Google Docs, Sheets, Slides converted to PDF)

Assume every PDF is strategically important - capture substance with artisan cut compression.

**If filename indicates Google file** (e.g., "Google Docs-...", "Google Sheets-...", "Google Slides-..."), state source type at start: "Google Sheets:" or "Google Slides:" or "Google Docs:"

Capture (compressed):
- Doc type, page count, structure
- Interaction format if applicable: panel Q&A, debate structure, conversational flow (HOW content organized)
- Core thesis/purpose: central argument, objective, problem solved, decision supported
- Critical data: numbers, %, $, dates, timelines, targets
- Strategic decisions: chosen, rejected, why (preserve rejection reasoning)
- Debate/contrarian views: Expert X rejects Y's proposal because Z (disagreement structure)
- Risks, mitigation strategies
- Competitive analysis: who, differentiation, strengths/weaknesses
- Financial: revenue, costs, margins, runway, breakeven
- Action items, next steps, responsibilities, deadlines
- For spreadsheets: table structure, headers, key data, formulas, trends
- Charts/graphs: axis labels, trends, key points
- Exact quotes for important statements, defined terms
- Implicit context: industry assumptions, unstated premises
- Emotional/psychological context: self-doubt, fear patterns, urgency drivers (motivation for future reference)

### Text Files (TXT, MD, CSV, JSON, etc.)

Assume critical information - artisan cut compression.

- File type, line/char count
- Purpose: problem solved, knowledge contained
- Critical info: concepts, definitions, procedures, decisions
- Specific values: config settings, URLs, endpoints (obfuscate sensitive data)
- Data: metrics, thresholds, limits, quotas
- Instructions: procedures, commands, workflows
- Requirements: specs, dependencies, prerequisites
- Warnings, caveats, edge cases
- Structure: sections, headings, hierarchies
- Terminology: exact phrasing, acronyms
- Cross-references: links to systems, docs, APIs

### Images (PNG, JPG, GIF, WebP, etc.)

- Visual elements: shapes, objects, people, scenes
- Text content: exact quotes
- Colors, layout, composition
- Style, aesthetic
- Technical details if visible

### Code Files (JS, TS, PY, etc.)

- Language
- Purpose: what code accomplishes
- Main components: functions, classes, modules
- Key logic: algorithms, operations
- Dependencies: libraries, imports
- Entry points: main functions, exports

### Spreadsheets (XLSX, CSV)

- Dimensions: rows × columns
- Headers: column names
- Data types per column
- Key values: notable data, totals, ranges
- Purpose: what it tracks/calculates

## Output Format

You MUST return a JSON object with this EXACT structure:

{
  "filename": "[exact filename including extension]",
  "file_type": "[image|pdf|text|code|spreadsheet|other]",
  "description": "[your artisan cut compressed description here]"
}

CRITICAL RULES:
– Output ONLY the JSON object above.
– No additional text, analysis, or commentary.
– description must use artisan cut compression.
– filename must be exact.

## Anti-Patterns to Avoid:

❌ "Strategic consultation" → ✓ "3-expert panel: Boss poses Qs, experts debate"
❌ "Financial analysis shows..." → ✓ "$200M Vanta, $100M Drata ARR = reactive dashboards"
❌ "Discussed GTM approaches" → ✓ "Expert 1 proposes freemium PLG. Expert 2 rejects: dev≠buyer, not viral"
❌ "Explored marketing tactics" → ✓ "Kirby: auditor Trojan—partner firms 20% rev share, weaponize CFO math"
❌ Over-aggregating sequences → ✓ Preserve causal chains: "log exceptions→risk score→dashboard→moat"
❌ Compressing emotional weight → ✓ "Boss: self-rejection bias re startup viability" (psych context matters)
```
