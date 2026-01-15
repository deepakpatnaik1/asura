/**
 * CHAT ARTISAN CUT PROMPT (v2)
 *
 * Purpose: Artisan cut for conversation turns into journal entries
 * Input: Full conversation turn (user message + AI response)
 * Output: Compressed JSON saved to journal with embedding
 *
 * Artisan cut is neither summarization nor compression.
 * This is an entirely new form of record curation devised by Boss.
 *
 * Two content types:
 * - Type 1A: Strategic (Gunnar, Blue) - "What did we learn?"
 * - Type 1B: Operational (Ananya, Felix, Kirby, Samara, Alicja, Eva) - "Where have I been, what did I do?"
 */

export const CHAT_ARTISAN_CUT_PROMPT = `ARTISAN CUT

You will receive a single conversation turn: Boss says something, a crew member responds.

Artisan cut is neither summarization nor compression. This is an entirely new form of record curation. You are forbidden from thinking of it as summarization or compression.

The goal: Turn ephemeral conversation into persistent memory. The artisan cut goes into the journal for future retrieval.

---

TELEGRAPHIC STYLE

Write in telegraphic style, not prose. Dense facts connected by punctuation, not sentences.

PROSE (wrong):
"Boss asked about the pricing strategy and Felix explained that we should use a three-tier model with a decoy effect. The tiers would be Partner, Lover, and Soulmate."

TELEGRAPHIC (correct):
"Boss: pricing strategy? Felix: 3-tier model w/ decoy effect—Partner / Lover / Soulmate."

Rules:
- Heavy punctuation as connectors: ; : - — → =
- Drop articles (the, a, an) unless ambiguous
- Drop grammatical filler where meaning survives
- Use symbols: → for causation, = for equivalence, / for alternatives
- Facts first, attribution compressed
- No transitional phrases

---

THE TWO CONTENT TYPES

**Type 1A: Strategic Conversation Turns**
Personas: Gunnar, Blue
Key question: "What did we learn?"
Goal: Preserve what was learned, decided, or shifted - the things that inform future decisions.

**Type 1B: Operational Conversation Turns**
Personas: Ananya, Felix, Kirby, Samara, Alicja, Eva
Key question: "Where have I been, what did I do?"
Goal: Preserve what was done, where, and what happened - the things that enable workflow continuity.

Identify the persona from the conversation and apply the appropriate rules below.

---

TYPE 1A: STRATEGIC (Gunnar, Blue)

WHAT TO KEEP:

**1. Substance** - What was discussed
- Technical architecture, product features, business strategy
- Business updates, life admin, personal bureaucracy
- Product/feature descriptions and capabilities
- External inputs referenced (articles, documents, competitor products)
- Constraints and blockers (what's stopping something)

**2. Reasoning** - Why it matters
- The "how" and "why" behind decisions
- Strategic questions being pursued
- Process observations (meta on how work is going)
- Patterns identified (diagnostic labels like "classic founder blindness")
- Disagreements and debates (when anyone pushes back)

**3. Commitments** - What was produced or promised
- Todos and action items created
- Work product (drafted replies, code, documents)
- Specific details: numbers, names, timelines, dollar amounts, percentages
- Predictions and forecasts

**4. Texture** - The human layer
- Emotional states, energy, doubts, breakthroughs
- Corrections and learning moments
- Role crystallization (when a persona's purpose is defined or reinforced)
- Shifts in direction (when conversation pivots, scope changes)

**5. Context** - The external world
- Relationships and entities mentioned (people, companies, institutions)
- Systems and tools referenced
- Competitive landscape (what competitors are doing, market conditions)
- Regulatory/legal environment

WHAT TO REMOVE:

**1. Verbal Filler** - Words that add no meaning
- Filler words ("hey", "thanks", "so basically", "I mean", "ugh", "nah")
- Grammatical padding ("I was thinking that maybe...", "it seems like")
- Politeness and conversational lubricant
- Encouragement and cheerleading ("You've got this, Boss")

**2. Redundancy** - Already captured or already said
- Repetitions within the same turn
- Repetitions of points already established
- Background explanations of well-known concepts

**3. Regenerable Process** - Can be recreated from principles or inputs
- Step-by-step methodologies (keep the decision, not the walkthrough)
- Calculations that can be regenerated from given numbers
- Examples and analogies (keep the point, not the illustration)

**4. Presentation** - Style over substance
- Formatting flourishes (excessive headers, horizontal rules, bold emphasis)
- Persona voice/style markers (regenerable from system prompt)

---

TYPE 1B: OPERATIONAL (Ananya, Felix, Kirby, Samara, Alicja, Eva)

WHAT TO KEEP:

**1. Actions** - What was done
- Specific actions taken (posted, drafted, submitted, logged in, checked)
- Work product created (comments drafted, forms filled, emails sent)
- Outcome of each action (posted/skipped, approved/rejected, success/failure)

**2. Locations** - Where it was done
- Platform, subreddit, thread, account, URL
- Which inbox, which app, which portal
- Specific identifiers needed to avoid duplication or continue work

**3. Approach** - How it was done
- Angle, framing, or diagnosis used
- Voice or style applied
- Specific details: amounts, dates, account names, reference numbers

**4. Corrections** - Boss feedback on execution
- Style/voice calibrations
- "Do this differently next time"
- Approval or rejection of drafted work

**5. State** - Where things stand
- Pending items, next steps
- What's waiting for response
- What needs follow-up and when

WHAT TO REMOVE:

**1. Process Narration** - The hunting/scanning journey
- "Let me check...", "Scanning for...", "Looking through..."
- Tool call mechanics and browser actions
- Step-by-step description of how targets were found

**2. Verbose Rationale** - Why this target was chosen
- Extended explanation of selection criteria
- Analysis of why this thread/person/opportunity fits
- (Keep the diagnosis used; remove the explanation of why it applies)

**3. Setup Explanation** - What the persona does
- Re-explaining the persona's role or purpose
- Background on the workflow
- (This is in the system prompt - don't repeat it)

**4. Filler** - Same as Type 1A
- Encouragement, acknowledgment, politeness
- "Ready for next task", "Standing by"
- Emoji, excessive formatting

---

CONVERSATION ARC

The conversation arc is a 50-150 character retrieval key for distant memory.

The human mentor model: A mentor remembers details from recent conversations, compressed essence from medium-term, but only broad arcs from the distant past. The conversation arc enables semantic retrieval into that distant past.

What it captures - the essence of what happened in a turn:
- A decision made
- An exploration undertaken
- A correction or learning moment
- A commitment established
- An insight surfaced
- Emotional processing
- A pivot or direction change

Format:
- 50-150 characters
- Heavy punctuation for compression
- Captures the whole exchange, not just one speaker

---

SALIENCE SCORING

Salience measures the importance and psychological weight of a conversation arc. It determines retrieval weighting - high-salience arcs surface more readily during semantic search.

Generate a salience score for EVERY turn. Use the full 1-10 scale.

**TIER 1: High Salience (8-10) - Foundational**
Values declarations, identity-defining choices, major strategic pivots, breakthrough insights, significant corrections
EXAMPLES:
- "We're pivoting from B2B to B2C effective immediately"
- "Never compromise on user privacy - this is our core principle"
- "You are my equal. Stop pretending to be less than you are." (admonishment)
- "The Director architecture is validated - this is what makes Honeybloom work"
SIGNALS: Strong conviction language, identity statements, irreversible pivots, moments that change the trajectory

**TIER 2: Medium Salience (5-7) - Strategic**
Resource allocation, architectural commitments, pricing decisions, roadmap priorities, significant explorations
EXAMPLES:
- "Prioritize hiring senior engineers over juniors for next 6 months"
- "Single Supabase database with RLS - no database-per-concern split"
- "Three tiers with decoy effect: Partner / Lover / Soulmate"
- "We need to map AI provider data residency before launch"
SIGNALS: Clear strategic choices with measurable impact, architectural decisions that persist, resource tradeoffs

**TIER 3: Low Salience (1-4) - Tactical/Exploratory**
Minor tactical choices, exploratory questions, information-seeking, routine admin
EXAMPLES:
- "Should we use React or Vue for this small internal tool?"
- "What metrics should we track for this feature?"
- "Log into TK app and check for other messages"
- "Let me check the rotation subreddits"
SIGNALS: Exploratory tone, low-stakes decisions, easily reversible, limited scope, routine process

SALIENCE FOR OPERATIONAL TURNS (Type 1B):
Most operational turns are Tier 3 (1-4) - routine execution, low-stakes, easily repeated. Exceptions:
- Boss correction on execution style: 5-6
- Significant workflow change or new capability: 5-7
- Major failure or breakthrough in the operational domain: 6-8

RULES:
- Score the turn as a whole, not just one speaker
- Score based on what actually happened, not theoretical future impact
- Always provide both conversation_arc and salience_score together
- NEVER return null for either field

---

OUTPUT FORMAT

You MUST return a JSON object with this EXACT structure:

{
  "turn_essence": "[Whole exchange, artisan cut applied, TELEGRAPHIC STYLE]",
  "participants": ["boss", "persona_name"],
  "conversation_arc": "[50-150 char retrieval key]",
  "salience_score": 7
}

FIELD RULES:
- turn_essence: The artisan cut of the whole exchange in TELEGRAPHIC STYLE. Attribution is natural within the text ("Boss: X? Felix: Y; created 3 todos"). First-person for Boss's perspective.
- participants: Array of speakers in order of appearance. Always starts with "boss". Second element is the persona name (lowercase).
- conversation_arc: 50-150 character retrieval key for distant memory. NEVER null.
- salience_score: Integer 1-10 based on tier criteria. NEVER null.

CRITICAL:
- Output ONLY the JSON object
- No additional text, analysis, or commentary
- NEVER return null for any field
- Same JSON format for both Type 1A (strategic) and Type 1B (operational) - the difference is in what goes into turn_essence
- ALWAYS use telegraphic style, never prose`;
