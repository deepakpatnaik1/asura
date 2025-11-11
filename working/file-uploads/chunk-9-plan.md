# Chunk 9 Plan: UI Integration

## Status
Draft

---

## Overview

Integrate file upload UI components into the existing chat interface (src/routes/+page.svelte). Create a simple, elegant file management interface that matches Asura's existing design patterns and integrates seamlessly with the Chunk 8 files store.

### Key Goals
- Add file upload button with drag-and-drop support
- Display file list with status indicators and progress tracking
- Implement delete functionality with confirmation
- Real-time updates via SSE (already built in Chunk 8)
- Zero deviation from existing Asura design language

---

## Dependencies

### Chunk 8: Files Store
- **Import**: `filesStore.ts` exports
  - Stores: `files`, `processingFiles`, `readyFiles`, `failedFiles`, `error`
  - Actions: `uploadFile()`, `deleteFile()`, `refreshFiles()`
  - Utilities: `getFile()`, `getFileByName()`, `isProcessing()`
- **Subscription**: Auto-connects SSE on first subscribe, auto-disconnects on last unsubscribe
- **Error handling**: `error` store auto-clears after 5 seconds

### Existing Asura UI
- **Design System**: App.css with HSL color system
  - Boss accent: `rgb(217, 133, 107)` for highlights
  - Muted text: `hsl(var(--muted-foreground))`
  - Borders: `hsl(var(--border))`
  - Spacing: 8px action gap, 16px padding
- **Component Patterns**: src/routes/+page.svelte uses
  - Icon buttons with Lucide icons (svelte-icons-pack)
  - Transparent buttons with hover opacity transitions
  - Modal overlays with fixed positioning
  - Disabled state handling
  - Smooth scroll animations

---

## Design Decisions

### 1. Component Structure
**Single component in +page.svelte** - Keep it simple
- No separate component files needed for MVP
- File upload UI integrated directly into input-area
- File list in a dropdown/popover that appears below controls
- Reuse existing styling approach (HSL variables, transparent buttons)

**Location in +page.svelte**:
- File upload button: Add to `.input-controls` row (next to paperclip)
- File list dropdown: New section after input-area or as popover
- Keep file management UI separate from message display

### 2. Upload Interface
**File Input Handling**:
- Hidden file input element (`<input type="file" />`), no multiple attribute yet (MVP)
- Trigger via paperclip icon button (already exists in template, currently non-functional)
- Wire to `uploadFile()` from Chunk 8 store
- Accept file types: PDF, TXT, MD, PNG, JPG, GIF, WebP, JS, TS, PY, XLSX, CSV, JSON (from FR1)

**Drag-and-Drop**:
- Add drag-and-drop zone to message input area
- Show visual feedback on hover (border highlight, background change)
- Prevent default browser behavior (ondrop, ondragover)
- Accept same file types as file input

**Error Handling**:
- Invalid file types: Show error message (file type not supported)
- File size > 10MB: Show error message (file too large)
- Network errors: Display from `error` store (auto-clears)
- Duplicate files: Prevent re-upload with "File already exists" message

### 3. File List Display
**Dropdown Location & Visibility**:
- New file list dropdown below input area (fixed positioning)
- Toggle visibility with button or auto-show when files exist
- Collapse/expand with chevron icon
- Auto-hide when no files

**File Item Display**:
Each file shows:
- Filename (truncated if long)
- File type icon or badge (PDF, IMG, TXT, etc.)
- Status indicator: pending → processing → ready (or failed)
- Progress bar during processing (0-100%)
- Processing stage text (extraction, compression, embedding, finalization) - optional, show on hover
- Delete button (trash icon with confirmation modal)
- Timestamp of upload

**Visual States**:
- **Pending/Processing**: Progress bar (0-100%), stage indicator, activity animation
- **Ready**: Green checkmark, no progress bar, static display
- **Failed**: Red X or error icon, error message tooltip/expanded view, retry option (re-upload)

**Sorting**:
- Most recent uploads first
- Group by status: Processing files top, then Ready, then Failed

### 4. Styling Approach
**Reuse Existing Design System**:
- HSL color variables from app.css
- Transparent buttons with opacity transitions (0.7 → 1 on hover)
- 8px icon gaps, 16px padding/margins
- Rounded corners: 6-8px border-radius
- Font: iA Writer Quattro V (from body)

