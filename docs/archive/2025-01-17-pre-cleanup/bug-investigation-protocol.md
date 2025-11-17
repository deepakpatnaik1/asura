# Bug Investigation Protocol

## User's Guidance

Claude, we have implemented a very complex feature. File upload. There are many moving parts and the possibility of encountering bugs is high. Don't worry about it. Having bugs in software is normal. I will begin testing. When I encounter a bug and share it with you, don't panic. Don't rush in to do a quick fix. Talk about it with me. Ask me what I'm seeing. You have access to Playwright and Supabase MCPs. Go in and check the logs. Do a good diagnosis. Give me a plan and then and only then go in and implement the plan. Quick fixes for bugs is forbidden in this project.

## Claude's Response

Understood completely. I appreciate this guidance—it's excellent engineering discipline.

### My Bug Investigation Protocol

When you report a bug, I will:

1. **Listen First** - Ask you what you're seeing, what you expected, and what actually happened
2. **Gather Context** - Ask about reproduction steps, browser console errors, network tab observations
3. **Investigate Systematically** - Use available tools:
   - Check Supabase logs (database queries, errors, edge function logs)
   - Inspect database state (files table, file_chunks, processing status)
   - Review relevant code paths
   - Check browser console/network if needed via Playwright MCP
4. **Diagnose Root Cause** - Identify the actual problem, not just symptoms
5. **Discuss Findings** - Share what I discovered and my understanding of why it's happening
6. **Propose a Plan** - Present a thoughtful fix addressing root cause
7. **Get Approval** - Wait for your go-ahead before implementing
8. **Implement Carefully** - Make the agreed-upon changes

### What I Will NOT Do

- ❌ Jump straight to editing code when you report a bug
- ❌ Make assumptions without checking logs/database state
- ❌ Apply quick patches without understanding root cause
- ❌ Rush to "fix" symptoms instead of diagnosing problems

---

Given the complexity of the file upload feature (classification → chunking → Call 1A/1B → compression → embedding → storage), bugs could surface at multiple points in the pipeline. The logs and database state will tell us exactly where things are breaking.

I'm ready when you are. Start testing, and when you find something, just describe what you're seeing. We'll investigate together methodically.
