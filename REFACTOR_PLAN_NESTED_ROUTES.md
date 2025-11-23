# CHUNKED REFACTORING PLAN: Monolithic → Nested Routes

## Overview
We'll refactor in **5 safe chunks**, testing after each one. Each chunk is reversible if something breaks.

**Key Decisions:**
- ✅ Settings modal moves to layout (accessible from all routes)
- ✅ Mode-specific sidebar colors (orange for chat, green for reader)
- ✅ localStorage persistence (mode survives browser refresh)
- ✅ Desktop-only (no mobile responsive concerns)

---

## CHUNK 1: Prepare Shared Layout (Sidebar + Logout + Settings)
**Goal:** Extract sidebar, logout, and settings to `+layout.svelte` while keeping current `/` route working

**Steps:**
1. Update `+layout.svelte` to add:
   - Sidebar with chat/reader icons (as `<a>` links to `/chat`, `/reader`)
   - Top-right logout button
   - Settings button (bottom-right)
   - SettingsModal component (moved from +page.svelte)
   - `handleLogout()` function (moved from +page.svelte)
   - `showSettings` state and handlers
   - Wrapper div with proper styling
2. Update `+page.svelte`:
   - Remove `handleLogout()` function
   - Remove SettingsModal component and related imports
   - Remove `showSettings` state
   - Keep logout/settings buttons in template temporarily (will show duplicates - that's OK)
   - Keep everything else unchanged

**Test:**
- `/` still works
- Can see sidebar with two icons
- Both logout buttons work (one in layout, one in page - temporarily duplicate)
- Clicking sidebar icons navigates (will 404 for now - that's expected)

**Rollback:** `git restore src/routes/+layout.svelte src/routes/+page.svelte`

---

## CHUNK 2: Create Chat Route (Copy Everything)
**Goal:** Create `/chat` route as exact copy of current `/`

**Steps:**
1. Create directory: `src/routes/chat/`
2. Copy `+page.svelte` → `chat/+page.svelte` (full copy)
3. Copy `+page.server.ts` → `chat/+page.server.ts` (full copy)
4. **Don't modify anything yet** - just copy files

**Test:**
- `/` still works (original)
- `/chat` works identically (duplicate)
- Both routes show messages, input works, send works
- Both have duplicate logout buttons (from layout + page)

**Rollback:** `rm -rf src/routes/chat/`

---

## CHUNK 3: Clean Up Chat Route (Remove Layout Elements)
**Goal:** Remove duplicated layout elements from `chat/+page.svelte`

**Steps:**
1. In `chat/+page.svelte`, remove:
   - Top-right `.user-controls` logout button (lines ~716-719)
   - Inline `.user-controls-inline` logout button (lines in input area)
   - Fixed settings button (`.settings-btn-fixed`, lines ~737-739)
   - SettingsModal component (already moved to layout)
   - `handleLogout()` function (lines ~526-543)
   - `showSettings` state (already moved to layout)
2. Add localStorage persistence in `onMount`:
   - Add `localStorage.setItem('asura_app_mode', 'chat')` to existing onMount
3. Keep everything else (chat logic, input, messages, modals)
4. Update imports - remove `LuLogOut`, `LuSettings`, `SettingsModal`

**Test:**
- `/chat` works
- Only ONE logout button (from layout, top-right)
- Only ONE settings button (from layout, bottom-right)
- Input, send, messages all work
- `/` still works (original unchanged)

**Rollback:** `git restore src/routes/chat/+page.svelte`

---

## CHUNK 4: Create Root Redirect
**Goal:** Make `/` redirect to `/chat`

**Steps:**
1. **Backup current `+page.svelte`**: `cp src/routes/+page.svelte src/routes/+page.svelte.backup`
2. Replace `src/routes/+page.svelte` with redirect logic:
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  onMount(() => {
    // Redirect to chat (or last used mode from localStorage)
    const lastMode = typeof window !== 'undefined'
      ? localStorage.getItem('asura_app_mode') || 'chat'
      : 'chat';
    goto(`/${lastMode}`, { replaceState: true });
  });
</script>

<div style="display: flex; align-items: center; justify-content: center; height: 100vh;">
  <p>Loading...</p>
</div>
```
3. Simplify `src/routes/+page.server.ts` to just auth check (remove message loading):
```typescript
export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
  const { session } = await safeGetSession();
  if (!session) throw redirect(303, '/login');
  return {};
};
```

**Test:**
- Navigate to `/` → should auto-redirect to `/chat`
- `/chat` works normally
- Browser back button works
- Direct link to `/chat` works

**Rollback:**
```bash
mv src/routes/+page.svelte.backup src/routes/+page.svelte
git restore src/routes/+page.server.ts
```

---

## CHUNK 5: Add Reader Placeholder + Final Cleanup
**Goal:** Add `/reader` placeholder and clean up duplicates

**Steps:**
1. Create directory: `src/routes/reader/`
2. Create `reader/+page.svelte` (with localStorage persistence):
```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  // Persist mode to localStorage
  onMount(() => {
    localStorage.setItem('asura_app_mode', 'reader');
  });
</script>

<div class="reader-container">
  <div class="reader-content">
    <h1>E-Reader Mode</h1>
    <p>Coming soon... The UI shell has been backed up and will be re-implemented.</p>
    <p>See <code>E_READER_UI_SHELL_BACKUP.md</code> for details.</p>
  </div>
</div>

<style>
  .reader-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    padding: 24px;
  }

  .reader-content {
    max-width: 600px;
    text-align: center;
  }

  h1 {
    color: var(--reader-accent);
    margin-bottom: 16px;
  }

  code {
    background: hsl(var(--card));
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 14px;
  }
