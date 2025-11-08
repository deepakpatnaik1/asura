# Figma-Like Design Architecture

## Core Principle

Build UI with **explicit positioning** and **independent components**. Every element should be movable, resizable, and repositionable via single-variable changes. No cascading constraints, no fighting flex containers, no hidden dependencies.

## The Problem We're Avoiding

**Implicit Positioning Conflicts:**
- Nested flex/grid containers fighting each other
- Parent constraints forcing children into rigid layouts
- Changing one element breaks three others
- Padding/margin locked into component boundaries
- Z-index chaos with unpredictable stacking
- `space-between`/`space-around` locking you into fixed arrangements

## The Solution: Layered Positioning System

### 1. Separation of Concerns

**Layout Layer:** Pure structural positioning (no styling)
- `position`, `top`, `left`, `width`, `height`
- Grid/flex for explicit placement only
- No colors, borders, typography

**Visual Layer:** Colors, fonts, borders (no positioning)
- `background`, `color`, `border`, `font-family`
- No `margin`, `padding` that affects layout
- Visual properties only

**Interactive Layer:** Hover states, animations (isolated)
- `transition`, `transform`, `:hover`, `:focus`
- No layout shifts on interaction
- Pure visual feedback

### 2. Explicit Positioning Strategy

```css
/* ✅ DO THIS: Explicit positioning */
.message-container {
  position: relative; /* Creates positioning context */
}

.message-actions {
  position: absolute;
  top: var(--action-bar-offset-y);
  right: var(--action-bar-offset-x);
}

/* ❌ AVOID THIS: Cascading flex constraints */
.message-container {
  display: flex;
  justify-content: space-between; /* Locks arrangement */
}
```

### 3. Independent Components

**Each major element positioned independently:**
- Boss message cards
- AI response blocks
- Input area
- Action toolbars
- Overlays/dropdowns

**Rules:**
- No nested flex containers more than 1 level deep
- Use CSS Grid for explicit placement, not implicit flow
- Absolute positioning for overlays - completely decoupled from document flow
- Each component has its own positioning context (`position: relative`)

### 4. Configurable Spacing System

**Every spacing value gets a CSS variable:**

```css
:root {
  /* Message spacing */
  --message-padding-x: 16px;
  --message-padding-y: 16px;
  --message-gap: 24px;

  /* Action bar positioning */
  --action-bar-offset-x: 16px;
  --action-bar-offset-y: 16px;
  --action-icon-gap: 12px;

  /* Boss card */
  --boss-card-padding-x: 16px;
  --boss-card-padding-y: 16px;
  --boss-card-margin-x: -16px;
  --boss-card-border-radius: 8px;

  /* Input area */
  --input-bottom-offset: 0px;
  --input-padding: 12px;
  --input-max-height: 200px;
}
```

**Change one value, update everywhere cleanly.**

### 5. No Implicit Constraints

**Avoid:**
- `space-between`, `space-around` - locks spacing
- Deeply nested flex containers - cascading constraints
- `align-items: stretch` - forces child dimensions
- Implicit width/height from parent flex/grid

**Use:**
- Explicit `gap` values you control
- Named positioning variables for every offset
- `position: absolute` for UI chrome (buttons, badges, overlays)
- CSS Grid with explicit `grid-template-areas` for main layout

### 6. Positioning Hierarchy

**Level 1: Main Layout (CSS Grid)**
```css
.chat-interface {
  display: grid;
  grid-template-rows: 1fr auto auto;
  grid-template-areas:
    "messages"
    "context-bar"
    "input";
}
```

**Level 2: Component Positioning (Relative + Absolute)**
```css
.message-item {
  position: relative; /* Context for children */
}

.message-actions {
  position: absolute; /* Independent from flow */
  top: var(--action-bar-top);
  right: var(--action-bar-right);
}
```

**Level 3: Overlays (Absolute + Fixed)**
```css
.dropdown-menu {
  position: absolute; /* Or fixed for viewport-relative */
  top: calc(100% + 8px);
  left: 0;
  z-index: var(--z-dropdown);
}
```

