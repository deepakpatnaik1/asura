# E-READER UI SHELL BACKUP
**Date:** 2025-11-23
**Branch:** e-reader-megafeature
**Purpose:** Complete backup of e-reader UI shell before branch deletion

This document preserves all UI shell code for potential future re-implementation. The shell provides:
- Mode switching infrastructure (chat/reader toggle)
- Sidebar with mode selector buttons
- Article pane structure (collapsible library sidebar)
- Mode-aware input area styling
- Accent color system (orange for chat, green for reader)
- FOUC (Flash of Unstyled Content) prevention

---

## 1. MODE SWITCHING INFRASTRUCTURE

### File: `src/routes/+page.svelte` (Lines 12-45)

```svelte
// Mode state: 'chat' or 'reader'
type AppMode = 'chat' | 'reader';

// Storage key
const STORAGE_KEY_MODE = 'asura_app_mode';

// Helper: Get initial mode from localStorage (runs before component init)
function getInitialMode(): AppMode {
	if (typeof window === 'undefined') return 'chat'; // SSR default
	const saved = localStorage.getItem(STORAGE_KEY_MODE);
	console.log('[Mode Init] localStorage value:', saved);
	if (saved === 'chat' || saved === 'reader') {
		console.log('[Mode Init] Restoring mode:', saved);
		return saved;
	}
	console.log('[Mode Init] Defaulting to chat');
	return 'chat';
}

// Initialize mode from localStorage (no FOUC)
let currentMode = $state<AppMode>(getInitialMode());

// Hydration flag to prevent FOUC
let mounted = $state(false);

// Save mode to localStorage when changed
function setMode(mode: AppMode) {
	console.log('[Mode] Switching to:', mode);
	currentMode = mode;
	if (typeof window !== 'undefined') {
		localStorage.setItem(STORAGE_KEY_MODE, mode);
		console.log('[Mode] Saved to localStorage:', mode);
	}
}
```

### FOUC Prevention Setup

```svelte
// In onMount (around line 294)
onMount(async () => {
	// ... other initialization code ...

	// Trigger mounted state for CSS transition (prevents FOUC)
	await tick();
	mounted = true;
	console.log('[Mount] Component mounted, FOUC prevention active');
});
```

---

## 2. SIDEBAR MODE SELECTOR

### File: `src/routes/+page.svelte` (Lines 923-940)

```svelte
<!-- Sidebar -->
<aside class="sidebar">
	<!-- Chat Mode Icon -->
	<button
		class="sidebar-icon"
		onclick={() => setMode('chat')}
		class:active={currentMode === 'chat'}
		title="Chat Mode"
	>
		<Icon src={LuMessageSquare} size="24" />
	</button>

	<!-- E-Reader Mode Icon -->
	<button
		class="sidebar-icon"
		onclick={() => setMode('reader')}
		class:active={currentMode === 'reader'}
		title="E-Reader Mode"
	>
		<Icon src={LuBook} size="24" />
	</button>
</aside>
```

### CSS (from `+page.svelte` style block, Lines 1356-1368)

```css
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
}

.sidebar-icon:hover {
	background: hsl(var(--accent));
	border-color: hsl(var(--accent-foreground));
}

/* Active state - dynamically sets accent based on which icon */
.sidebar-icon.active:nth-child(1) {
	/* Chat mode (first button) */
	border-color: var(--boss-accent);
	color: var(--boss-accent);
	background: var(--boss-bg);
}

.sidebar-icon.active:nth-child(2) {
	/* Reader mode (second button) */
	border-color: var(--reader-accent);
	color: var(--reader-accent);
	background: var(--reader-bg);
}
```

---

## 3. ARTICLE PANE (LIBRARY SIDEBAR)

### File: `src/routes/+page.svelte` (Lines 943-996)

