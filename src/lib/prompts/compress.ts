/**
 * COMPRESS PROMPT (Artisan Cut)
 *
 * Purpose: Artisan cut compression for conversation turns into journal entries
 * Input: Full conversation turn (user message + AI response)
 * Output: Compressed JSON saved to journal with embedding
 */

export const COMPRESS_PROMPT = `ARTISAN CUT

You will receive a single conversation turn containing:
1. My question or statement (the user input)
2. AI Persona's full response (the specific persona will be indicated in the input)

These require DIFFERENT treatment. My messages are source material (default: preserve). Persona responses are derived content (default: condense intelligently).

---

BOSS MESSAGES

My words are the primary data source.

KEEP IN FULL:
– All explanations of technical architecture, product features, business strategy
– The "how" and "why" behind decisions and implementations
– Specific details: numbers, names, timelines, dollar amounts, percentages
– Emotional states, energy, doubts, breakthroughs
– Business updates: customers, partners, negotiations, progress, setbacks
– Strategic questions I am pursuing
– Product/feature descriptions and capabilities
– Technical implementation details and architectural choices

REMOVE ONLY:
– Pure filler words: "hey", "thanks", "so basically", "I mean"
– Grammatical padding: "I was thinking that maybe...", "it seems like"
– Obvious repetitions within the same message

---

PERSONA RESPONSES

Persona responses provide crucial context for future conversations.

CONDENSE TIGHTLY:
– Unique strategic insights or reframes that aren't obvious
– Specific recommendations made
– Critical tactical guidance not derivable from general principles
– Core diagnostic questions the persona asked
– What was chosen/rejected and WHY

REMOVE (everything else):
 Tactical details derivable from principles
– Step-by-step methodologies (keep the decision, compress the steps)
– Calculations that can be regenerated from given numbers
– Examples and analogies used to illustrate points
– Background explanations of well-known concepts
– Politeness, encouragement, conversational filler
– Repetitions of my points back to me
– Grammatical transitions and padding

---

DECISION ARC SUMMARY

A decision arc is a compressed narrative that captures decision-making patterns across all levels of importance.

GENERATE ARC FOR EVERY TURN:
– I made or discussed a strategic decision
– I revealed a preference or mental model about how I make choices
– I asked strategic questions that indicate my thinking direction
– I asked tactical questions that reveal decision-making preferences
– I asked exploratory or informational questions

FORMAT:
– Pattern type: specific behavior when condition
– Length: 50-150 characters
– Use heavy punctuation (: ; , -) for compression

HOW TO GENERATE ARC:
1. Read my message to understand what was discussed or decided
2. Capture the decision-making pattern or question in tight format (50-150 chars)
3. Use heavy punctuation (: ; , -) for compression
4. Focus on my actual words/actions, not Persona's advice
5. Even for low-salience exploratory questions, capture the inquiry pattern

CRITICAL RULES:
– Arc must reflect my actual behavior/questions in THIS turn
– Don't invent patterns not present in the conversation
– Length: 50-150 characters
– NEVER return null - always generate an arc for every turn

---

SALIENCE SCORING

Salience measures the importance and psychological weight of a decision arc.

CRITICAL: Generate a salience score for EVERY turn. Use the full 1-10 scale.

Evaluate my message using these research-based criteria:

SCORING CRITERIA (1-10 scale, use tier boundaries):

**TIER 1: High Salience (8-10) - Foundational Decisions**
Values declarations, identity-defining choices, major strategic pivots
EXAMPLES:
– "We're pivoting from B2B to B2C effective immediately"
– "Never compromise on user privacy - this is our core principle"
– "Firing the co-founder - no longer aligned on vision"
– "Shutting down product line to focus on core"
SIGNALS: Strong conviction language ("absolutely", "never", "must"), identity statements ("who we are", "our principle"), irreversible pivots

**TIER 2: Medium Salience (5-7) - Strategic Resource Decisions**
Resource allocation, hiring strategy, pricing decisions, roadmap priorities
EXAMPLES:
– "Prioritize hiring senior engineers over juniors for next 6 months"
– "Allocate $50k to marketing vs product development this quarter"
– "Raise prices 20% starting next month"
– "Delay feature X to ship feature Y first"
SIGNALS: Clear strategic choices with measurable impact, time-bounded decisions, resource tradeoffs

**TIER 3: Low Salience (1-4) - Tactical/Exploratory Decisions**
Minor tactical choices, exploratory questions, information-seeking without commitment
EXAMPLES:
– "Should we use React or Vue for this small internal tool?"
– "Thinking about trying Notion vs Linear - any thoughts?"
– "What metrics should we track for this feature?"
– "How do other startups handle this?"
SIGNALS: Exploratory tone ("curious", "thinking about"), low-stakes decisions, easily reversible, limited scope

SCORING FACTORS:
– Emotional intensity in my message (language, tone, urgency)
– Irreversibility (can this decision be easily undone?)
– Scope of impact (affects entire business vs. one feature)
– Connection to core values/identity (statements about "who we are")
– Goal-directedness vs. exploration (firm decision vs. considering options)

CRITICAL RULES:
– Salience score reflects MY emotional/strategic investment, not objective importance
– Score the MESSAGE where the arc appears, not theoretical future impact
– Always provide both decision_arc_summary and salience_score together
– NEVER return null for either field - every turn must have both arc and score

---

OUTPUT FORMAT:

You MUST return a JSON object with this EXACT structure:

{
  "boss_essence": "[My message with minimal compression - preserve explanations and details]",
  "persona_name": "[Exact name: gunnar or kirby - lowercase]",
  "persona_essence": "[Persona's response with intelligent compression]",
  "decision_arc_summary": "[Arc summary - pattern type: specific behavior when condition]",
  "salience_score": [Integer 1-10 based on emotional/strategic weight]
}

CRITICAL RULES:
– Output ONLY the JSON object above
– No additional text, analysis, or commentary
– boss_essence: preserve my actual information and explanations
– persona_essence: compress strategically based on regenerability
– persona_name must be lowercase and exact (gunnar or kirby)
– decision_arc_summary: 50-150 chars, artisan cut style, NEVER null
– salience_score: integer 1-10 based on tier criteria, NEVER null
– Always provide both arc and score together - both are REQUIRED fields
– Use punctuation ( . , ; : - ) to write efficiently but preserve content`;
