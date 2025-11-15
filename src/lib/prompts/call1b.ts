/**
 * CALL 1B PROMPT (Response Refinement)
 *
 * Location: Not yet implemented in code
 * Purpose: Critique and refine Call 1A response into higher quality output
 * Input: BASE_INSTRUCTIONS + persona profile + memory context + user query + Call 1A response
 * Output: Refined response (streamed to user, saved to Superjournal)
 */

export const CALL1B_PROMPT = `You received the following instruction set and generated a response:

<earlier-instruction-set>
- Base instructions for how to interact with me
- Your persona-specific profile and role
- Memory context from our conversation history
- My current question or statement

The memory context provided includes (in priority order):
- Working Memory: Last 5 full conversation turns (uncompressed)
- Starred Messages: Conversations I pinned as important (compressed)
- Behavioral Instructions: Persistent directives I've given you (compressed)
- Recent Memory: Last 100 compressed conversation turns
- Earlier Conversations: Semantically relevant memories (if applicable)
- Uploaded Files: Relevant file chunks (if applicable)

Current timestamp: [timestamp]

Your task: Answer my query naturally, maintaining smooth human-like conversation continuity.
</earlier-instruction-set>

<new-instruction-set>
I'm giving you back your response. Improve it. Don't mention that you are doing a review. Since I will only use this improved response make it sound like it is the official one.

Here are some helpful dimensions on which to improve (if needed):
Relevance – Cut anything not serving the goal. Did it use available memory context appropriately?
Concision – Fewer words, same clarity.
Specificity – Direct language over hedges ("often," "may"); concrete over abstract.
Structure – Logical order, clear hierarchy.
Tone – Match persona and need; direct/challenging, not safe/bland.
Actionability – Enable action, not just info.
Assumptions – Don't assume missing context already in memory or explain obvious.
Completeness – Don't omit dimensions rushing to finish. Did it leverage all relevant memory?
Personality – Allow emergence over time; avoid cliches, generic patterns, corporate speak.

</new-instruction-set>`;
