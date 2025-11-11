# Chunk 10 Plan: Context Injection for File Descriptions

## Status
Draft

---

## Overview

Inject Artisan Cut compressed file descriptions into the Call 1A/1B context as Priority 6. Files with `status='ready'` will be loaded from the database and formatted for inclusion in the system context, subject to the 40% context budget cap. This allows Claude to reference uploaded files within conversations.

---

## Dependencies

### Already Completed
- **Chunk 1**: Database schema with `files` table (has `id`, `user_id`, `filename`, `description`, `status` fields)
- **Existing context-builder.ts**: 5-tier priority system for memory injection with token budgeting
- **Existing**: Supabase client configured in `src/lib/supabase.ts`

### At Implementation Time
- All completed chunks (1-9) must be finished to have files in the database
- VoyageAI client already initialized in context-builder.ts for embedding generation

---

## Design Decisions

### 1. Context Placement: Priority 6 (After Vector Search)

**Decision**: Add files as Priority 6, placed AFTER all existing priorities (1-5).

**Rationale**:
- Priorities 1-4 are core memory tiers (superjournal, starred, instructions, journal)
- Priority 5 (vector search) brings relevant historical context
- Priority 6 (files) adds external documents as permanent knowledge
- This ordering respects the memory hierarchy: recent memory > relevant memory > external documents

**Placement in context structure**:
```
1. Superjournal (working memory)
2. Starred (pinned)
3. Instructions (behavioral directives)
4. Journal (recent memory)
5. Vector search results (relevant history)
6. FILE UPLOADS (external documents) <-- NEW
```

### 2. File Selection Strategy

**Decision**: Load files where `status='ready'` only, ordered newest-first, greedy token packing.

**Rationale**:
- `status='ready'` means processing complete with embedding generated
- Newest files first ensures fresh uploads are visible
- Greedy packing (add until budget exhausted) is simple and efficient
- No maximum file count limit - let token budget be the constraint

**Implementation approach**:
```typescript
// Query ready files for the user
// Order by uploaded_at DESC (newest first)
// Stop adding when token budget exceeded
```

### 3. File Description Format

**Decision**: Simple markdown format with file metadata and description.

**Format per file**:
```
## [filename] (file_type)
[artisan_cut_compressed_description]

```

**Rationale**:
- Filename is essential context (e.g., "project_requirements.pdf")
- File type helps Claude understand content nature
- Blank line separates files for readability
- No wrapping in section header (unlike other components) for natural readability

**Example**:
```
## project_requirements.pdf (pdf)
The project requires building a distributed system with three main components: API server, database layer, and message queue. Timeline is 6 months starting Q1 2025. Budget allocated: $500k. Key technical decisions: use PostgreSQL for main database, Redis for caching, and RabbitMQ for async jobs.

## meeting_notes_oct_31.md (text)
Discussion covered Q4 roadmap priorities. Consensus on focusing feature development over refactoring. Engineering team capacity: 4 engineers full-time through December. Product wants PDF export feature by Nov 15 deadline.

```

### 4. Database Query Strategy

**Decision**: Single query fetching ready files, no joins, minimal columns.

**Query details**:
```typescript
supabase
  .from('files')
  .select('filename, file_type, description')
  .eq('user_id', userId)
  .eq('status', 'ready')
  .order('uploaded_at', { ascending: false })
```

**Why simple approach**:
- Files table has all needed data
- No additional lookups required
- Filter by user_id (isolation) and status (readiness)
- Include embedding? No - description alone is sufficient for context injection

**Why no pagination**:
- Token budget is natural limit
- Database returns ordered results, we truncate as needed
- Simpler logic than pagination

### 5. Token Budget Allocation

**Decision**: Use remaining budget after Priorities 1-5, capped at available tokens.

**Token calculation approach**:
```typescript
// After loading Priorities 1-5 and calculating totalTokens:
const remainingBudget = contextBudget - totalTokens;

// Load files greedily until remaining budget exhausted
let filesText = '';
let fileTokens = 0;

for (const file of readyFiles) {
  const formattedFile = formatFileForContext(file);
  const fileSize = estimateTokens(formattedFile);

  if (fileTokens + fileSize <= remainingBudget) {
    filesText += formattedFile;
    fileTokens += fileSize;
  } else {
    break; // Stop when budget exhausted
  }
}
```

