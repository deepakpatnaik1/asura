-- Create canvas_designer table (parallel to canvas_whiteboard for Eva)
CREATE TABLE IF NOT EXISTS canvas_designer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    title TEXT NOT NULL DEFAULT 'Untitled',
    state JSONB NOT NULL DEFAULT '{"render": [], "semantic": {}, "viewport": {"x": 0, "y": 0, "scale": 1}}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS canvas_designer_user_id ON canvas_designer(user_id);
CREATE INDEX IF NOT EXISTS canvas_designer_updated_at ON canvas_designer(user_id, updated_at DESC);

-- RLS policies
ALTER TABLE canvas_designer ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own designer canvases" ON canvas_designer
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own designer canvases" ON canvas_designer
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own designer canvases" ON canvas_designer
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own designer canvases" ON canvas_designer
    FOR DELETE USING (auth.uid() = user_id);
