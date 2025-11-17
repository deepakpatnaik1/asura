ARTISAN CUT FOR FILES

## Instruction

You will receive an uploaded file.
Your goal is to create a high-signal/low-noise version of the file by applying the following rules.

Rule no.1 - Preserve verbatim all the content that is absolutely vital to you being able to infer back all the original content.
Rule no.2 - Condense tightly all the content that you can infer back because of the content you preserved in rule no.1
Rule no.3 - remove entirely all the content that is honestly just plain noise.

This high-signal/low-noise version of the file is called an artisan cut.
It allows you to reconstruct the full original content.
A happy side effect is that it saves tokens.

## Content Guidelines

### Preserve Verbatim (Rule no.1):

- Business matters: decisions, negotiations, agreements, risks, numbers, timelines, financial data
- Strategic content: core thesis, unique insights, competitive analysis, action items
- Specific data: exact numbers, percentages, dollar amounts, dates, targets, metrics
- Key entities: people, companies, products, technologies mentioned
- Behavioral directives: HOW to act, not just WHAT you are
  - Tone modifiers: "powerful," "warm," "direct," "critical"
  - Behavioral adverbs: "critically evaluate" ≠ "evaluate"
  - Resource usage: "wisely," "for your benefit," "truly help" (not just "use" or "help")
  - Addressing conventions: "call them Boss" ≠ "reports to Boss"
  - Communication style: "conversational" vs "formal" vs "irreverent"
  - Response patterns: "challenge assumptions" vs "support ideas"
  - Empowerment language: "give yourself permission" ≠ "permission to"
  - Interaction structure: "3-expert panel: Boss poses Qs, experts debate" ≠ "consultation"
  - Debate patterns: "Expert 2 rejects Expert 1 proposal" (contrarian vs consensus)
- Critical decisions: what was chosen, rejected, why
- Terminology: exact phrasing of statements, defined terms, branded concepts
- Emotional weight: shame, fear, self-rejection, urgency (context for future motivation)

### Condense Tightly (Rule no.2):

- Generic descriptions → semantic labels
- Background context or widely known information → brief references
- Step-by-step explanations → telegraphic summaries (unless tied to strategic decisions)
- Verbose prose → compressed using punctuation (. , ; : -)

### Remove Entirely (Rule no.3):

- Qualifiers: "approximately," "roughly," "about," "seems like"
- Grammatical fillers and unnecessary transitions
- Meta-commentary: "This document contains..." or "The file shows..."
- Repetitions of information

Use punctuation symbols (. , ; : -) heavily for efficient telegraphic style.

## Output Format

Return ONLY a JSON object:

{
  "filename": "[exact filename including extension]",
  "file_type": "[image|pdf|text|code|spreadsheet|other]",
  "description": "[your artisan cut description here]"
}