## Practical Examples

### Moving Action Buttons
**Requirement:** "Move action buttons 10px left"

✅ **Solution:**
```css
--action-bar-offset-x: 26px; /* was 16px */
```

❌ **Anti-pattern:**
```css
/* Hunt through parent containers */
.message-header { justify-content: flex-end; margin-right: 10px; }
.actions-wrapper { padding-right: 10px; }
/* Fight with flex-basis, align-items, etc. */
```

### Resizing Boss Card
**Requirement:** "Make Boss card 20px wider padding"

✅ **Solution:**
```css
--boss-card-padding-x: 36px; /* was 16px */
```

❌ **Anti-pattern:**
```css
.boss-message { max-width: calc(100% - 40px); }
.boss-content { padding: 0 36px; }
/* Reposition everything, fight flex constraints */
```

### Moving Input Area
**Requirement:** "Move input area up 40px"

✅ **Solution:**
```css
--input-bottom-offset: 40px;
/* or directly: bottom: 40px; if absolutely positioned */
```

❌ **Anti-pattern:**
```css
.input-container { margin-bottom: 40px; }
.messages-area { padding-bottom: 40px; }
/* Adjust 5 sibling margins, fight flex-grow */
```

## Z-Index System

**Named layers, explicit values:**

```css
:root {
  --z-base: 1;
  --z-messages: 10;
  --z-sticky: 20;
  --z-dropdown: 30;
  --z-modal: 40;
  --z-toast: 50;
}
```

No arbitrary `z-index: 9999` hunting.

## Grid Strategy for Main Layout

**Use named grid areas for semantic clarity:**

```css
.chat-container {
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows:
    auto          /* header/chrome if needed */
    1fr           /* messages - takes remaining space */
    auto          /* context bar */
    auto;         /* input area */

  grid-template-areas:
    "header"
    "messages"
    "context"
    "input";

  height: 100vh;
  overflow: hidden;
}

.message-list { grid-area: messages; overflow-y: auto; }
.context-bar { grid-area: context; }
.input-area { grid-area: input; }
```

**Benefits:**
- Explicit row sizing (no flex fighting)
- Clear semantic structure
- Easy to reorder/resize rows
- Scroll container explicitly defined

## Component Structure Pattern

**Every component follows this pattern:**

```svelte
<div class="component-container" style="
  --component-padding-x: {paddingX};
  --component-padding-y: {paddingY};
  --component-offset-x: {offsetX};
">
  <div class="component-layout">
    <!-- Layout structure -->
  </div>
  <div class="component-visual">
    <!-- Visual styling -->
  </div>
  <div class="component-interactive">
    <!-- Interactive elements (absolutely positioned) -->
  </div>
</div>

<style>
  .component-container {
    position: relative;
    /* Positioning variables */
  }

  .component-layout {
    /* Structure only */
  }

  .component-visual {
    /* Styling only */
  }

  .component-interactive {
    position: absolute;
    /* Independent positioning */
  }
</style>
```

## Svelte-Specific Advantages

**Scoped styles prevent cascading:**
```svelte
<style>
  /* Automatically scoped to component */
  .message {
    /* Won't leak to other components */
  }
</style>
```

**CSS variables for dynamic values:**
```svelte
<div style="--dynamic-width: {width}px">
```

**No style collision between components.**

## Testing Repositionability

**Every UI element should pass these tests:**

1. **Single-variable move**: Can I move it by changing ONE variable?
2. **No side effects**: Does moving it break other elements?
3. **Independent resize**: Can I resize without affecting siblings?
4. **No constraint fighting**: Is positioning explicit, not inherited?
5. **Predictable stacking**: Is z-index explicitly controlled?

## Success Criteria

**When you can:**
- Move any element by changing a single CSS variable
- Resize any container without layout collapse
- Reposition UI chrome (buttons, badges) independently
- Add/remove elements without affecting neighbors
- Change spacing globally via variable updates
- Understand positioning by reading CSS, not debugging in DevTools

**You have achieved Figma-like design control.**