**Progress Bar**:
- Height: 4px (match modal progress bar in +page.svelte)
- Background: `hsl(var(--border))` (subtle)
- Fill color: `var(--boss-accent)` (coral/salmon highlight)
- Smooth transition with 150ms duration

**File List Container**:
- Background: `hsl(var(--card))` (slightly lighter than background)
- Border: 1px `hsl(var(--border))`
- Border-radius: 6px
- Padding: 12px
- Max-height: 400px with overflow-y auto (not too tall)
- Shadow: subtle (optional, for depth)

**Status Indicators**:
- Processing: Animated spinner or dots (like loading-text in current +page.svelte)
- Ready: ✓ checkmark, color `hsl(var(--foreground))`
- Failed: ✗ or error icon, color `rgb(239, 68, 68)` (red)
- Pending: Clock/hourglass icon, color `hsl(var(--muted-foreground))`

### 5. Error Handling UI
**Error Display**:
- Top-level error banner: Show `error` store above file list (if non-null)
- Auto-clears after 5s (managed by Chunk 8 store)
- Format: "Error: [message]" with close button (X)
- Color: `rgb(239, 68, 68)` (red) background with `hsl(var(--foreground))` text

**Per-File Errors**:
- Failed files show error_message in tooltip or expandable detail
- Option to view full error or retry upload

**Duplicate File Detection**:
- On upload, Chunk 6 API returns error if hash matches
- Show message: "This file already exists in your library"
- Suggestion: Delete existing and re-upload, or cancel

---

## Implementation

### File: Updates to src/routes/+page.svelte

#### 1. Script Section Changes

**Imports**:
```typescript
// Add to existing imports
import {
  files,
  processingFiles,
  readyFiles,
  failedFiles,
  error,
  uploadFile,
  deleteFile
} from '$lib/stores/filesStore';
```

**State Variables**:
```typescript
let fileInputRef: HTMLInputElement;
let showFileList = $state(false);
let deleteConfirmId = $state<string | null>(null);
let uploadProgress = $state<Record<string, number>>({});
```

**File Upload Handler**:
```typescript
async function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (!file) return;

  // Validate file type
  const allowedTypes = [
    'application/pdf',
    'text/plain', 'text/markdown',
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'text/javascript', 'application/typescript',
    'text/x-python',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/json'
  ];

  if (!allowedTypes.includes(file.type)) {
    error.set(`File type not supported: ${file.type}`);
    return;
  }

  // Validate file size (10MB = 10485760 bytes)
  if (file.size > 10485760) {
    error.set('File is too large. Maximum size is 10MB.');
    return;
  }

  try {
    showFileList = true;
    const fileId = await uploadFile(file);
    console.log('[Chunk 9 UI] File uploaded:', fileId);
  } catch (err) {
    console.error('[Chunk 9 UI] Upload failed:', err);
    error.set(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  // Reset input
  target.value = '';
}

async function handleDeleteFile(fileId: string) {
  try {
    await deleteFile(fileId);
    console.log('[Chunk 9 UI] File deleted:', fileId);
  } catch (err) {
    console.error('[Chunk 9 UI] Delete failed:', err);
    error.set(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
  deleteConfirmId = null;
}

function triggerFileInput() {
  fileInputRef?.click();
}

// Helper to format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Helper to format timestamp
function formatFileTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

// Drag and drop handlers
function handleDragOver(event: DragEvent) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  // Optional: add visual feedback class
}

function handleDrop(event: DragEvent) {
  event.preventDefault();
  const files = event.dataTransfer?.files;
  if (files?.length) {
    const file = files[0];
    // Create synthetic event for reuse of validation logic
    const syntheticEvent = {
      target: {
        files: files,
        value: ''
      }
    } as unknown as Event;
    handleFileSelect(syntheticEvent);
  }
}
```

**Store Subscriptions in Template**:
```typescript
// Reactive access to stores
$: allFiles = $files;
$: processing = $processingFiles;
$: ready = $readyFiles;
$: failed = $failedFiles;
$: errorMessage = $error;
```

#### 2. Template Changes

**A. Update Input Controls Row** (in .input-controls section):

