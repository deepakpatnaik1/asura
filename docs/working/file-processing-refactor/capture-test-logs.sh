#!/bin/bash

# Test Log Capture Script
# Captures all relevant logs for file processing testing into a single text file

TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
OUTPUT_FILE="docs/working/file-processing-refactor/test-results-${TIMESTAMP}.txt"

echo "==================================================================" > "$OUTPUT_FILE"
echo "FILE PROCESSING TEST LOG CAPTURE" >> "$OUTPUT_FILE"
echo "==================================================================" >> "$OUTPUT_FILE"
echo "Timestamp: $(date)" >> "$OUTPUT_FILE"
echo "Branch: $(git branch --show-current)" >> "$OUTPUT_FILE"
echo "Commit: $(git rev-parse --short HEAD)" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

echo "==================================================================" >> "$OUTPUT_FILE"
echo "1. DATABASE: FILES TABLE" >> "$OUTPUT_FILE"
echo "==================================================================" >> "$OUTPUT_FILE"
PGPASSWORD='postgres' psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "
SELECT
    id,
    filename,
    file_type,
    status,
    processing_stage,
    progress,
    error_message,
    uploaded_at,
    LENGTH(description) as description_length
FROM files
ORDER BY uploaded_at DESC
LIMIT 20;
" >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

echo "==================================================================" >> "$OUTPUT_FILE"
echo "2. DATABASE: FILE CHUNKS TABLE" >> "$OUTPUT_FILE"
echo "==================================================================" >> "$OUTPUT_FILE"
PGPASSWORD='postgres' psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "
SELECT
    fc.id,
    f.filename,
    fc.chunk_index,
    LENGTH(fc.chunk_text) as original_chars,
    LENGTH(fc.description) as compressed_chars,
    ROUND(100.0 * (1 - LENGTH(fc.description)::float / NULLIF(LENGTH(fc.chunk_text), 0)::float), 1) as compression_ratio,
    fc.embedding IS NOT NULL as has_embedding,
    fc.created_at
FROM file_chunks fc
LEFT JOIN files f ON fc.file_id = f.id
ORDER BY f.uploaded_at DESC, fc.chunk_index ASC
LIMIT 50;
" >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

echo "==================================================================" >> "$OUTPUT_FILE"
echo "3. DATABASE: CHUNK DESCRIPTIONS (First 500 chars of each)" >> "$OUTPUT_FILE"
echo "==================================================================" >> "$OUTPUT_FILE"
PGPASSWORD='postgres' psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "
SELECT
    f.filename,
    fc.chunk_index,
    LEFT(fc.description, 500) as description_preview
FROM file_chunks fc
LEFT JOIN files f ON fc.file_id = f.id
ORDER BY f.uploaded_at DESC, fc.chunk_index ASC
LIMIT 20;
" >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

echo "==================================================================" >> "$OUTPUT_FILE"
echo "4. DATABASE: ORPHANED CHUNKS CHECK" >> "$OUTPUT_FILE"
echo "==================================================================" >> "$OUTPUT_FILE"
PGPASSWORD='postgres' psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "
SELECT fc.id, fc.file_id, fc.chunk_index
FROM file_chunks fc
LEFT JOIN files f ON fc.file_id = f.id
WHERE f.id IS NULL;
" >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

echo "==================================================================" >> "$OUTPUT_FILE"
echo "5. DATABASE: CHUNK INDEX GAPS CHECK" >> "$OUTPUT_FILE"
echo "==================================================================" >> "$OUTPUT_FILE"
PGPASSWORD='postgres' psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "
WITH chunk_sequences AS (
    SELECT
        file_id,
        chunk_index,
        LAG(chunk_index) OVER (PARTITION BY file_id ORDER BY chunk_index) as prev_index
    FROM file_chunks
)
SELECT
    file_id,
    prev_index,
    chunk_index,
    chunk_index - prev_index as gap
FROM chunk_sequences
WHERE prev_index IS NOT NULL AND chunk_index - prev_index > 1;
" >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

echo "==================================================================" >> "$OUTPUT_FILE"
echo "6. DEV SERVER CONSOLE (Last 500 lines)" >> "$OUTPUT_FILE"
echo "==================================================================" >> "$OUTPUT_FILE"
echo "NOTE: Dev server logs are ephemeral. Capture manually if needed." >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

echo "==================================================================" >> "$OUTPUT_FILE"
echo "7. BROWSER CONSOLE LOGS" >> "$OUTPUT_FILE"
echo "==================================================================" >> "$OUTPUT_FILE"
echo "NOTE: Browser console logs must be copied manually from DevTools." >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

echo "==================================================================" >> "$OUTPUT_FILE"
echo "8. FILE PROCESSING STAGE SUMMARY" >> "$OUTPUT_FILE"
echo "==================================================================" >> "$OUTPUT_FILE"
PGPASSWORD='postgres' psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "
SELECT
    status,
    processing_stage,
    COUNT(*) as file_count,
    AVG(progress) as avg_progress,
    ARRAY_AGG(filename) as filenames
FROM files
GROUP BY status, processing_stage
ORDER BY status, processing_stage;
" >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

echo "==================================================================" >> "$OUTPUT_FILE"
echo "9. COMPRESSION STATISTICS" >> "$OUTPUT_FILE"
echo "==================================================================" >> "$OUTPUT_FILE"
PGPASSWORD='postgres' psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "
SELECT
    f.filename,
    COUNT(fc.id) as total_chunks,
    SUM(LENGTH(fc.chunk_text)) as total_original_chars,
    SUM(LENGTH(fc.description)) as total_compressed_chars,
    ROUND(100.0 * (1 - SUM(LENGTH(fc.description))::float / NULLIF(SUM(LENGTH(fc.chunk_text)), 0)::float), 1) as overall_compression_ratio
FROM files f
LEFT JOIN file_chunks fc ON f.id = fc.file_id
GROUP BY f.filename, f.uploaded_at
ORDER BY f.uploaded_at DESC;
" >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

echo "==================================================================" >> "$OUTPUT_FILE"
echo "10. EMBEDDING COVERAGE" >> "$OUTPUT_FILE"
echo "==================================================================" >> "$OUTPUT_FILE"
PGPASSWORD='postgres' psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "
SELECT
    f.filename,
    COUNT(fc.id) as total_chunks,
    COUNT(fc.embedding) as chunks_with_embedding,
    COUNT(fc.id) - COUNT(fc.embedding) as chunks_without_embedding
FROM files f
LEFT JOIN file_chunks fc ON f.id = fc.file_id
GROUP BY f.filename, f.uploaded_at
ORDER BY f.uploaded_at DESC;
" >> "$OUTPUT_FILE" 2>&1
echo "" >> "$OUTPUT_FILE"

echo "==================================================================" >> "$OUTPUT_FILE"
echo "LOG CAPTURE COMPLETE" >> "$OUTPUT_FILE"
echo "==================================================================" >> "$OUTPUT_FILE"
echo "Output saved to: $OUTPUT_FILE" >> "$OUTPUT_FILE"

echo ""
echo "✓ Test logs captured successfully!"
echo "Output file: $OUTPUT_FILE"
echo ""
echo "To view the file:"
echo "  cat $OUTPUT_FILE"
echo ""
