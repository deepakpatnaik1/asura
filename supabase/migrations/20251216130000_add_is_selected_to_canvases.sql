-- Add is_selected column to canvas tables for persistent selection state
-- Matches content table's is_enabled pattern

-- Whiteboard canvas
ALTER TABLE canvas_whiteboard
ADD COLUMN is_selected boolean NOT NULL DEFAULT false;

-- Designer canvas
ALTER TABLE canvas_designer
ADD COLUMN is_selected boolean NOT NULL DEFAULT false;

-- Comment for clarity
COMMENT ON COLUMN canvas_whiteboard.is_selected IS 'Whether this whiteboard is selected for context injection';
COMMENT ON COLUMN canvas_designer.is_selected IS 'Whether this designer canvas is selected for context injection';