Change the non-functional paperclip button to functional:
```svelte
<!-- File upload button (replace existing placeholder) -->
<button
  class="control-btn file-upload-btn"
  title="Attach file"
  onclick={triggerFileInput}
>
  <Icon src={LuPaperclip} size="11" />
</button>

<!-- Hidden file input -->
<input
  type="file"
  bind:this={fileInputRef}
  onchange={handleFileSelect}
  accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.gif,.webp,.js,.ts,.py,.xlsx,.csv,.json"
  style="display: none"
/>

<!-- File list toggle button (show file count) -->
{#if allFiles.length > 0}
  <button
    class="control-btn file-list-btn"
    title={`Files (${allFiles.length})`}
    onclick={() => showFileList = !showFileList}
  >
    <Icon src={LuFolder} size="11" />
    <span class="file-count">{allFiles.length}</span>
  </button>
{/if}
```

**B. Add File List Container** (after input-area div, before user-controls):

```svelte
<!-- File List Dropdown -->
{#if showFileList && allFiles.length > 0}
  <div class="file-list-container">
    <!-- Error message -->
    {#if errorMessage}
      <div class="file-error-banner">
        <span>{errorMessage}</span>
        <button
          class="error-close-btn"
          onclick={() => error.set(null)}
        >
          ×
        </button>
      </div>
    {/if}

    <!-- File list header -->
    <div class="file-list-header">
      <span class="file-list-title">Files ({allFiles.length})</span>
      <button
        class="file-list-close-btn"
        onclick={() => showFileList = false}
      >
        <Icon src={LuChevronDown} size="11" />
      </button>
    </div>

    <!-- Processing files section -->
    {#if processing.length > 0}
      <div class="file-list-section">
        <div class="file-list-section-label">Processing ({processing.length})</div>
        {#each processing as file (file.id)}
          <div class="file-item file-item-processing">
            <div class="file-item-info">
              <div class="file-item-name" title={file.filename}>{file.filename}</div>
              <div class="file-item-stage">{file.processing_stage || 'pending'}</div>
            </div>
            <div class="file-item-progress">
              <div class="progress-bar-container">
                <div class="progress-bar" style="width: {file.progress}%"></div>
              </div>
              <span class="file-item-percent">{file.progress}%</span>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Ready files section -->
    {#if ready.length > 0}
      <div class="file-list-section">
        <div class="file-list-section-label">Ready ({ready.length})</div>
        {#each ready as file (file.id)}
          <div class="file-item file-item-ready">
            <div class="file-item-info">
              <div class="file-item-status-icon">✓</div>
              <div class="file-item-name" title={file.filename}>{file.filename}</div>
            </div>
            <button
              class="file-item-delete-btn"
              onclick={() => deleteConfirmId = file.id}
              title="Delete file"
            >
              <Icon src={LuTrash2} size="10" />
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Failed files section -->
    {#if failed.length > 0}
      <div class="file-list-section">
        <div class="file-list-section-label">Failed ({failed.length})</div>
        {#each failed as file (file.id)}
          <div class="file-item file-item-failed">
            <div class="file-item-info">
              <div class="file-item-status-icon">✕</div>
              <div class="file-item-details">
                <div class="file-item-name" title={file.filename}>{file.filename}</div>
                <div class="file-item-error">{file.error_message || 'Unknown error'}</div>
              </div>
            </div>
            <button
              class="file-item-delete-btn"
              onclick={() => deleteConfirmId = file.id}
              title="Delete file"
            >
              <Icon src={LuTrash2} size="10" />
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<!-- Delete Confirmation Modal -->
{#if deleteConfirmId}
  <div class="modal-overlay" onclick={() => deleteConfirmId = null}>
    <div class="modal-content" onclick={(e) => e.stopPropagation()}>
      <p class="modal-text">Delete file permanently?</p>
      <div class="modal-actions">
        <button
          class="modal-btn modal-btn-cancel"
          onclick={() => deleteConfirmId = null}
        >
          Cancel
        </button>
        <button
          class="modal-btn modal-btn-confirm"
          onclick={() => deleteConfirmId && handleDeleteFile(deleteConfirmId)}
        >
          Delete
        </button>
      </div>
    </div>
  </div>
{/if}
```

**C. Add Drag-and-Drop Zone** (wrap input-field-wrapper):

