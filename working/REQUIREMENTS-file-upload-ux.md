# File Upload UX Requirements

**Date**: 2025-11-13
**Status**: REQUIREMENTS CLARIFICATION

---

## 1. Nuke Button Behavior

### Current Broken Behavior
- Nuke button does not delete files from UI
- Files remain visible after clicking nuke

### Required Behavior

**The Nuke button MUST delete ALL user data including:**

1. **All successfully uploaded files** (status: `ready`)
2. **All files currently being processed** (status: `processing`)
3. **All files that failed to upload** (status: `failed`)
4. **All pending files** (status: `pending`)
5. **Any files "stuck" in the system somehow**

**After clicking Nuke:**
- File list should be completely empty
- No files should remain in the database
- No files should remain in the UI
- User should see a clean slate

**Purpose**: Allow complete reset of the system for testing and cleanup.

---

## 2. File Dropdown (Folder Icon) Display

### Current Wrong Behavior
- Shows separate sections: "uploading files" vs "ready files"
- Confusing UX with multiple lists

### Required Behavior

**Single unified file list showing ALL files with progress indicators:**

#### For Files Being Uploaded (status: `processing` or `pending`)
- Show file with progress bar partially filled
- Progress bar color: in-progress color (e.g., blue/yellow)
- Progress percentage visible (0%, 25%, 75%, 90%, 100%)

#### For Successfully Uploaded Files (status: `ready`)
- Show file with **completely green progress bar** (100%)
- Indicates file is ready to use
- No separate section - just mixed in the same list

#### For Failed Files (status: `failed`)
- Show file with red/error indicator
- Display error message if available
- Still in the same unified list

**Visual Layout**:
```
📁 Files Dropdown
├── file1.pdf     [████████████████████] 100% ✓ (green)
├── file2.txt     [████████░░░░░░░░░░░░]  75%   (uploading)
├── file3.docx    [███░░░░░░░░░░░░░░░░░]  25%   (uploading)
└── file4.md      [░░░░░░░░░░░░░░░░░░░░]   0% ❌ (failed)
```

**Key Point**: ONE list, not separate "uploading" vs "ready" sections.

---

## 3. Duplicate File Uploads

### Current Wrong Behavior
- Shows "File already exists" errors
- Prevents uploading the same file multiple times
- Blocks testing workflow

### Required Behavior

**MUST allow uploading the same file multiple times, especially during testing:**

1. **No "file already exists" errors**
2. **Each upload creates a new file entry** (even if filename is identical)
3. **Files can have same name** - system should use unique IDs internally
4. **Testing workflow**: User can upload `test.txt` 10 times in a row without errors

**Use Case**:
- During testing, user uploads `gettysburg.txt`
- Wants to test progress bar again
- Clicks upload, selects same `gettysburg.txt` file
- **Should work without error** - creates second copy

**Implementation Note**: Already partially implemented via:
```typescript
// In upload endpoint:
createFilePending(
  { fileBuffer, filename, userId, contentType },
  { skipDuplicateCheck: true } // ← This should allow duplicates
);
```

But may not be working correctly - needs verification.

---

## Summary of Required Fixes

| Issue | Current Behavior | Required Behavior | Bug # |
|-------|------------------|-------------------|-------|
| Nuke button | Files remain in UI | All files deleted, empty list | BUG-023 |
| File dropdown | Separate "uploading" vs "ready" sections | Single unified list with progress indicators | TBD |
| Duplicate uploads | "File already exists" error | Allow multiple uploads of same file | TBD (verify if working) |

---

## Priority

**HIGH** - These are fundamental UX requirements for the file upload feature to be usable, especially during testing and development.

---

## Testing Requirements

After implementing these fixes:

1. **Nuke Test**: Upload 5 files, click nuke, verify all files disappear
2. **Unified List Test**: Upload multiple files simultaneously, verify they all appear in ONE list with progress bars
3. **Duplicate Upload Test**: Upload same file 3 times in a row, verify no errors and all 3 copies appear in list

---

## Related Bugs

- **BUG-023**: Nuke button not working
- **BUG-016**: Duplicate file button (may be related to duplicate upload issue)
