# Pretty Formatting

## Overview

This branch focuses on improving the visual formatting and presentation of the Asura chat interface.

## Goals

- [ ] **Add markdown rendering for AI responses**
- [ ] Enhance message readability
- [ ] Improve visual hierarchy
- [ ] Refine spacing and typography
- [ ] Optimize color contrast
- [ ] Polish UI animations and transitions

## Custom Formatting Rules

**Accent Color**: Border color of send button (extracted from CSS)

### Transformations

1. **Headings → Accent Bold**
   - Input: `# Heading`, `## Heading`, `### Heading`
   - Output: Bold text in accent color (hashes stripped)
   - All heading levels (H1-H6) render identically

2. **Horizontal Rules → Grey Divider**
   - Input: `---`
   - Output: Very thin grey divider line

3. **Bold → Accent Color**
   - Input: `**text**`
   - Output: Accent color text (bold stripped, NOT bold)

4. **Italic → Accent Italic**
   - Input: `*text*`
   - Output: Italic text in accent color

5. **Bullet Lists → Indented Accent Bullets**
   - Input: `- item` or `* item`
   - Output: Indented, bullet symbol in accent color

6. **Numbered Lists → Indented Accent Numbers**
   - Input: `1. item`
   - Output: Indented, number in accent color

### Non-Standard Behavior

- **No traditional bold**: Bold markdown becomes accent color (not bold)
- **Unified headings**: All heading levels look the same (accent bold)
- **Accent-first design**: Lists, italics, bold all use accent color

## Areas for Improvement

### Typography
- Font sizes and line heights
- Text contrast and readability
- Code block formatting
- Inline code styling

### Spacing
- Message card padding
- Vertical rhythm between messages
- Container margins
- Responsive spacing adjustments

### Visual Elements
- Message card borders and shadows
- Color scheme refinement
- Button and icon styling
- Loading states and transitions

## Implementation Notes

Current UI files to review:
- [src/routes/+page.svelte](src/routes/+page.svelte) - Main chat interface
- [src/app.css](src/app.css) - Global styles and CSS variables
- [src/lib/components/](src/lib/components/) - Reusable components
- [src/lib/markdown-renderer.ts](src/lib/markdown-renderer.ts) - Custom markdown renderer

## Zero-Spacing Implementation ✅

**Problem**: Visible spacing appeared above and below bullet/numbered lists despite setting all element margins to 0.

**Root Cause**: The `.message-text` container had `white-space: pre-wrap`, which preserved newline characters in the HTML output from marked.js. These newlines created visual spacing between block-level elements.

**HTML Structure** (from marked.js):
```html
<p style="margin: 0;">List header with colon:</p>
<ul style="margin: 0; ...">
  <li>Item 1</li>
</ul>
<p style="margin: 0;">Next list header:</p>
```

Even with `margin: 0` on all elements, the literal `\n` characters between `</ul>` and `<p>` were rendered as whitespace by the browser due to `white-space: pre-wrap`.

**Solution Applied**:

1. **Changed parent container whitespace handling** ([src/routes/+page.svelte:897](src/routes/+page.svelte#L897))
   ```css
   .message-text {
     line-height: 1.6;
     color: hsl(var(--foreground));
     white-space: normal; /* Changed from pre-wrap */
   }
   ```

2. **Set explicit margins on all markdown elements** ([src/lib/markdown-renderer.ts](src/lib/markdown-renderer.ts))
   - Headings: `margin: 0`
   - Paragraphs: `margin: 0; display: block;`
   - Lists: `margin: 0; padding: 0 0 0 24px; list-style: none; display: block;`
   - List items: `margin: 0; display: flex;`
   - Horizontal rules: `margin: 0`

3. **Disabled automatic line break conversion** ([src/lib/markdown-renderer.ts:82](src/lib/markdown-renderer.ts#L82))
   ```typescript
   marked.setOptions({
     renderer,
     breaks: false, // Don't convert line breaks to <br>
     gfm: true,
   });
   ```

**Result**: Zero visual spacing between all markdown elements (headings, paragraphs, lists, horizontal rules).

**Key Insight**: When rendering markdown with custom spacing, the parent container's `white-space` property must be `normal` (not `pre-wrap`) to collapse newlines in the HTML source. Setting element margins alone is insufficient if newline characters are preserved.

## Testing Checklist

- [ ] Test on different screen sizes (mobile, tablet, desktop)
- [ ] Verify color contrast meets accessibility standards
- [ ] Check formatting with long messages
- [ ] Test with code blocks and inline code
- [ ] Verify dark/light theme consistency (if applicable)

---

**Branch**: pretty-formatting
**Created**: 2025-11-21
