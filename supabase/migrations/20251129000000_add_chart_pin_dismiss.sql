-- Add pin/dismiss columns to superjournal_charts for chart lifecycle management
-- Pinned charts stay visible; dismissed charts are hidden from carousel

ALTER TABLE superjournal_charts ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE superjournal_charts ADD COLUMN is_dismissed BOOLEAN NOT NULL DEFAULT false;

-- Index for filtering dismissed charts (most common query pattern)
CREATE INDEX idx_superjournal_charts_not_dismissed ON superjournal_charts(user_id, is_dismissed) WHERE is_dismissed = false;

-- Add update policy for toggling pin/dismiss
CREATE POLICY "Users can update own charts" ON superjournal_charts
  FOR UPDATE USING (auth.uid() = user_id);

COMMENT ON COLUMN superjournal_charts.is_pinned IS 'Pinned charts appear first in carousel and persist across sessions';
COMMENT ON COLUMN superjournal_charts.is_dismissed IS 'Dismissed charts are hidden from carousel (soft delete)';
