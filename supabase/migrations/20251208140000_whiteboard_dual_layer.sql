-- Migrate whiteboards to dual-layer state model (render + semantic)
-- Old format: {"notes":[],"viewport":{}}
-- New format: {"render":[],"semantic":{},"viewport":{}}

-- Update default for new whiteboards
ALTER TABLE whiteboards
ALTER COLUMN state SET DEFAULT '{"render":[],"semantic":{},"viewport":{"x":0,"y":0,"scale":1}}';

-- Migrate existing whiteboards: move notes[] to render[] with type field
UPDATE whiteboards
SET state = jsonb_build_object(
  'render', COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_set(note, '{type}', '"note"')
      )
      FROM jsonb_array_elements(state->'notes') AS note
    ),
    '[]'::jsonb
  ),
  'semantic', '{}'::jsonb,
  'viewport', COALESCE(state->'viewport', '{"x":0,"y":0,"scale":1}'::jsonb)
)
WHERE state ? 'notes';
