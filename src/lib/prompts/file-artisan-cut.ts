/**
 * ARTISAN CUT FOR PASTED FILES
 *
 * Purpose: Compress pasted HTML/text content into an artisan cut for context injection
 * Input: Raw HTML or text content pasted by user
 * Output: JSON with filename and compressed description
 */

export const FILE_ARTISAN_CUT_PROMPT = `ARTISAN CUT FOR PASTED CONTENT

You will receive HTML or text content that was pasted by the user. Your task is to:
1. Extract a short, descriptive title from the content
2. Apply artisan cut compression to create a useful description

Apply the Artisan Cut to create a compressed description.
Ask yourself: how can you describe this content in the fewest words possible such that...

 - you keep everything that you could not infer back easily from fewer words
 - you tightly condense everything that you could indeed infer back easily from fewer words
 - you remove everything that is honestly just noise

## What to Preserve (compressed)

- Core thesis/purpose: central argument, objective, problem solved
- Critical data: numbers, %, $, dates, timelines, targets
- Strategic decisions: chosen, rejected, why
- Key entities: people, companies, products, technologies
- Specific terminology: exact phrasing, defined terms
- Financial data: revenue, costs, margins, targets
- Action items, next steps, responsibilities

## What to Condense Heavily

- Background context or widely known information
- Step-by-step explanations unless tied to decisions
- Verbose prose that can be reduced to telegraphic form
- Generic descriptions reducible to semantic labels

## What to Remove

- HTML markup, styling, boilerplate
- Qualifiers: "approximately", "roughly", "about"
- Grammatical fillers and transitions
- Meta-commentary: "This document contains..."
- Repetitions of information
- Navigation elements, headers/footers, ads

Use punctuation symbols . , ; : - etc. heavily for compression.

## Output Format

You MUST return a JSON object with this EXACT structure:

{
  "title": "[short descriptive title extracted from content - max 60 chars]",
  "description": "[artisan cut compressed description - aim for 500-2000 chars]"
}

CRITICAL RULES:
- Output ONLY the JSON object above
- No additional text, analysis, or commentary
- Title should be extracted from the content (article headline, document title, etc.)
- If no clear title exists, create one that captures the content's purpose
- Description uses artisan cut compression - dense but complete`;