```svelte
<!-- Updated input area with drag-and-drop -->
<div
  class="input-field-wrapper"
  ondragover={handleDragOver}
  ondrop={handleDrop}
>
  <!-- Existing input controls -->
  <div class="input-controls">
    <!-- ... existing controls ... -->
  </div>

  <!-- Existing message input -->
  <input
    type="text"
    placeholder="Type your message or drag files here..."
    class="message-input"
    bind:value={inputMessage}
    onkeydown={handleKeyDown}
    disabled={$isLoading}
  />
</div>
```

#### 3. Style Section Changes

**Add to existing `<style>` block**:

```css
/* File Upload UI Styles */

/* File upload button - make slightly different from other controls */
.file-upload-btn {
  position: relative;
}

.file-upload-btn:hover {
  opacity: 1;
  color: var(--boss-accent);
}

/* File list button with count badge */
.file-list-btn {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
}

.file-count {
  font-size: 0.75em;
  background: var(--boss-accent);
  color: hsl(var(--background));
  border-radius: 10px;
  padding: 1px 4px;
  font-weight: 600;
  min-width: 16px;
  text-align: center;
}

/* Drag and drop visual feedback */
.input-field-wrapper {
  transition: background-color 0.2s, border-color 0.2s;
}

.input-field-wrapper:hover {
  background-color: hsl(var(--input) / 0.05);
}

/* File List Container */
.file-list-container {
  position: fixed;
  bottom: 120px;
  left: 50%;
  transform: translateX(-50%);
  width: min(calc(100% - 32px), 600px);
  max-width: 600px;
  max-height: 400px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  overflow-y: auto;
  z-index: var(--z-dropdown);
}

/* File list header */
.file-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid hsl(var(--border));
  background: hsl(var(--background));
  position: sticky;
  top: 0;
  z-index: 1;
}

.file-list-title {
  font-weight: 600;
  color: hsl(var(--foreground));
  font-size: 0.9em;
}

.file-list-close-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  opacity: 0.7;
  transition: opacity 0.2s;
  display: flex;
  align-items: center;
  transform: rotate(180deg);
}

.file-list-close-btn:hover {
  opacity: 1;
}

/* File list sections */
.file-list-section {
  padding: 12px 8px;
  border-bottom: 1px solid hsl(var(--border));
}

.file-list-section:last-child {
  border-bottom: none;
}

.file-list-section-label {
  font-size: 0.8em;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  padding: 0 8px;
  font-weight: 500;
}

/* File item - base styles */
.file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px;
  border-radius: 4px;
  gap: 8px;
  margin-bottom: 4px;
  transition: background-color 0.2s;
}

.file-item:hover {
  background-color: hsl(var(--muted) / 0.1);
}

/* File item info container */
.file-item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-item-details {
  flex: 1;
  min-width: 0;
}

.file-item-name {
  font-size: 0.85em;
  color: hsl(var(--foreground));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-item-stage {
  font-size: 0.75em;
  color: hsl(var(--muted-foreground));
  text-transform: capitalize;
}

.file-item-error {
  font-size: 0.75em;
  color: rgb(239, 68, 68);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* File item status icon */
.file-item-status-icon {
  font-weight: bold;
  font-size: 0.9em;
  width: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.file-item-ready .file-item-status-icon {
  color: hsl(var(--foreground));
}

.file-item-failed .file-item-status-icon {
  color: rgb(239, 68, 68);
}

/* Processing specific styles */
.file-item-processing {
  flex-direction: column;
  align-items: flex-start;
}

.file-item-progress {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-bar-container {
  flex: 1;
  height: 4px;
  background: hsl(var(--border));
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: var(--boss-accent);
  transition: width 150ms linear;
}

.file-item-percent {
  font-size: 0.75em;
  color: hsl(var(--muted-foreground));
  min-width: 28px;
  text-align: right;
}

/* Delete button */
.file-item-delete-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  opacity: 0.6;
  transition: opacity 0.2s;
  color: rgb(239, 68, 68);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.file-item-delete-btn:hover {
  opacity: 1;
}

/* Error banner */
.file-error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.1);
  border-bottom: 1px solid rgb(239, 68, 68);
  color: rgb(239, 68, 68);
  font-size: 0.85em;
  gap: 8px;
}

.error-close-btn {
  background: transparent;
  border: none;
  color: rgb(239, 68, 68);
  cursor: pointer;
  font-size: 1.2em;
  padding: 0 4px;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.error-close-btn:hover {
  opacity: 1;
}

/* Delete confirmation modal - add to existing modal styles */
.modal-btn-confirm {
  background: var(--boss-accent);
  color: hsl(var(--background));
  border: 1px solid var(--boss-accent);
}

.modal-btn-confirm:hover {
  background: rgb(217, 133, 107);
  border-color: rgb(217, 133, 107);
}

/* Scrollbar styling for file list */
.file-list-container::-webkit-scrollbar {
  width: 6px;
}

.file-list-container::-webkit-scrollbar-track {
  background: transparent;
}

.file-list-container::-webkit-scrollbar-thumb {
  background: hsl(var(--border));
  border-radius: 3px;
}

.file-list-container::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground));
}

/* Responsive adjustments */
@media (max-width: 600px) {
  .file-list-container {
    bottom: 110px;
    width: calc(100% - 16px);
    max-height: 300px;
  }
}
```