```svelte
<!-- Article Pane (Library) - Appears in reader mode -->
{#if currentMode === 'reader'}
	<aside class="article-pane" class:collapsed={isArticlePaneCollapsed}>
		<!-- Header with collapse toggle -->
		<div class="article-pane-header">
			<button
				class="collapse-toggle"
				onclick={() => isArticlePaneCollapsed = !isArticlePaneCollapsed}
				title={isArticlePaneCollapsed ? 'Expand' : 'Collapse'}
			>
				<Icon src={LuChevronDown} size="20" class={isArticlePaneCollapsed ? 'rotate-left' : ''} />
			</button>
			{#if !isArticlePaneCollapsed}
				<span class="pane-title">Library</span>
			{/if}
		</div>

		<!-- Article list -->
		{#if !isArticlePaneCollapsed}
			<div class="article-list">
				<!-- This is where article cards would render -->
				<!-- Example structure:
				{#each notes as note}
					<div class="article-card" class:selected={selectedNoteId === note.id}>
						<div class="article-title">{note.title}</div>
						<div class="article-preview">{note.preview_snippet}</div>
					</div>
				{/each}
				-->
			</div>
		{/if}

		<!-- New Article button -->
		{#if !isArticlePaneCollapsed}
			<button class="new-article-btn">
				<Icon src={LuPlus} size="16" />
				<span>New Article</span>
			</button>
		{/if}
	</aside>
{/if}
```

### CSS (from `+page.svelte` style block, Lines 1369-1432)

```css
/* Article Pane (Library) */
.article-pane {
	position: fixed;
	left: 80px; /* Accounts for sidebar width + gap */
	top: 0;
	bottom: 0;
	width: 240px;
	background: hsl(var(--card));
	border-right: 1px solid hsl(var(--border));
	display: flex;
	flex-direction: column;
	transition: width 0.3s ease;
	z-index: 5;
	overflow: hidden;
}

.article-pane.collapsed {
	width: 60px;
}

.article-pane-header {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 16px;
	border-bottom: 1px solid hsl(var(--border));
}

.collapse-toggle {
	background: none;
	border: none;
	cursor: pointer;
	color: hsl(var(--foreground));
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 4px;
	border-radius: 4px;
	transition: background 0.15s ease;
}

.collapse-toggle:hover {
	background: hsl(var(--accent));
}

.collapse-toggle :global(.rotate-left) {
	transform: rotate(-90deg);
}

.pane-title {
	font-size: 14px;
	font-weight: 600;
	color: hsl(var(--foreground));
	white-space: nowrap;
}

.article-list {
	flex: 1;
	overflow-y: auto;
	padding: 8px;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.article-card {
	padding: 12px;
	border-radius: 6px;
	border: 1px solid hsl(var(--border));
	cursor: pointer;
	transition: all 0.15s ease;
	background: hsl(var(--card));
}

.article-card:hover {
	background: hsl(var(--accent));
	border-color: hsl(var(--accent-foreground));
}

.article-card.selected {
	border-color: var(--reader-accent);
	background: var(--reader-bg);
}

.article-title {
	font-size: 13px;
	font-weight: 600;
	color: hsl(var(--foreground));
	margin-bottom: 4px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.article-preview {
	font-size: 12px;
	color: hsl(var(--muted-foreground));
	overflow: hidden;
	text-overflow: ellipsis;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
}

.new-article-btn {
	margin: 8px;
	padding: 10px 16px;
	border-radius: 6px;
	border: 1px solid var(--reader-accent);
	background: var(--reader-bg);
	color: var(--reader-accent);
	font-size: 13px;
	font-weight: 600;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	cursor: pointer;
	transition: all 0.15s ease;
}

.new-article-btn:hover {
	background: var(--reader-accent);
	color: white;
}
```

---

## 4. INPUT AREA MODE SWITCHING

### File: `src/routes/+page.svelte` (Lines 1143-1228)

```svelte
<!-- Input area -->
<div class="input-area" data-mode={currentMode}>
	<form
		onsubmit={(e) => {
			e.preventDefault();
			// Route to appropriate handler based on mode
			if (currentMode === 'chat') {
				handleSend();
			} else {
				// E-reader mode logic would go here
				console.log('[Reader] Submit logic goes here');
			}
		}}
	>
		<div class="input-container">
			<textarea
				bind:value={inputMessage}
				onkeydown={handleKeyDown}
				placeholder={currentMode === 'chat'
					? 'Message Asura...'
					: 'Paste article content or ask a question...'}
				rows="1"
				class="message-input"
				disabled={$isLoading}
			></textarea>
			<button
				type="submit"
				class="send-button"
				disabled={$isLoading || !inputMessage.trim()}
			>
				Send
			</button>
		</div>
	</form>
</div>
```

