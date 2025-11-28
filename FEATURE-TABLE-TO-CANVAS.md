# Feature: Tables to Canvas

## Problem

Claude sometimes generates tables or ASCII-style horizontal bar charts in responses. These don't fit well in the 450px chat pane - text gets squeezed, columns misalign, and readability suffers.

Meanwhile, we have a large canvas area designed for visual content (charts, images from PDFs).

## Solution

Extract tables and chart-like content from Claude's responses, render them as styled PNG images, and display them in the canvas alongside existing chart/image functionality.

## Scope

**In scope:**
- Markdown tables (`| Header | Header |`)
- ASCII horizontal bar charts
- Any structured tabular content

**Out of scope:**
- Vertical bar charts (rare in text)
- Complex ASCII art

## Architecture

### Detection

In `markdown-renderer.ts` or a new utility, detect:

1. **Markdown tables** - Regex for `|...|` patterns with header separator `|---|---|`
2. **ASCII bar charts** - Patterns like `████████ 80%` or `[========  ] 80%`

### Extraction

1. Parse response text
2. Extract table/chart markdown
3. Replace in original text with placeholder: `[See Table 1 in canvas]`
4. Return both: cleaned text + extracted tables array

### Rendering (Server-side)

New endpoint: `POST /api/reader/render-table`

**Input:**
```typescript
{
  table_markdown: string;
  mode: 'chat' | 'reader';  // For accent color
}
```

**Process:**
1. Parse markdown table into structured data (rows/columns)
2. Build React-like JSX structure for satori
3. Use `satori` to render JSX → SVG
4. Use `@resvg/resvg-js` to convert SVG → PNG
5. Upload PNG to Supabase Storage (same bucket as chart images)
6. Return storage path

**Styling:**
```css
table {
  border-collapse: collapse;
  font-family: system-ui, sans-serif;
  font-size: 14px;
  background: #141414;  /* Match app background */
}

th {
  background: rgba(16, 185, 129, 0.08);  /* Reader accent soft fill */
  border: 1px solid rgb(16, 185, 129);   /* Reader accent border */
  padding: 8px 12px;
  text-align: left;
  font-weight: 600;
  color: rgb(16, 185, 129);  /* Accent color for headers */
}

td {
  border: 1px solid rgb(16, 185, 129);
  padding: 8px 12px;
  text-align: left;
  color: #e5e5e5;  /* Match foreground */
}

/* Alternating row colors for readability */
tr:nth-child(even) td {
  background: rgba(16, 185, 129, 0.03);
}
```

### Integration with Existing Chart System

Tables become "charts" in the existing system:

1. Store in `article_charts` table with `chart_type: 'table'`
2. Display in canvas carousel alongside PDF charts
3. Clickable to view full-size
4. Same thumbnail generation

### Flow

```
Claude Response
     ↓
detectAndExtractTables(text)
     ↓
┌─────────────────────────────────────┐
│ Returns:                            │
│ - cleanedText (tables removed)      │
│ - tables: [{markdown, position}]    │
└─────────────────────────────────────┘
     ↓
For each table:
  POST /api/reader/render-table
     ↓
  satori (JSX → SVG) + resvg (SVG → PNG)
     ↓
  Upload to Supabase Storage
     ↓
  Insert into article_charts
     ↓
Canvas displays table images
Chat shows "See Table 1 in canvas"
```

## Implementation Steps

### Phase 1: Table Detection & Extraction
- [ ] Create `src/lib/utils/table-extractor.ts`
- [ ] Regex for markdown tables
- [ ] Regex for ASCII bar charts
- [ ] Function to extract and replace with placeholders

### Phase 2: Server-side Rendering
- [ ] Install satori + resvg: `npm install satori @resvg/resvg-js`
- [ ] Create `src/routes/api/reader/render-table/+server.ts`
- [ ] JSX table component with dark theme styling
- [ ] SVG → PNG conversion and upload to storage

### Phase 3: Integration
- [ ] Modify streaming handlers to detect tables
- [ ] Call render endpoint for each table
- [ ] Insert into `article_charts` with type 'table'
- [ ] Update canvas to handle table images

### Phase 4: Polish
- [ ] Thumbnail generation for table images
- [ ] "See Table X" styling in chat
- [ ] Click to expand in canvas

## Dependencies

- `satori` (~5MB) - Converts JSX to SVG (Vercel's library)
- `@resvg/resvg-js` (~5MB) - Converts SVG to PNG (Rust-based, fast)
- Existing: Supabase Storage, `article_charts` table

## Notes

- Total added size: ~10MB (vs 300MB for Puppeteer)
- No browser/Chromium dependency
- Fast rendering (no browser startup overhead)
- Satori uses flexbox-based CSS subset - sufficient for table styling
- Tables in chat mode (Gunnar) should use chat accent color (coral) instead of reader accent (green)
- Requires a font file for text rendering (can use system font or bundle Inter/Roboto)

## Known Issues

### Tables Still Rendering Inline (2025-11-28)

**Status:** Not working

**Attempted Fixes:**
1. Added HTML table detection using cheerio (converts `<table>` to markdown pipe format)
2. Updated Samara prompt to specify GFM pipe syntax for tables
3. All 25 unit tests pass for table extraction
4. Integration added to `/api/reader/process-article/+server.ts`

**Test Case:** Dropped `2-USER-ASSESSMENT.md` into reader. Samara generated response with "Model pricing" table showing misaligned columns in 450px pane. Table was NOT extracted to canvas.

**Possible Causes:**
1. Table extraction runs after streaming completes, but UI displays original streamed text (not the cleaned/processed version)
2. The `processedResponse` is saved to DB but UI may be showing cached/streamed content
3. `containsTables()` may not be detecting the table format Samara actually outputs

**Next Steps to Debug:**
1. Add console.log to verify `containsTables()` returns true
2. Check server logs for "Detected tables in response, processing..." message
3. Verify render-table endpoint is being called
4. Check if `transformed_content` in DB contains placeholder or original table