</style>
```
3. Create `reader/+page.server.ts`:
```typescript
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
  const { session } = await safeGetSession();
  if (!session) throw redirect(303, '/login');
  return {};
};
```
4. Delete backup file: `rm src/routes/+page.svelte.backup` (if exists)
5. Update sidebar active state in `+layout.svelte` to use `$page.url.pathname`

**Test:**
- `/` redirects to `/chat`
- `/chat` works fully (messages, send, nuke, etc.)
- `/reader` shows placeholder
- Sidebar icons highlight correctly on each route
- Clicking sidebar icons navigates between modes
- Browser back/forward works
- Responsive layout works on both routes

**Rollback:** `rm -rf src/routes/reader/`

---

## TESTING MATRIX (After All Chunks)

| Feature | `/chat` | `/reader` | Notes |
|---------|---------|-----------|-------|
| Shows content | ✅ | ✅ Placeholder | |
| Sidebar visible | ✅ | ✅ | Shared layout |
| Logout button | ✅ | ✅ | Shared layout |
| Settings button | ✅ | ✅ | Shared layout |
| Active route highlight | ✅ | ✅ | Sidebar icons |
| Send message | ✅ | N/A | Chat-specific |
| Auto-scroll | ✅ | N/A | Chat-specific |
| Nuke button | ✅ | N/A | Chat-specific |
| Browser back/forward | ✅ | ✅ | URL-based routing |
| Direct linking | ✅ | ✅ | URL-based routing |
| Responsive (<900px) | ✅ | ✅ | Test both |

---

## DECISION POINTS

### 1. Settings Modal Location
**Options:**
- A) Keep in `chat/+page.svelte` (chat-specific settings)
- B) Move to `+layout.svelte` (shared settings)

**Decision:** **B** - Move to layout. Settings should be accessible from any route (/chat, /reader, future modes). Makes settings mode-aware as needed.

### 2. Sidebar Active State Colors
**Options:**
- A) Mode-specific colors (orange for chat, green for reader)
- B) Single accent color (orange for both)

**Decision:** **A** - Use mode-specific colors. Chat icon uses `--boss-accent` (orange), reader icon uses `--reader-accent` (green).

### 3. Mode Persistence
**Options:**
- A) Don't persist mode (always default to chat on refresh)
- B) Persist mode via localStorage (restore last mode on refresh)

**Decision:** **B** - Each route saves its mode to localStorage on mount. Root redirect reads localStorage to restore last used mode. User stays in their current mode after browser refresh.

---

## RISKS & MITIGATIONS

| Risk | Impact | Mitigation |
|------|--------|------------|
| Styles leak between routes | Medium | Use route-specific class prefixes (`.chat-*`, `.reader-*`) |
| Server load functions fail | High | Test each route independently, check auth flow |
| Responsive layout breaks | Medium | Test at <900px after each chunk |
| Logout breaks | High | Test after Chunk 1, verify function moved correctly |
| Settings modal state sync | Medium | Settings in layout, accessed from all routes - verify state management works |
| Auto-scroll state persists | Low | Expected - each route has own state (no cross-route persistence) |

---

## SUCCESS CRITERIA

After all 5 chunks:
- ✅ Clean separation: `/chat` and `/reader` isolated
- ✅ Shared layout: Sidebar, logout, settings in `+layout.svelte`
- ✅ URL-based routing: No mode state, URL is source of truth
- ✅ Browser integration: Back/forward, direct linking work
- ✅ All chat features work: Send, delete, nuke, auto-scroll, turn navigation
- ✅ Extensible: Adding new modes is trivial (just add route)
- ✅ No regressions: Everything that worked before still works

---

## ESTIMATED TIME

- Chunk 1: ~15 minutes
- Chunk 2: ~5 minutes (copy files)
- Chunk 3: ~10 minutes (cleanup)
- Chunk 4: ~10 minutes (redirect logic)
- Chunk 5: ~10 minutes (placeholder + final test)

**Total: ~50 minutes** (assuming no issues)

---

## FINAL STRUCTURE

```
src/routes/
├── +layout.svelte          # Sidebar, logout, settings button
├── +layout.server.ts       # Auth check only
├── +page.svelte            # Redirect to /chat or last mode
├── +page.server.ts         # Minimal (just redirect logic)
├── chat/
│   ├── +page.svelte        # All current +page.svelte logic (minus layout elements)
│   └── +page.server.ts     # Load superjournal messages
├── reader/
│   ├── +page.svelte        # Placeholder (future implementation)
│   └── +page.server.ts     # Load notes/articles (future)
├── api/                    # Unchanged
├── auth/                   # Unchanged
└── login/                  # Unchanged
```

---

## IMPLEMENTATION NOTES

### Chunk 1 Details: Layout Structure

**New `+layout.svelte` additions:**

```svelte
<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { Icon } from 'svelte-icons-pack';
  import { LuMessageSquare, LuBook, LuLogOut, LuSettings } from 'svelte-icons-pack/lu';
  import SettingsModal from '$lib/components/SettingsModal.svelte';

  let { children } = $props();
  let showSettings = $state(false);

  // Logout handler (moved from +page.svelte)
  async function handleLogout() {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (response.ok) {
        window.location.href = '/login';
      }
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }

  onMount(() => {
    // Icon library initialization
  });
