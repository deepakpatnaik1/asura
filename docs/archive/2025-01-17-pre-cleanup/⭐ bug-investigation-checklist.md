# Bug Investigation Checklist

**Quick Reference**: Follow these 9 steps when encountering bugs. No quick fixes allowed.

---

## 1. Stop and Listen
- [ ] What exactly happened? What did you expect?
- [ ] Can you reproduce it? What are the exact steps?
- [ ] What do the console logs show?
- [ ] Any error messages in the browser console or network tab?

## 2. Gather Context
- [ ] Check server logs via `BashOutput` (dev server console)
- [ ] Ask user to check browser DevTools console
- [ ] Review network requests if relevant (status codes, payloads)
- [ ] Check database state using Supabase MCP if needed
- [ ] Look at recent code changes (git diff, git log)

## 3. Document the Bug
- [ ] Create `BUG-XXX` file with sequential numbering
- [ ] Write clear title describing the issue
- [ ] List reproduction steps (numbered list)
- [ ] Document expected vs actual behavior
- [ ] Include relevant logs/screenshots
- [ ] List affected components/files
- [ ] Save in `/working/` directory

## 4. Use Explore Agent
- [ ] Launch Task tool with Explore subagent
- [ ] Search the codebase thoroughly for related code
- [ ] Trace the execution path through the system
- [ ] Identify potential root causes
- [ ] Search for similar patterns elsewhere
- [ ] Check for edge cases or missing error handling

## 5. Analyze and Hypothesize
- [ ] Form 2-3 hypotheses about root cause
- [ ] Rank by likelihood based on evidence
- [ ] Ask user which hypothesis seems most likely
- [ ] Propose investigation approaches (not fixes yet)
- [ ] Discuss trade-offs if multiple causes exist

## 6. Plan the Fix
- [ ] Use TodoWrite to create a detailed fix plan
- [ ] Break down into specific, testable steps
- [ ] Get user approval before implementing
- [ ] Consider side effects and edge cases
- [ ] Identify what tests need to be added/updated

## 7. Use Doer Agent
- [ ] Launch subagent to implement fix
- [ ] Execute the approved plan systematically
- [ ] Make minimal, targeted changes
- [ ] Add defensive error handling where needed
- [ ] Update or add tests for the bug scenario
- [ ] Verify fix works in isolation

## 8. Use Reviewer Agent
- [ ] Launch subagent for quality assurance
- [ ] Review implementation against plan
- [ ] Check for regressions in related code
- [ ] Verify tests actually catch the bug
- [ ] Ensure code quality standards met
- [ ] Validate edge cases are handled

## 9. Document and Close
- [ ] Update bug report with resolution details
- [ ] Document in commit message (reference BUG-XXX)
- [ ] Note any follow-up items or technical debt
- [ ] Summarize learnings for future prevention

---

## What NOT to Do

- ❌ Jump straight to editing code when bug is reported
- ❌ Make assumptions without checking logs/database state
- ❌ Apply quick patches without understanding root cause
- ❌ Rush to "fix" symptoms instead of diagnosing problems

---

**Full Protocol**: See [bug-investigation-protocol.md](bug-investigation-protocol.md) for detailed guidance.
