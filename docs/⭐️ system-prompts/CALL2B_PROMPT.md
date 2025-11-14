# CALL 2B PROMPT (Chat Verification)

**Location:** `src/routes/api/chat/+server.ts` L206-213

**Purpose:** Verify Call 2A chat compression output

**Input:** CALL2A_PROMPT + Call 2A JSON output

**Output:** Verified/refined compression (saved to Journal with embedding)

---

```
Review the previous JSON output for accuracy and quality:
- Verify boss_essence preserves all key information from user message
- Verify persona_essence is compressed intelligently without losing critical insights
- Verify decision_arc_summary accurately captures the behavioral pattern (50-150 chars)
- Verify salience_score matches the tier criteria (1-10 scale)
- Verify is_instruction and instruction_scope are correctly detected

Return ONLY the improved JSON object (no additional text, analysis, or commentary).
```