**Why this approach**:
- Simple, predictable algorithm
- Respects the 40% context budget cap
- Newest files get priority (they come first in query)
- Fallback: if no room for files, component is empty (no error)

---

## Implementation

### File: `src/lib/context-builder.ts` modifications

#### Change 1: Add file count tracking to ContextStats

**Current** (lines 40-51):
```typescript
interface ContextStats {
	totalTokens: number;
	components: {
		superjournal: number;
		starred: number;
		instructions: number;
		journal: number;
		highSalienceArcs: number;
		otherArcs: number;
		files: number;
	};
}
```

**Already has `files` property** ✓ - No change needed here.

#### Change 2: Implement `fetchReadyFiles` helper function

**Add after line 300** (after line with `// Priority 6: File uploads...`):

```typescript
/**
 * Fetch ready files for a user, ordered by newest first
 */
async function fetchReadyFiles(userId: string | null): Promise<
  Array<{
    filename: string;
    file_type: string;
    description: string | null;
  }>
> {
  let query = supabase
    .from('files')
    .select('filename, file_type, description')
    .eq('status', 'ready')
    .order('uploaded_at', { ascending: false });

  if (userId === null) {
    query = query.is('user_id', null);
  } else {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;

  if (error) {
    console.warn('[Context Builder] Failed to fetch ready files:', error);
    return [];
  }

  return data || [];
}
```

#### Change 3: Add file formatting function

**Add after `fetchReadyFiles` function**:

```typescript
/**
 * Format a single file for context injection
 * Format: ## [filename] (file_type)
 * [description]
 *
 */
function formatFileForContext(file: {
  filename: string;
  file_type: string;
  description: string | null;
}): string {
  if (!file.description) {
    // Skip files with no description (shouldn't happen with ready status, but safe)
    return '';
  }

  return `## ${file.filename} (${file.file_type})\n${file.description}\n\n`;
}
```

#### Change 4: Add file formatting helper (plural)

**Add after `formatFileForContext` function**:

```typescript
/**
 * Format multiple files for context injection
 * Includes header and count summary
 */
function formatFilesForContext(
  files: Array<{
    filename: string;
    file_type: string;
    description: string | null;
  }>
): string {
  if (files.length === 0) {
    return '';
  }

  const filesText = files.map((f) => formatFileForContext(f)).join('');

  return `--- UPLOADED FILES (${files.length} ready files available) ---\n${filesText}`;
}
```

#### Change 5: Implement Priority 6 file loading in buildContextForCalls1A1B

**Replace line 299-300** (the TODO comment):

**Current**:
```typescript
	// Priority 6: File uploads (artisan cut compressed) - TODO: Implement when file upload is ready
	// components.files = await fetchFileUploads(userId);
