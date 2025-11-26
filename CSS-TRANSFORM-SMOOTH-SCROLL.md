# Buttery Smooth Scroll with CSS Transforms

A technique for achieving sub-pixel precision scrolling using CSS transforms instead of native `scrollTop`.

---

## The Problem

Native `scrollTop` only accepts integer pixel values. When scrolling at slow speeds (e.g., 0.01 px/ms for e-reader auto-scroll), the browser rounds to whole pixels, causing:

- **Jerky 1px jumps** instead of continuous motion
- **Visible stuttering** at slow scroll speeds
- **Uneven pacing** as fractional pixels accumulate and then "snap"

```javascript
// This gets rounded to integers - jerky at slow speeds
container.scrollTop += 0.5; // Actually moves 0 or 1 pixel
```

---

## The Solution: CSS Transforms

Use `translateY()` on the content element instead of `scrollTop` on the container:

1. **`translateY` supports fractional pixels** - the browser anti-aliases them
2. **GPU-accelerated** with `willChange: 'transform'` - offloaded to compositor
3. **Sub-pixel precision** - 0.01px increments render smoothly

```javascript
// This renders at true sub-pixel precision
content.style.transform = `translateY(${-offset}px)`; // 0.5px works!
```

---

## Implementation Pattern

### 1. Setup

```javascript
let transformOffset = 0;      // Accumulates sub-pixel scroll position
let startScrollTop = 0;       // Native scroll position when started

function start() {
  const container = document.querySelector('.scroll-container');
  const content = container.querySelector('.content');

  // Store starting position
  startScrollTop = container.scrollTop;
  transformOffset = 0;

  // Enable GPU compositing
  content.style.willChange = 'transform';

  requestAnimationFrame(tick);
}
```

### 2. Animation Loop

```javascript
const SCROLL_SPEED = 0.01; // px/ms (~10 px/second)

function tick(timestamp) {
  // Calculate delta time
  const deltaMs = timestamp - lastFrameTime;
  lastFrameTime = timestamp;

  // Accumulate sub-pixel offset
  transformOffset += SCROLL_SPEED * deltaMs;

  // Apply transform (GPU-accelerated, sub-pixel smooth)
  content.style.transform = `translateY(${-transformOffset}px)`;

  requestAnimationFrame(tick);
}
```

### 3. Sync Back to Native Scroll on Stop

Critical step: when stopping, convert the transform back to native scroll position so normal scrolling behavior works:

```javascript
function stop() {
  const container = document.querySelector('.scroll-container');
  const content = container.querySelector('.content');

  // Set final scroll position (native scroll takes over)
  container.scrollTop = startScrollTop + transformOffset;

  // Remove transform
  content.style.transform = '';
  content.style.willChange = '';

  transformOffset = 0;
}
```

---

## Why This Works

| Property | `scrollTop` | `translateY` |
|----------|-------------|--------------|
| Precision | Integer pixels only | Sub-pixel (fractional) |
| Rendering | Layout recalculation | GPU compositor |
| Anti-aliasing | None (snaps to pixels) | Browser smooths edges |
| Performance | Reflows on change | Offloaded to GPU |

The browser's compositor can render fractional pixel positions by anti-aliasing the content edges, creating the illusion of smooth sub-pixel movement.

---

## Complete Example (Svelte 5 Runes)

```typescript
export function createAutoScroll(container: HTMLElement, content: HTMLElement) {
  let isActive = $state(false);
  let transformOffset = 0;
  let startScrollTop = 0;
  let lastFrameTime: number | null = null;
  let animationFrameId: number | null = null;

  const SCROLL_SPEED = 0.01; // px/ms

  function start() {
    startScrollTop = container.scrollTop;
    transformOffset = 0;
    content.style.willChange = 'transform';
    isActive = true;
    lastFrameTime = null;
    animationFrameId = requestAnimationFrame(tick);
  }

  function tick(timestamp: DOMHighResTimeStamp) {
    if (!isActive) return;

    if (lastFrameTime === null) lastFrameTime = timestamp;
    const deltaMs = timestamp - lastFrameTime;
    lastFrameTime = timestamp;

    // Check if reached bottom
    const maxScroll = container.scrollHeight - container.clientHeight;
    if (startScrollTop + transformOffset >= maxScroll - 1) {
      stop();
      return;
    }

    // Sub-pixel scroll
    transformOffset += SCROLL_SPEED * deltaMs;
    content.style.transform = `translateY(${-transformOffset}px)`;

    animationFrameId = requestAnimationFrame(tick);
  }

  function stop() {
    isActive = false;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    // Sync back to native scroll
    container.scrollTop = startScrollTop + transformOffset;
    content.style.transform = '';
    content.style.willChange = '';
    transformOffset = 0;
  }

  return {
    get isActive() { return isActive; },
    start,
    stop,
    toggle: () => isActive ? stop() : start()
  };
}
```

---

## Key Takeaways

1. **Use `translateY` for slow, continuous scrolling** - native scroll is fine for fast/user-initiated scroll
2. **Always set `willChange: 'transform'`** before animating - enables GPU layer
3. **Sync back to native scroll on stop** - otherwise normal scroll behavior breaks
4. **Use `requestAnimationFrame` with delta time** - frame-rate independent animation

---

## When to Use This

- Auto-scroll / e-reader mode at slow speeds
- Smooth parallax effects
- Any animation requiring sub-pixel precision
- Kinetic/momentum scrolling implementations

## When NOT to Use This

- Normal user-initiated scrolling (native is better)
- Fast scroll speeds where 1px jumps aren't visible
- When you need scroll events to fire (transforms don't trigger them)
