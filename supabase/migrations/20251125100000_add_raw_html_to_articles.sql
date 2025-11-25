-- ============================================================================
-- Migration: Add raw_html column to articles table
-- Description: Store raw HTML content to skip PDF conversion.
--              Claude can process HTML directly, making PDF conversion unnecessary.
-- ============================================================================

-- Add raw_html column to store the original pasted HTML
ALTER TABLE articles ADD COLUMN IF NOT EXISTS raw_html TEXT;

-- Comment for documentation
COMMENT ON COLUMN articles.raw_html IS 'Original HTML content pasted by user. Used directly for AI processing instead of PDF conversion.';
