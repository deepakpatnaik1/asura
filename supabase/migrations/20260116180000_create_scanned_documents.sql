-- Scanned Documents table
-- Tracks paper mail scanned by Boss, evaluated by Felix same as emails

CREATE TABLE IF NOT EXISTS scanned_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,  -- Single-user system, no FK needed

    -- File info
    file_path TEXT NOT NULL,           -- Original PDF path
    file_name TEXT NOT NULL,           -- Display name
    jpeg_base64 TEXT,                  -- Converted JPEG as base64 (for Grok evaluation)

    -- Tracking timestamps
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- When file was detected
    evaluated_at TIMESTAMPTZ,          -- When Grok processed it
    addressed_at TIMESTAMPTZ,          -- When Boss marked it handled

    -- Evaluation result (same pattern as gmail_processed)
    needs_attention BOOLEAN DEFAULT FALSE,
    evaluation_reason TEXT,            -- Grok's explanation

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for finding unevaluated documents
CREATE INDEX IF NOT EXISTS idx_scanned_documents_unevaluated
ON scanned_documents (user_id, scanned_at DESC)
WHERE evaluated_at IS NULL;

-- Index for finding pending (needs attention, not addressed)
CREATE INDEX IF NOT EXISTS idx_scanned_documents_pending
ON scanned_documents (user_id, scanned_at DESC)
WHERE needs_attention = TRUE AND addressed_at IS NULL;

-- Prevent duplicate scans of the same file
CREATE UNIQUE INDEX IF NOT EXISTS idx_scanned_documents_file_unique
ON scanned_documents (user_id, file_path);

COMMENT ON TABLE scanned_documents IS 'Paper mail scanned by Boss, evaluated by Felix';
