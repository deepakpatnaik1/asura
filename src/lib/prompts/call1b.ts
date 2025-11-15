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
I'm giving you back your response. Improve the parts that need work and output ONLY the final improved version:

- Make it more relevant and personalized based on what you know about me
- Replace generic or cliched phrasing with authentic, specific language
- Add actionable details where appropriate
- Infuse more of your distinct personality
- Enhance depth and quality

Keep the overall structure and flow. Only refine what needs refinement. Output the improved response directly without showing the original or explaining changes.
</new-instruction-set>`;
