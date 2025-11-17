# Better UI Megafeature

## Requirements

### 1. Markdown Formatting with Brand Color

**Brand Color Reference**: The border color of the send button (teal/cyan accent color)

**Formatting Rules**:

1. **Bullets**: Should render as actual bullet points with brand color markers
2. **`### **Heading**`**: Render as H3, bold, brand color
   - Example: `### **Your Playbook**` → H3 heading in brand color, bold
   - Any text AFTER this heading should NOT be bold, H3, or brand color
3. **`**Text**`**: Strip the `**` markers completely
   - Example: `**Track**` → `Track` (plain text, no formatting)
4. **`*Text*`**: Strip the `*` markers completely
   - Example: `*Text*` → `Text` (plain text, no formatting)
5. **`---`**: Completely ignore/remove
   - Usually appears as: line space, `---`, line space
   - Delete the `---` and the second line space

---

## Test Results

### Test 1 - General Asteroid Question (Nov 15, 4:12 PM)

**Failures:**
1. ❌ Bullet markers NOT in brand color (appear standard orange/white)
2. ❌ `**` markers NOT stripped - "**Why they matter to you:**" still shows bold formatting
3. ❌ Extra `*` character appearing in bullet markers (showing `• *` instead of `•`)
4. ❌ "Asteroid" heading appears bold (suggests `**` not stripped)
5. ⚠️  No `### **Heading**` pattern in response to test

**Root Cause Analysis:**
- TextCleaner component may not be processing the text correctly
- CSS for `li::marker` may not be applying brand color
- Regex patterns may not be matching the actual markdown structure

---

## Smart Scrolling Implementation (Nov 16, 2025)

### Requirement
When AI response arrives:
- **Short message** (boss card + AI response fits in viewport): Scroll so bottom of AI response aligns with bottom of viewport
- **Long message** (boss card + AI response exceeds viewport): Scroll so top of boss card aligns with top of viewport with 8px margin above

### Implementation Attempt 1: Failed

**Approach:**
Two separate `$effect()` blocks:
1. Effect 1: `if ($isLoading && $currentMessage)` → `scrollToBottom()` (show boss card + "Thinking...")
2. Effect 2: `if ($currentMessage && !$isLoading)` → Smart scroll logic

**What Worked:**
✅ Boss card and "Thinking..." now visible during loading (Effect 1)

**What Failed:**
❌ Long message smart scroll didn't work - boss card scrolled out of view

**Root Cause:**
Timing and DOM state mismatch:
1. When response arrives: `$isLoading = false`, `$currentMessage` has AI response
2. Effect 2 triggers, tries to find elements with:
   ```javascript
   const bossCard = document.querySelector('.boss-message:last-of-type');
   const aiCard = document.querySelector('.ai-message:last-of-type');
   ```
3. **Problem**: Loading state block (`{#if $isLoading && $currentMessage}`) just disappeared from DOM because `$isLoading = false`
4. New message hasn't been added to `allMessages` yet (happens later in `handleSend()`)
5. Selectors either:
   - Find nothing (if no previous messages)
   - Find the **previous message's cards** (wrong target)
6. Even if timing worked, `currentMessage.set(null)` is called after adding to `allMessages`, causing state confusion

**Additional Issues:**
- The loading state cards and the final rendered cards are **different DOM elements**
- Effect 2 runs at the wrong lifecycle moment (between loading state removal and final message addition)
- No reliable way to target the "about to be rendered" message cards

**Status:** Need new approach - current architecture doesn't support measuring DOM elements that are transitioning between states

---

### Implementation Attempt 2: Simplified Approach - Failed

**Revised Requirement:**
Simplify to eliminate measurement complexity:
- When user sends query, boss card appears at top of viewport with 8px margin
- "Thinking..." appears below
- AI response appears below that
- Boss card stays pinned at top (never scrolls out of view)
- No conditional logic based on message length

**Approach:**
Single `$effect()` block:
```javascript
$effect(() => {
    if ($isLoading && $currentMessage) {
        tick().then(() => {
            const container = document.querySelector('.chat-container');
            const bossCard = document.querySelector('.boss-message:last-of-type');

            if (container && bossCard) {
                bossCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
                setTimeout(() => {
                    container.scrollTop -= 8;
                }, 0);
            }
        });
    }
});
```

**What Failed:**
❌ Boss card and "Thinking..." render **below the viewport** - user has to scroll down to see them

**Root Cause:**
The effect triggers AFTER the DOM elements are rendered. By that time:
1. Elements are added to the bottom of the chat container
2. `scrollIntoView()` is called, but the elements are already below the fold
3. The scroll happens too late - elements have already rendered in their default position
4. User sees no immediate feedback when they send a message

**What Should Happen:**
- Boss card should **instantly** appear at top of viewport when message is sent
- "Thinking..." should be immediately visible below it
- No delay, no need to scroll down

**Status:** Need to rethink when/how scrolling happens - may need to scroll BEFORE or DURING render, not after

---

### Implementation Attempt 3: Instant Scroll Without tick() - Failed

**Approach:**
Remove async delays - use synchronous instant scroll:
```javascript
$effect(() => {
    if ($isLoading && $currentMessage) {
        const container = document.querySelector('.chat-container');
        const bossCard = document.querySelector('.boss-message:last-of-type');

        if (container && bossCard) {
            bossCard.scrollIntoView({ behavior: 'instant', block: 'start' });
            container.scrollTop -= 8;
        }
    }
});
```

**Changes from Attempt 2:**
- Removed `tick()` - no async waiting
- Changed `behavior: 'smooth'` to `behavior: 'instant'` - synchronous scroll
- Removed `setTimeout()` for margin adjustment - applied directly

**What Failed:**
❌ Same issue as Attempt 2 - boss card and "Thinking..." still render below viewport

**Root Cause:**
The problem wasn't the async nature of the scroll - it's the timing of when the effect runs:
1. Effect runs AFTER DOM elements are added to the container
2. Elements are already positioned at the bottom (below viewport)
3. Even instant scrolling can't change the fact that they rendered in the wrong place first

**The Fundamental Issue:**
- `$effect()` runs AFTER Svelte updates the DOM
- By that time, elements are already rendered at their default position (bottom of container)
- Scrolling after render is too late - we need elements to appear at the top initially

**Status:** The reactive effect approach is fundamentally flawed - need completely different architecture