</script>

<div class="app-layout">
  <!-- Sidebar -->
  <aside class="sidebar">
    <a href="/chat" class="sidebar-icon" class:active={$page.url.pathname === '/chat'}>
      <Icon src={LuMessageSquare} size="24" />
    </a>
    <a href="/reader" class="sidebar-icon" class:active={$page.url.pathname === '/reader'}>
      <Icon src={LuBook} size="24" />
    </a>
  </aside>

  <!-- User controls (top-right, wide screens) -->
  <div class="user-controls">
    <button class="logout-btn" onclick={handleLogout}>
      <Icon src={LuLogOut} size="16" />
      <span>Logout</span>
    </button>
  </div>

  <!-- Settings button (bottom-right, wide screens) -->
  <button class="settings-btn-fixed" onclick={() => showSettings = true}>
    <Icon src={LuSettings} size="16" />
  </button>

  <!-- Main content -->
  {@render children()}

  <!-- Settings Modal (accessible from all routes) -->
  {#if showSettings}
    <SettingsModal onClose={() => showSettings = false} />
  {/if}
</div>

<style>
  /* Sidebar */
  .sidebar {
    position: fixed;
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 16px;
    z-index: 10;
  }

  .sidebar-icon {
    width: 48px;
    height: 48px;
    border-radius: 8px;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
    color: hsl(var(--foreground));
    text-decoration: none;
  }

  .sidebar-icon:hover {
    background: hsl(var(--accent));
    border-color: hsl(var(--accent-foreground));
  }

  /* Active state - mode-specific colors */
  .sidebar-icon.active:nth-child(1) {
    /* Chat mode (first icon) */
    border-color: var(--boss-accent);
    color: var(--boss-accent);
    background: var(--boss-bg);
  }

  .sidebar-icon.active:nth-child(2) {
    /* Reader mode (second icon) */
    border-color: var(--reader-accent);
    color: var(--reader-accent);
    background: var(--reader-bg);
  }

  /* User controls (top-right) */
  .user-controls {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 100;
  }

  .logout-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: 6px;
    border: 1px solid hsl(var(--border));
    background: hsl(var(--card));
    color: hsl(var(--foreground));
    font-size: 14px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .logout-btn:hover {
    background: hsl(var(--accent));
    border-color: hsl(var(--accent-foreground));
  }

  /* Settings button (bottom-right) */
  .settings-btn-fixed {
    position: fixed;
    bottom: 16px;
    right: 16px;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
    z-index: 100;
  }

  .settings-btn-fixed:hover {
    background: hsl(var(--accent));
    border-color: hsl(var(--accent-foreground));
  }
</style>
```

---

## VERIFICATION CHECKLIST

Use this checklist after each chunk:

### After Chunk 1
- [ ] Dev server running without errors
- [ ] `/` displays chat interface
- [ ] Sidebar visible with two icons (chat and reader)
- [ ] Logout button in top-right corner
- [ ] Settings button in bottom-right corner
- [ ] Settings modal opens when clicking settings button
- [ ] Both logout buttons work (one from layout, one from page - temporarily duplicate)
- [ ] Clicking sidebar icons navigates (404s expected)

### After Chunk 2
- [ ] `/` still works (original)
- [ ] `/chat` displays chat interface
- [ ] Both routes show messages from database
- [ ] Can send messages on both routes
- [ ] Both have duplicate logout/settings buttons (expected)

### After Chunk 3
- [ ] `/chat` has only ONE logout button (from layout)
- [ ] `/chat` has only ONE settings button (from layout)
- [ ] Chat input works
- [ ] Send message works
- [ ] Message actions work (star, copy, delete, archive, refresh)
- [ ] `/` still unchanged

### After Chunk 4
- [ ] Navigating to `/` auto-redirects to `/chat`
- [ ] URL bar shows `/chat` after redirect
- [ ] Chat functionality works normally
- [ ] Browser back button works
- [ ] Direct link to `/chat` works without redirect

### After Chunk 5
- [ ] `/` redirects to `/chat`
- [ ] `/chat` fully functional
- [ ] `/reader` shows placeholder page
- [ ] Sidebar highlights correct icon per route (orange for chat, green for reader)
- [ ] Clicking sidebar icons navigates between routes
- [ ] Browser back/forward buttons work
- [ ] Refresh browser on `/chat` → stays on `/chat`
- [ ] Refresh browser on `/reader` → stays on `/reader`
- [ ] Settings accessible from both `/chat` and `/reader`

---

## TROUBLESHOOTING

### Issue: Sidebar icons not highlighting
**Cause:** `$page` store not imported or not reactive
**Fix:** Verify `import { page } from '$app/stores'` in `+layout.svelte`

### Issue: 404 on `/chat` after Chunk 2
**Cause:** Dev server cache or files not detected
**Fix:**
```bash
pkill -f "vite|node.*dev"
rm -rf node_modules/.vite
npm run dev
```

### Issue: Logout button doesn't work after Chunk 1
**Cause:** `handleLogout()` function not moved correctly
**Fix:** Verify function exists in `+layout.svelte` and `onclick={handleLogout}` syntax

### Issue: Styles look broken after Chunk 3
**Cause:** CSS class names conflict or missing
**Fix:** Verify `.chat-container` class still exists in `chat/+page.svelte`

### Issue: Infinite redirect loop in Chunk 4
**Cause:** Redirect logic triggering on `/chat` route
**Fix:** Verify redirect ONLY happens in root `+page.svelte`, not in `chat/+page.svelte`

---

**Ready to execute: Start with Chunk 1?**