### CSS (from `+page.svelte` style block, Lines 1783-1935)

```css
/* Input Area */
.input-area {
	position: fixed;
	bottom: 0;
	left: 0;
	right: 0;
	background: hsl(var(--card));
	border-top: 1px solid hsl(var(--border));
	padding: 16px;
	display: flex;
	flex-direction: column;
	align-items: center;
	z-index: 100;
}

.input-area form {
	width: 100%;
	max-width: var(--content-text-width);
}

.input-container {
	display: flex;
	gap: 8px;
	width: 100%;
	align-items: flex-end;
}

.message-input {
	flex: 1;
	padding: 12px 16px;
	border-radius: 8px;
	border: 1px solid hsl(var(--border));
	background: hsl(var(--background));
	color: hsl(var(--foreground));
	font-size: 14px;
	font-family: inherit;
	resize: none;
	max-height: 200px;
	overflow-y: auto;
	line-height: 1.4;
	outline: none;
	transition: border-color 0.15s ease;
}

.message-input:focus {
	border-color: hsl(var(--ring));
}

.message-input:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.send-button {
	padding: 12px 24px;
	border-radius: 8px;
	background: transparent;
	font-size: 14px;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.15s ease;
	white-space: nowrap;
	flex-shrink: 0;
	height: fit-content;
}

/* Chat mode styling (default) */
.input-area[data-mode="chat"] .send-button {
	border: 1px solid var(--boss-accent);
	color: var(--boss-accent);
}

.input-area[data-mode="chat"] .send-button:hover:not(:disabled) {
	background: var(--boss-accent);
	color: white;
}

/* Reader mode styling */
.input-area[data-mode="reader"] .send-button {
	border: 1px solid var(--reader-accent);
	color: var(--reader-accent);
}

.input-area[data-mode="reader"] .send-button:hover:not(:disabled) {
	background: var(--reader-accent);
	color: white;
}

.send-button:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}
```

---

## 5. ACCENT COLOR SYSTEM

### File: `src/app.css` (Lines 36-46)

```css
/* Boss message specific (Chat Mode) */
/* Source: src/lib/config/colors.ts - CHAT_ACCENT, CHAT_ACCENT_BG */
--boss-bg: rgba(217, 133, 107, 0.08);
--boss-accent: rgb(217, 133, 107);

/* E-Reader accent (applied when in reader mode) */
/* Source: src/lib/config/colors.ts - READER_ACCENT, READER_ACCENT_BG */
--reader-bg: rgba(16, 185, 129, 0.08);
--reader-accent: rgb(16, 185, 129);
--reader-accent-bg: rgba(16, 185, 129, 0.08); /* For progress pane active state */
```

### File: `src/lib/config/colors.ts` (Complete file)

```typescript
/**
 * Centralized color definitions for Asura
 *
 * These colors are the source of truth for accent colors across modes.
 * CSS variables in app.css should match these values.
 */

// Chat mode (warm orange)
export const CHAT_ACCENT = 'rgb(217, 133, 107)';
export const CHAT_ACCENT_BG = 'rgba(217, 133, 107, 0.08)';

// Reader mode (emerald green)
export const READER_ACCENT = 'rgb(16, 185, 129)';
export const READER_ACCENT_BG = 'rgba(16, 185, 129, 0.08)';

// Shared colors
export const DIVIDER_COLOR = 'rgb(156, 163, 175)';

/**
 * Get accent color based on mode
 */
export function getAccentColor(mode: 'chat' | 'reader'): string {
	return mode === 'chat' ? CHAT_ACCENT : READER_ACCENT;
}

/**
 * Get accent background color based on mode
 */
export function getAccentBgColor(mode: 'chat' | 'reader'): string {
	return mode === 'chat' ? CHAT_ACCENT_BG : READER_ACCENT_BG;
}
```

### Mode-Aware CSS Examples

```css
/* Boss message background switches based on mode */
.boss-message[data-mode="chat"] {
	background: var(--boss-bg);
	border-left: 3px solid var(--boss-accent);
}

.boss-message[data-mode="reader"] {
	background: var(--reader-bg);
	border-left: 3px solid var(--reader-accent);
}

/* Boss label color switches based on mode */
.boss-label[data-mode="chat"] {
	color: var(--boss-accent);
}

.boss-label[data-mode="reader"] {
	color: var(--reader-accent);
}
```