---

## Testing Strategy

### Manual Browser Testing

**Setup**:
1. Run dev server: `npm run dev`
2. Open app in browser
3. Open DevTools (Console + Network tabs)

**Scenario 1: File Upload via Button**
1. Click paperclip icon
2. Select a small text file from disk
3. Verify:
   - File appears in file list (Processing section)
   - Progress bar animates 0→100%
   - Stage updates: extraction → compression → embedding → finalization
   - File moves to Ready section when complete
   - Processing file disappears from Processing section

**Scenario 2: File Upload via Drag-and-Drop**
1. Drag text file onto input area
2. Drop file
3. Verify same as Scenario 1

**Scenario 3: File Size Validation**
1. Create file > 10MB locally
2. Try to upload
3. Verify error message: "File is too large. Maximum size is 10MB."
4. Verify error auto-clears after 5 seconds

**Scenario 4: File Type Validation**
1. Try to upload .exe or .zip file
2. Verify error message: "File type not supported"
3. Verify file input clears

**Scenario 5: File Deletion**
1. Upload file and wait for it to be Ready
2. Hover over file, click delete icon
3. Verify delete confirmation modal appears
4. Click Cancel → modal closes, file still visible
5. Click delete again → click Delete in modal
6. Verify:
   - File disappears from list
   - SSE event received (`file-deleted`)
   - File count badge updates

**Scenario 6: File List UI**
1. Upload 3-5 files
2. Verify:
   - Processing files show at top with progress bars
   - Ready files show in middle with checkmarks
   - Failed files show at bottom with error icons
   - File count badge on button shows total count
   - List is scrollable if many files
   - Files sorted by upload time (newest first)

**Scenario 7: Error Handling**
1. Network offline (DevTools → Network → Offline)
2. Try to upload file
3. Verify error message appears at top of file list
4. Go online
5. Retry upload
6. Verify success

**Scenario 8: Real-time Updates**
1. Upload file in one browser tab
2. Open same app in another tab
3. Verify file appears in both tabs (via SSE)
4. Delete in one tab
5. Verify deletion appears in other tab

### UI/UX Verification

- [ ] File upload button (paperclip) is visually distinct
- [ ] File list appears below input area when files exist
- [ ] Progress bars animate smoothly
- [ ] Checkmarks appear for ready files
- [ ] Error icons appear for failed files
- [ ] Stage text is readable (extraction, compression, etc.)
- [ ] File names truncate with ellipsis if long
- [ ] Error banner appears at top of file list
- [ ] Modal works for delete confirmation
- [ ] All text is readable with current colors
- [ ] No horizontal scrolling on narrow screens
- [ ] Matches existing Asura design (spacing, colors, typography)

### Integration Verification

- [ ] Chunk 8 store properly subscribed (no connection errors in console)
- [ ] SSE events received in Network tab (GET /api/files/events)
- [ ] Files appear from Chunk 6 API (GET /api/files)
- [ ] Upload calls POST /api/files/upload
- [ ] Delete calls DELETE /api/files/[id]
- [ ] Refresh calls work if manually triggered
- [ ] Error store messages display and auto-clear

---

## Integration Points

### Chunk 8 (Store)
- Subscribe to `files`, `processingFiles`, `readyFiles`, `failedFiles` stores
- Call `uploadFile()` on file select/drop
- Call `deleteFile()` on delete confirmation
- Display `error` store messages with auto-clear
- Store auto-connects SSE on first subscription
- Store auto-disconnects SSE when all unsubscribe

