# File Picker Button Fix

## Issue

The paperclip button (first button in the input controls) is not triggering the macOS file picker dialog when clicked.

## Current State

The button is visible and rendered correctly in the UI:
```svelte
<button class="control-btn" title="Attach file"><Icon src={LuPaperclip} size="11" /></button>
```

Location: `src/routes/+page.svelte` (line ~228)

## What Needs to Be Fixed

The paperclip button needs a click handler that:
1. Opens the native macOS file picker dialog
2. Allows the user to select a file (PDF or DOCX)
3. Calls the `uploadFile()` action from the Files Store
4. Handles the upload response

## Implementation Required

Add the following functionality:

### 1. Create a hidden file input element

Add this to the template (inside `.input-field-wrapper`):
```svelte
<input
  type="file"
  accept=".pdf,.docx"
  style="display: none;"
  bind:this={fileInputRef}
  onchange={handleFileSelect}
/>
```

### 2. Add the file input ref and handler in the script section

```svelte
import { uploadFile } from '$lib/stores/files';

let fileInputRef: HTMLInputElement;

function handlePaperclipClick() {
  fileInputRef?.click();
}

async function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (!file) return;

  const result = await uploadFile(file);

  if (result.success) {
    console.log('[FileUpload] Upload successful:', result.fileId);
  } else {
    console.error('[FileUpload] Upload failed:', result.error);
  }

  // Reset the input so the same file can be selected again
  target.value = '';
}
```

### 3. Update the paperclip button

```svelte
<button class="control-btn" title="Attach file" onclick={handlePaperclipClick}>
  <Icon src={LuPaperclip} size="11" />
</button>
```

## Expected Behavior After Fix

1. User clicks the paperclip button
2. macOS file picker opens
3. User selects a PDF or DOCX file
4. File is uploaded via `/api/files/upload`
5. Files Store automatically starts polling for updates
6. File appears in the file dropdown menu (when that's implemented in Layer 7)

## Notes

- The Files Store (`$lib/stores/files.ts`) is already implemented and ready to use
- The upload API endpoint (`/api/files/upload`) is already working
- The `uploadFile()` function handles the entire upload flow including starting the polling mechanism
- Do NOT implement the file dropdown menu in this fix - that's part of Layer 7 UI work