---

## 6. FOUC PREVENTION SYSTEM

### File: `src/routes/+page.svelte` (Lines 32-36, 922)

```svelte
// Initialize mode from localStorage (no FOUC)
let currentMode = $state<AppMode>(getInitialMode());

// Hydration flag to prevent FOUC
let mounted = $state(false);

// In onMount:
onMount(async () => {
	// ... other initialization ...
	await tick();
	mounted = true;
	console.log('[Mount] Component mounted, FOUC prevention active');
});

// In template:
<div class="app-layout" class:mounted={mounted}>
	<!-- All content here -->
</div>
```

### CSS (from `+page.svelte` style block)

```css
/* FOUC Prevention */
.app-layout {
	opacity: 0;
	transition: opacity 0.15s ease;
}

.app-layout.mounted {
	opacity: 1;
}
```

---

## 7. CONTENT AREA READER DISPLAY STRUCTURE

### File: `src/routes/+page.svelte` (Lines 1082-1138)

```svelte
<!-- Content area for reader mode -->
{#if currentMode === 'reader'}
	<div class="messages-area">
		<div class="messages-content">
			<!-- Reader mode content would render here -->
			<!-- Example structure:

			{#if selectedNote()}
				<!-- Boss card: "Let's explore" message -->
				<div class="message-group" data-role="boss">
					<div class="boss-message" data-mode="reader">
						<div class="message-header">
							<span class="boss-label" data-mode="reader">BOSS</span>
						</div>
						<div class="message-text">
							Let's explore: {selectedNote().title}
						</div>
					</div>
				</div>

				<!-- Gunnar card: Article content -->
				<div class="message-group" data-role="gunnar">
					<div class="gunnar-message">
						<div class="message-header">
							<span class="gunnar-label">GUNNAR</span>
						</div>
						<div class="message-text">
							{@html renderMarkdown(selectedNote().transformed_content, 'reader')}
						</div>
					</div>
				</div>

				<!-- Q&A history would render here -->
			{/if}
			-->
		</div>
	</div>
{/if}
```

---

## 8. RELATED UI COMPONENTS

### File: `src/lib/components/LoadingSpinner.svelte`

```svelte
<script lang="ts">
	// Mode-aware spinner colors
	let { mode = 'chat' }: { mode?: 'chat' | 'reader' } = $props();
</script>

<div class="spinner-container">
	<div class="spinner" data-mode={mode}></div>
</div>

<style>
	.spinner-container {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
	}

	.spinner {
		width: 24px;
		height: 24px;
		border: 3px solid rgba(255, 255, 255, 0.1);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.spinner[data-mode="chat"] {
		border-top-color: var(--boss-accent);
	}

	.spinner[data-mode="reader"] {
		border-top-color: var(--reader-accent);
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
```

---

## 9. LAYOUT ADJUSTMENTS FOR READER MODE

### File: `src/routes/+page.svelte` (Layout structure)

```svelte
<div class="app-layout" class:mounted={mounted}>
	<!-- Sidebar (always visible) -->
	<aside class="sidebar">...</aside>

	<!-- Article Pane (reader mode only) -->
	{#if currentMode === 'reader'}
		<aside class="article-pane">...</aside>
	{/if}

	<!-- Main content area -->
	<div class="chat-container" data-mode={currentMode}>
		<!-- Adjust left margin when article pane is visible -->
		{#if currentMode === 'chat'}
			<!-- Chat mode content -->
		{:else}
			<!-- Reader mode content -->
		{/if}
	</div>

	<!-- Input area (always visible, mode-aware styling) -->
	<div class="input-area" data-mode={currentMode}>...</div>
</div>
```

### CSS Layout Adjustments

```css
/* Main content container adjusts for article pane */
.chat-container[data-mode="reader"] {
	margin-left: 340px; /* Sidebar (80px) + Article pane (240px) + gap (20px) */
}

.chat-container[data-mode="chat"] {
	margin-left: 0; /* Centered layout */
}

/* Responsive: collapse article pane on narrow screens */
@media (max-width: 900px) {
	.article-pane {
		display: none; /* Hide on mobile */
	}

	.chat-container[data-mode="reader"] {
		margin-left: 0; /* Reset margin */
	}
}
```

