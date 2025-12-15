-- Unify whiteboards and canvases into single canvases table with type column
-- Types: 'whiteboard' (Gunnar), 'design' (Eva), future: 'planner-todos', 'planner-diary'

-- Step 1: Add type column to canvases (existing rows become 'design')
ALTER TABLE canvases ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'design';

-- Step 2: Migrate whiteboards into canvases with type='whiteboard'
INSERT INTO canvases (id, user_id, title, state, created_at, updated_at, type)
SELECT id, user_id, title, state, created_at, updated_at, 'whiteboard'
FROM whiteboards
ON CONFLICT (id) DO NOTHING;

-- Step 3: Create index for type queries
CREATE INDEX IF NOT EXISTS canvases_type ON canvases (user_id, type);

-- Step 4: Drop whiteboards table
DROP TABLE IF EXISTS whiteboards;

-- Update comment
COMMENT ON TABLE canvases IS 'Unified canvas workspaces. Types: whiteboard (Gunnar strategy), design (Eva characters), planner-* (Alicja productivity)';
COMMENT ON COLUMN canvases.type IS 'Canvas type: whiteboard, design, planner-todos, planner-diary, etc.';