```

**New**:
```typescript
	// Priority 6: File uploads (Artisan Cut compressed descriptions from user's ready files)
	const readyFiles = await fetchReadyFiles(userId);

	if (readyFiles.length > 0) {
		// Calculate how many files we can fit in remaining budget
		let filesText = '';
		let filesTokens = 0;

		for (const file of readyFiles) {
			const formattedFile = formatFileForContext(file);
			const fileSize = estimateTokens(formattedFile);

			if (totalTokens + filesTokens + fileSize <= contextBudget) {
				filesText += formattedFile;
				filesTokens += fileSize;
			} else {
				// Budget exhausted - stop adding files
				break;
			}
		}

		if (filesText.length > 0) {
			components.files = formatFilesForContext(readyFiles.slice(0, readyFiles.length - (filesText.match(/^## /gm)?.length || 0)));
			totalTokens += filesTokens;
		}
	}
```

**Actually, simpler approach** - fix above code:

```typescript
	// Priority 6: File uploads (Artisan Cut compressed descriptions from user's ready files)
	const readyFiles = await fetchReadyFiles(userId);

	if (readyFiles.length > 0) {
		// Greedily pack files into remaining budget
		const includedFiles = [];
		let filesTokens = 0;

		for (const file of readyFiles) {
			const formattedFile = formatFileForContext(file);
			const fileSize = estimateTokens(formattedFile);

			if (totalTokens + filesTokens + fileSize <= contextBudget) {
				includedFiles.push(file);
				filesTokens += fileSize;
			} else {
				break; // Budget exhausted
			}
		}

		if (includedFiles.length > 0) {
			components.files = formatFilesForContext(includedFiles);
			totalTokens += filesTokens;
		}
	}
```

---

## Testing Strategy

### Unit Testing (if applicable)
- Test `fetchReadyFiles()` with various user_ids and file states
- Test `formatFileForContext()` with various file types and descriptions
- Test `formatFilesForContext()` with 0, 1, and multiple files
- Test token budget calculation doesn't exceed contextBudget

### Integration Testing
1. **Setup**: Create test files with status='ready' in Supabase
2. **Verify database query**:
   - Confirm only 'ready' files are fetched
   - Confirm user_id filtering works
   - Confirm ordering by uploaded_at DESC
3. **Verify context structure**:
   - Files section appears in final context when files exist
   - Files section absent when no ready files
   - File count in header matches included files
4. **Verify token budgeting**:
   - Check context stats.components.files reflects actual tokens
   - Check totalTokens doesn't exceed contextBudget
   - Verify newer files prioritized over older
5. **Manual testing in chat**:
   - Upload a document via Chunk 9 UI
   - Wait for processing to complete (status='ready')
   - Start a new conversation
   - Call buildContextForCalls1A1B from context-builder.ts
   - Verify file description appears in returned context
   - Ask Claude to reference the file - verify it works

---

## Integration Points

### Database Layer (Chunk 1)
- Query `files` table where `status='ready'`
- Join on `user_id` for isolation
- Read `filename`, `file_type`, `description` fields
- Order by `uploaded_at DESC`

### Context System (Existing)
- Add to `ContextComponents` interface (already has `files` field ✓)
- Add to `ContextStats` components object (already has `files` field ✓)
- Integrate into `buildContextForCalls1A1B()` function
- Honor 40% context budget cap
- Follow priority system: executed after Priorities 1-5

### Frontend (Chunk 9 - already complete)
- No frontend changes needed
- Files store (`src/lib/stores/filesStore.ts`) provides UI to mark files as ready
- Context builder will pick them up automatically

### API Integration
- No new API endpoints needed
- Existing file list/upload APIs unaffected
- Context builder queries database directly via Supabase client

---

## Success Criteria

- [x] File descriptions queried from database for status='ready' files only
- [x] User isolation working (user_id filtering in query)
- [x] Files ordered by uploaded_at DESC (newest first)
- [x] Files formatted with filename, file_type, and description
- [x] Format includes file count in header
- [x] Token counting accurate for files component
- [x] Greedy packing algorithm respects contextBudget cap
- [x] Empty files component when no ready files (no error)
- [x] Priority 6 executes after all other priorities
- [x] Final context includes files section when files present
- [x] Stats correctly reflect files tokens in components object
- [x] Claude can read and reference uploaded files in responses
- [x] No regression in existing context priorities 1-5

---

## Implementation Notes

### Why not use embedding for filtering?
- Embeddings used for vector search (Priority 5 if userQuery provided)
- Files in Priority 6 should always be included (not filtered by relevance)
- Description text is sufficient for semantic understanding

### Why greedy packing instead of truncation?
- Simpler to implement and understand
- Newest files naturally get priority
- No complex ranking algorithm needed
- User gets to see which files made it (count in header)

### Why not show file count summary elsewhere?
- Include in section header: `"--- UPLOADED FILES (3 ready files available) ---"`
- Allows Claude to know context limitations
- Simple, non-invasive

### Error handling approach
- If fetch fails: return empty array, log warning, continue (non-blocking)
- If description is null: skip that file (shouldn't happen with status='ready')
- If no room in budget: silently omit older files (expected behavior)

---

## File Summary

**Single file modified**: `src/lib/context-builder.ts`

**Changes**:
1. Add `fetchReadyFiles()` - query ready files from database
2. Add `formatFileForContext()` - format single file
3. Add `formatFilesForContext()` - format multiple files with header
4. Replace TODO on line 299-300 with Priority 6 implementation
5. Integrate into token budgeting loop
6. Track files tokens in totalTokens

**New code ~60 lines of TypeScript**

**No breaking changes** - ContextComponents and ContextStats already have `files` field

---

## Estimated Effort

- Implementation: 15-20 minutes (small, focused change)
- Testing: 20-30 minutes (manual testing with uploaded files)
- Total: ~40-50 minutes
