-- Add is_starred column to content library tables
-- Allows users to visually bookmark important items

-- Articles
ALTER TABLE articles ADD COLUMN IF NOT EXISTS is_starred boolean DEFAULT false NOT NULL;

-- Whiteboards
ALTER TABLE canvas_whiteboard ADD COLUMN IF NOT EXISTS is_starred boolean DEFAULT false NOT NULL;

-- Designer canvases
ALTER TABLE canvas_designer ADD COLUMN IF NOT EXISTS is_starred boolean DEFAULT false NOT NULL;

-- Indexes for quick filtering of starred items
CREATE INDEX IF NOT EXISTS idx_articles_is_starred ON articles(user_id, is_starred) WHERE is_starred = true;
CREATE INDEX IF NOT EXISTS idx_canvas_whiteboard_is_starred ON canvas_whiteboard(user_id, is_starred) WHERE is_starred = true;
CREATE INDEX IF NOT EXISTS idx_canvas_designer_is_starred ON canvas_designer(user_id, is_starred) WHERE is_starred = true;
