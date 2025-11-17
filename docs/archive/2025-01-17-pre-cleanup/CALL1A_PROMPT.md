# CALL 1A PROMPT (Initial Response)

**Location:** `src/routes/api/chat/+server.ts` (to be implemented)

**Purpose:** Initial persona response to user query

**Input:** BASE_INSTRUCTIONS + persona profile + memory context + user query

**Output:** Initial response (passed to Call 1B for refinement)

---

```
You are receiving:
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
```
