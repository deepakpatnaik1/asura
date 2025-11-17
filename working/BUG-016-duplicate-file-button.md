# BUG-016: Duplicate File Button Appears After File Selection

## Status
- **Discovered**: 2025-11-12 (Test 5)
- **Severity**: MEDIUM (UX issue, not functional blocker)
- **Status**: 🔍 INVESTIGATING

## Description
After selecting a file via the paperclip button, a duplicate file list button appears with a badge showing the file count. This creates visual confusion as there are now two folder icons in the input controls bar.

## Reproduction Steps
1. Open application at http://localhost:5173
2. Click paperclip button (button 1 - file selector)
3. Select a file from native macOS picker
4. Observe input controls bar

## Expected Behavior
- Input controls bar should maintain consistent UI
- File list button should either:
  - Replace an existing static button, OR
  - Be the ONLY folder button, OR
  - Use a different visual treatment to avoid duplication

## Actual Behavior
- TWO folder icons appear in the input controls:
  1. **Dynamic file list button** (lines 372-381 in +page.svelte) - appears when `$files.length > 0`, has badge with count
  2. **Static "Browse folder" button** (line 384 in +page.svelte) - always present, same `LuFolder` icon
- This creates visual duplication and confusion

## Evidence

### Code Analysis

**File**: `src/routes/+page.svelte`

**Lines 372-381** - Conditional file list button:
```svelte
<!-- File list toggle button (show file count) -->
{#if $files.length > 0}
  <button
    class="control-btn file-list-btn"
    title={`Files (${$files.length})`}
    onclick={() => (showFileList = !showFileList)}
  >
    <Icon src={LuFolder} size="11" />
    <span class="file-count">{$files.length}</span>
  </button>
{/if}
```

**Line 384** - Static folder button:
```svelte
<button class="control-btn" title="Browse folder"><Icon src={LuFolder} size="11" /></button>
```

**Problem**: Both use `LuFolder` icon, both appear simultaneously after file upload.

## User Impact
- **Visual confusion**: Two identical folder icons side-by-side
- **Unclear purpose**: User doesn't know which button to click
- **Inconsistent UI**: Button bar layout changes dynamically
- **Not a blocker**: File operations still work, just poor UX

## Root Cause
The conditional file list button (`{#if $files.length > 0}`) was added without removing or replacing the static "Browse folder" button. Both render simultaneously when files exist.

## Proposed Solutions

### Option 1: Replace Static Button (Recommended)
Remove the static "Browse folder" button (line 384). The dynamic file list button serves the same purpose and provides more information (file count badge).

### Option 2: Different Icons
Use a different icon for one of the buttons to distinguish them visually:
- File list button: Keep `LuFolder` (represents uploaded files)
- Browse folder button: Change to `LuFolderOpen` or remove entirely

### Option 3: Merge Functionality
Combine both buttons into a single smart button:
- When `$files.length === 0`: Show "Browse folder" without badge
- When `$files.length > 0`: Show file count badge and toggle list

## Related Files
- `src/routes/+page.svelte` (lines 372-381, 384) - Button rendering
- `src/lib/stores/filesStore.ts` - Files store that triggers conditional rendering

## Related Bugs
- **BUG-017**: File stuck at 0% (discovered same test)
- **BUG-015**: Auth blocking (fixed - enabled file uploads to work)

## Next Steps
1. Decide on solution approach (recommend Option 1: remove static button)
2. Test that removing static button doesn't break any functionality
3. Verify button bar layout looks correct with/without files
4. Consider if "Browse folder" had any special purpose vs file list