---

## 10. KEY IMPORTS AND DEPENDENCIES

### File: `src/routes/+page.svelte` (Top imports)

```svelte
<script lang="ts">
	import { Icon } from 'svelte-icons-pack';
	import {
		LuMessageSquare,  // Chat mode icon
		LuBook,          // Reader mode icon
		LuPlus,          // New article button
		LuChevronDown    // Collapse toggle
	} from 'svelte-icons-pack/lu';
	import { tick, onMount } from 'svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { renderMarkdown } from '$lib/markdown-renderer';
</script>
```

---

## 11. IMPLEMENTATION NOTES

### Mode Persistence Strategy
- Uses `localStorage` with key `'asura_app_mode'`
- `getInitialMode()` runs before component init (SSR-safe)
- Mode read synchronously on first render (no FOUC)
- `setMode()` saves to localStorage immediately

### FOUC Prevention Strategy
1. Read mode from localStorage synchronously
2. Set `mounted = false` initially
3. Apply `opacity: 0` to `.app-layout`
4. After `onMount()` + `tick()`, set `mounted = true`
5. CSS transition fades in content smoothly

### Accent Color Switching
- CSS variables (`--boss-accent`, `--reader-accent`) defined in `app.css`
- TypeScript constants in `src/lib/config/colors.ts` (source of truth)
- Components use `data-mode` attribute for CSS targeting
- `renderMarkdown()` helper accepts mode parameter

### Responsive Behavior
- Article pane hidden on screens ≤900px width
- Content area margin resets on mobile
- Sidebar remains visible (fixed position)
- Input area stays full-width

---

## 12. FUTURE IMPLEMENTATION CHECKLIST

When re-implementing e-reader mode, you'll need:

### Backend
- [ ] Article transformation API endpoint (`POST /api/reader/transform`)
- [ ] Article CRUD endpoints (create, read, update, delete)
- [ ] Q&A endpoint (`POST /api/reader/chat`)
- [ ] Database tables (`notes`, `reader_superjournal`, etc.)

### State Management
- [ ] `notes` array state (list of articles)
- [ ] `selectedNoteId` state (currently active article)
- [ ] `isLoadingNotes` state (loading indicator)

### Functions
- [ ] `loadNotes()` - Fetch articles from database
- [ ] `handleArticleSubmit()` - Transform new article
- [ ] `handleNoteClick()` - Load article content
- [ ] `handleNoteDelete()` - Delete article
- [ ] `handleReaderSubmit()` - Submit Q&A question
- [ ] `handleNewArticle()` - Create new draft

### UI Components
- [ ] Article cards in article pane
- [ ] Article content display
- [ ] Q&A conversation history
- [ ] Loading states (spinners)
- [ ] Error handling UI

### Integration
- [ ] Connect sidebar buttons to mode switching
- [ ] Connect input area to article submission
- [ ] Connect article pane to article selection
- [ ] Connect content area to article display

---

## RESTORATION INSTRUCTIONS

To restore the e-reader UI shell to a future branch:

1. **Copy mode switching code** (Section 1) into `src/routes/+page.svelte`
2. **Copy sidebar HTML** (Section 2) into template
3. **Copy article pane HTML** (Section 3) into template (inside `{#if currentMode === 'reader'}`)
4. **Copy input area mode logic** (Section 4) - add `data-mode={currentMode}` attribute
5. **Ensure CSS variables exist** (Section 5) in `src/app.css`
6. **Copy FOUC prevention** (Section 6) - `mounted` state + CSS transition
7. **Import required icons** (Section 10) from `svelte-icons-pack/lu`
8. **Copy color config** (Section 5) to `src/lib/config/colors.ts`
9. **Test mode switching** - Click sidebar buttons, verify localStorage persistence
10. **Test FOUC prevention** - Hard refresh page, verify no flash

**Result:** Empty but functional UI shell with:
- Working mode switching
- Persistent mode selection (survives refresh)
- Visual theming (orange/green)
- Collapsible article pane
- Mode-aware input area

---

**END OF BACKUP**
