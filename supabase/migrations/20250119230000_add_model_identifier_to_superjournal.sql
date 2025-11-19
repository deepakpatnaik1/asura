-- Add model_identifier column to superjournal table
-- Part of Chunk 6: Conditional Text Cleanup
-- Stores which model generated each AI response (for conditional formatting)

ALTER TABLE public.superjournal
ADD COLUMN model_identifier TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.superjournal.model_identifier IS 'Model identifier that generated this AI response (e.g., claude-sonnet-4-5-20250929, accounts/fireworks/models/qwen3-235b-a22b)';
