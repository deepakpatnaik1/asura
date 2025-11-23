# Mode Refactor - Nested Routes Architecture

## Problem

`+page.svelte` is a monolithic mess mixing chat mode + reader mode logic/UI. Adding new modes is impossible.

## What's Solid vs What's Broken

**What's solid:**
- ✅ UI is pixel perfect (CSS, layouts, styling)
- ✅ Supabase setup (schema, RLS, auth)
- ✅ API keys, environment config
- ✅ Working utilities (markdown renderer, colors, LoadingSpinner)
- ✅ Database design

**What's broken:**
- ❌ Application logic (monolithic +page.svelte)
- ❌ Mode switching (state coupling)
- ❌ Handler functions (mixed concerns)
- ❌ Control flow (confusing conditionals)

**Conclusion:** Don't rebuild everything. Just restructure the application logic.

## Solution: Nested Routes

```
src/routes/
├── +layout.svelte          # Shared: sidebar, mode switcher
├── chat/
│   └── +page.svelte        # Chat mode only
├── reader/
│   └── +page.svelte        # Reader mode only
└── [future-mode]/
    └── +page.svelte        # Easy to add
```

## Benefits

- Clean separation - each mode isolated in its own file
- URL shows mode: `/chat`, `/reader`
- Back/forward buttons work
- Direct linking works
- Easy to add new modes (just add a route)
- No more God component

## Migration Plan

1. Create `+layout.svelte` - move sidebar from `+page.svelte`
2. Create `chat/+page.svelte` - move chat logic from `+page.svelte`
3. Create `reader/+page.svelte` - move reader logic from `+page.svelte`
4. Delete old `+page.svelte`
5. Update navigation to use routes instead of mode state

## Routing

- Sidebar buttons navigate: `goto('/chat')`, `goto('/reader')`
- No mode state needed - current route IS the mode
- Root `/` redirects to `/chat` (or last used mode via localStorage)