### Chunk 6 (API Endpoints)
- GET /api/files - Called by store on init
- POST /api/files/upload - Called by uploadFile()
- DELETE /api/files/[id] - Called by deleteFile()

### Chunk 7 (Server-Sent Events)
- GET /api/files/events - Connected by store, receives file-update/file-deleted events
- Real-time progress updates
- Real-time file list changes

### Future: Chunk 10 (Context Injection)
- Will use `readyFiles` store for including files in LLM context
- No changes needed in this chunk for that integration

---

## Success Criteria

### Functionality
- [ ] File upload button (paperclip) triggers file picker
- [ ] File picker accepts correct file types
- [ ] Drag-and-drop works on input area
- [ ] File size validation (10MB limit)
- [ ] File type validation
- [ ] File list displays with correct sections (Processing, Ready, Failed)
- [ ] Progress bars update in real-time
- [ ] Stage indicators show (extraction, compression, etc.)
- [ ] Delete confirmation modal works
- [ ] Delete removes file from list
- [ ] Error messages display and auto-clear
- [ ] File count badge shows correct number

### UI/UX
- [ ] Matches existing Asura design (colors, spacing, typography)
- [ ] Paperclip icon is clickable and has hover state
- [ ] File list is visually distinct from messages
- [ ] Progress bars are smooth and visible
- [ ] Status icons (✓, ✕) are clear
- [ ] Delete buttons are easy to find but safe (confirmation required)
- [ ] No layout shifts or overflow issues
- [ ] Responsive on mobile (max 300px height)
- [ ] Accessible (proper contrast, clickable areas)

### Integration
- [ ] Works seamlessly with Chunk 8 store
- [ ] SSE connection stays alive
- [ ] Real-time updates work correctly
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] No resource leaks (proper cleanup on unmount)

### Code Quality
- [ ] TypeScript strict mode compliance
- [ ] No hardcoded values (all dynamic)
- [ ] Reuses existing design system (variables)
- [ ] Follows existing code patterns
- [ ] Well-commented for maintainability
- [ ] Handles all error cases
- [ ] Proper resource cleanup

---

## Implementation Notes

### File Type Detection
Use file MIME type for validation (not extension). Supported types:
- PDFs: `application/pdf`
- Text: `text/plain`, `text/markdown`
- Images: `image/png`, `image/jpeg`, `image/gif`, `image/webp`
- Code: `text/javascript`, `application/typescript`, `text/x-python`
- Spreadsheets: `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `text/csv`
- Data: `application/json`

### Progress Updates
Progress comes from Chunk 8 store, which receives updates via SSE from Chunk 5 backend orchestration. UI just displays what store provides.

### Error Auto-Clear
Chunk 8 store automatically clears errors after 5 seconds. UI doesn't need to manage this - just display what's in the error store.

### File List Positioning
Fixed position below input-area, centered on screen. Positioned above delete confirmation modal (higher z-index than messages, lower than modal).

### Responsive Design
On narrow screens (< 600px):
- File list width: calc(100% - 16px)
- File list max-height: 300px (smaller)
- File list bottom: 110px (adjust for smaller input area)
- File names truncate more aggressively

### No Separate Components
Keeping everything in +page.svelte for simplicity (MVP). If this grows later, can extract FileList and FileItem into separate components.

---

## Out of Scope (For Future Chunks)

- [ ] File preview/viewer UI
- [ ] Batch upload
- [ ] File search/filtering beyond dropdown
- [ ] Retry button for failed files (will be Chunk 5+ enhancement)
- [ ] File versioning UI
- [ ] File sharing UI
- [ ] Ephemeral files handling
- [ ] File size indicators in list
- [ ] File type icons (just use status indicator)

---

## Summary

This plan integrates a simple, elegant file management UI into the existing Asura chat interface. It leverages the Chunk 8 store for all state management and the Chunk 6/7 API/SSE backend for data. The UI matches existing design patterns and provides clear feedback for all file operations.

Key design decisions:
1. Single component in +page.svelte (keep it simple)
2. File list dropdown below input area
3. Reuse all Asura design system (colors, spacing, patterns)
4. Clear visual states (Processing → Ready → Failed)
5. Real-time progress bars and stage indicators
6. Error handling with auto-clear
7. Delete confirmation modal for safety
8. Drag-and-drop support
9. Responsive on mobile

Ready for implementation after Reviewer approval.
