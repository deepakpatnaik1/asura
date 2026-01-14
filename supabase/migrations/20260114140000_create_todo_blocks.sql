-- Create canvas_todo_blocks table for block-based todo presentation
-- This separates DATA (canvas_planner_todos) from PRESENTATION (canvas_todo_blocks)

CREATE TABLE canvas_todo_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES canvas_todo_blocks(id) ON DELETE CASCADE,
  block_type text NOT NULL,
  content jsonb DEFAULT '{}'::jsonb,
  todo_id uuid REFERENCES canvas_planner_todos(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),

  -- Constraint: todo_ref blocks must have todo_id, others must not
  CONSTRAINT valid_todo_ref CHECK (
    (block_type = 'todo_ref' AND todo_id IS NOT NULL) OR
    (block_type != 'todo_ref' AND todo_id IS NULL)
  ),

  -- Constraint: valid block types
  CONSTRAINT valid_block_type CHECK (
    block_type IN ('section', 'todo_ref', 'note', 'divider')
  )
);

-- Indexes for efficient queries
CREATE INDEX idx_todo_blocks_user ON canvas_todo_blocks(user_id);
CREATE INDEX idx_todo_blocks_parent ON canvas_todo_blocks(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_todo_blocks_todo ON canvas_todo_blocks(todo_id) WHERE todo_id IS NOT NULL;
CREATE INDEX idx_todo_blocks_sort ON canvas_todo_blocks(user_id, parent_id, sort_order);

-- Enable RLS
ALTER TABLE canvas_todo_blocks ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own blocks"
  ON canvas_todo_blocks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own blocks"
  ON canvas_todo_blocks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own blocks"
  ON canvas_todo_blocks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own blocks"
  ON canvas_todo_blocks FOR DELETE
  USING (auth.uid() = user_id);

-- Comment for documentation
COMMENT ON TABLE canvas_todo_blocks IS 'Block-based presentation layer for todos. Separates data (todos) from presentation (how they are organized and displayed).';
COMMENT ON COLUMN canvas_todo_blocks.block_type IS 'section: grouping container, todo_ref: reference to a todo, note: free text, divider: visual separator';
COMMENT ON COLUMN canvas_todo_blocks.content IS 'Block-specific content. section: {name, collapsed}, note: {text}, divider: {}';
COMMENT ON COLUMN canvas_todo_blocks.todo_id IS 'For todo_ref blocks only: references the actual todo';
COMMENT ON COLUMN canvas_todo_blocks.sort_order IS 'Order within parent (or root if parent_id is null)';
