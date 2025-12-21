-- Comprehensive canvas table rename
-- canvas_whiteboard, canvas_design, canvas_planner_todos, canvas_planner_diary,
-- canvas_gallery_charts, canvas_planner_tags

-- ============================================================================
-- Step 1: Split canvases into canvas_whiteboard and canvas_design
-- ============================================================================

-- Create canvas_whiteboard (without type column)
CREATE TABLE canvas_whiteboard (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id),
    title text NOT NULL DEFAULT 'Untitled',
    state jsonb NOT NULL DEFAULT '{"render": [], "semantic": {}, "viewport": {"x": 0, "y": 0, "scale": 1}}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Create canvas_design (without type column)
CREATE TABLE canvas_design (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id),
    title text NOT NULL DEFAULT 'Untitled',
    state jsonb NOT NULL DEFAULT '{"render": [], "semantic": {}, "viewport": {"x": 0, "y": 0, "scale": 1}}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Migrate data
INSERT INTO canvas_whiteboard (id, user_id, title, state, created_at, updated_at)
SELECT id, user_id, title, state, created_at, updated_at
FROM canvases WHERE type = 'whiteboard';

INSERT INTO canvas_design (id, user_id, title, state, created_at, updated_at)
SELECT id, user_id, title, state, created_at, updated_at
FROM canvases WHERE type = 'design';

-- Create indexes
CREATE INDEX canvas_whiteboard_user_id ON canvas_whiteboard (user_id);
CREATE INDEX canvas_whiteboard_updated_at ON canvas_whiteboard (user_id, updated_at DESC);
CREATE INDEX canvas_design_user_id ON canvas_design (user_id);
CREATE INDEX canvas_design_updated_at ON canvas_design (user_id, updated_at DESC);

-- Enable RLS
ALTER TABLE canvas_whiteboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_design ENABLE ROW LEVEL SECURITY;

-- RLS policies for canvas_whiteboard
CREATE POLICY "Users can view own whiteboards" ON canvas_whiteboard FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own whiteboards" ON canvas_whiteboard FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own whiteboards" ON canvas_whiteboard FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own whiteboards" ON canvas_whiteboard FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for canvas_design
CREATE POLICY "Users can view own designs" ON canvas_design FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own designs" ON canvas_design FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own designs" ON canvas_design FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own designs" ON canvas_design FOR DELETE USING (auth.uid() = user_id);

-- Drop old canvases table
DROP TABLE canvases;

-- ============================================================================
-- Step 2: Rename other tables
-- ============================================================================

-- Rename todos -> canvas_planner_todos
ALTER TABLE todos RENAME TO canvas_planner_todos;

-- Rename founder_diary -> canvas_planner_diary
ALTER TABLE founder_diary RENAME TO canvas_planner_diary;

-- Rename charts -> canvas_gallery_charts (if exists)
ALTER TABLE IF EXISTS charts RENAME TO canvas_gallery_charts;

-- Rename tags -> canvas_planner_tags
ALTER TABLE tags RENAME TO canvas_planner_tags;

-- ============================================================================
-- Step 3: Add comments
-- ============================================================================

COMMENT ON TABLE canvas_whiteboard IS 'Gunnar whiteboard canvases for strategy planning';
COMMENT ON TABLE canvas_design IS 'Eva design canvases for character work';
COMMENT ON TABLE canvas_planner_todos IS 'Alicja planner - todo items';
COMMENT ON TABLE canvas_planner_diary IS 'Alicja planner - founder diary entries';
-- COMMENT ON TABLE canvas_gallery_charts IS 'Chart/image gallery from content and AI responses';
COMMENT ON TABLE canvas_planner_tags IS 'Alicja planner - tags for todos and diary';
