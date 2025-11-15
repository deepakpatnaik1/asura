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

