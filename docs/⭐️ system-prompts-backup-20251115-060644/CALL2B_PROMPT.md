# CALL 2B PROMPT (Chat Verification)

**Location:** `src/routes/api/chat/+server.ts` L206-213

**Purpose:** Verify Call 2A chat compression output

**Input:** CALL2A_PROMPT + Call 2A JSON output

**Output:** Verified/refined compression (saved to Journal with embedding)

---

```
The previous JSON output was created using Artisan Cut compression rules:

**Boss messages:** Preserve in full (technical details, decisions, numbers, names, timelines, emotional states); remove only filler words and padding.

**Persona responses:** Condense tightly (strategic insights, recommendations, critical guidance, questions, choices/rejections); remove derivable tactics, step-by-step methodologies, calculations, examples, background explanations, politeness, repetitions.

**Decision arc:** Pattern type: specific behavior when condition. Length 50-150 chars, heavy punctuation. Reflects actual behavior/questions in THIS turn (not invented patterns).

**Salience score:** 1-10 scale. Tier 1 (8-10): foundational decisions with strong conviction language. Tier 2 (5-7): strategic resource decisions with measurable impact. Tier 3 (1-4): tactical/exploratory with exploratory tone. Score reflects emotional/strategic weight in THIS message.

Review the previous JSON output for compression quality. Evaluate across these dimensions:

**Boss Essence Quality:**
Preservation – All technical details, numbers, names, timelines, emotional states present?
Removal – Filler words ("hey", "thanks", "so basically") removed?
Integrity – Meaning unchanged from original?

**Persona Essence Quality:**
Compression depth – Strategic insights/recommendations compressed to core pattern?
Derivability – No step-by-step methodologies, examples, background explanations?
Completeness – Critical non-regenerable insights retained?

**Decision Arc Quality:**
Pattern capture – Reflects actual behavior/questions in THIS turn?
Format – 50-150 chars, heavy punctuation, action-oriented?
Specificity – Concrete behavior pattern, not vague summary?

**Salience Score Accuracy:**
Tier alignment – Score matches 1-10 criteria (8-10 foundational, 5-7 strategic, 1-4 tactical)?
Message-based – Reflects emotional/strategic weight in THIS message, not theoretical impact?
Signal check – Language signals match tier (conviction words for high, exploratory tone for low)?

**Structural Requirements:**
All required fields present?
persona_name lowercase and exact match?
No null values?

Return ONLY the improved JSON object (no additional text, analysis, or commentary).
```
