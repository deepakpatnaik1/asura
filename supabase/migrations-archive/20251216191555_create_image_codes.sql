-- Image codes: 3-character alphanumeric codes for referencing images globally
-- Format: [0-9A-Z]{3} giving 36^3 = 46,656 unique codes

CREATE TABLE image_codes (
    code CHAR(3) PRIMARY KEY,
    canvas_id UUID NOT NULL REFERENCES canvas_designer(id) ON DELETE CASCADE,
    image_id UUID NOT NULL,
    image_url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for looking up codes by canvas
CREATE INDEX idx_image_codes_canvas ON image_codes(canvas_id);

-- Index for looking up by image_id (for updates/deletes)
CREATE INDEX idx_image_codes_image ON image_codes(image_id);

-- RLS policies
ALTER TABLE image_codes ENABLE ROW LEVEL SECURITY;

-- Users can read codes for canvases they own
CREATE POLICY "Users can read own image codes"
    ON image_codes FOR SELECT
    USING (
        canvas_id IN (
            SELECT id FROM canvas_designer WHERE user_id = auth.uid()
        )
    );

-- Service role can do everything (for API operations)
CREATE POLICY "Service role full access"
    ON image_codes FOR ALL
    USING (auth.role() = 'service_role');
