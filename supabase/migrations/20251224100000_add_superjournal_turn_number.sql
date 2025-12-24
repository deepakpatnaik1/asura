-- Add turn_number to superjournal
-- Turn numbers are per-user, sequential, and renumber on delete to match UI behavior

-- 1. Add column (nullable initially for backfill)
ALTER TABLE superjournal ADD COLUMN turn_number INTEGER;

-- 2. Backfill existing rows with sequential turn numbers per user
WITH numbered AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) AS rn
    FROM superjournal
)
UPDATE superjournal s
SET turn_number = n.rn
FROM numbered n
WHERE s.id = n.id;

-- 3. Make column NOT NULL after backfill
ALTER TABLE superjournal ALTER COLUMN turn_number SET NOT NULL;

-- 4. Add unique constraint (one turn number per user)
ALTER TABLE superjournal ADD CONSTRAINT superjournal_user_turn_unique UNIQUE (user_id, turn_number);

-- 5. Add index for efficient lookups
CREATE INDEX idx_superjournal_user_turn ON superjournal (user_id, turn_number);

-- 6. Create trigger function for INSERT - assigns next turn number
CREATE OR REPLACE FUNCTION superjournal_assign_turn_number()
RETURNS TRIGGER AS $$
BEGIN
    SELECT COALESCE(MAX(turn_number), 0) + 1 INTO NEW.turn_number
    FROM superjournal
    WHERE user_id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_superjournal_assign_turn_number
    BEFORE INSERT ON superjournal
    FOR EACH ROW
    EXECUTE FUNCTION superjournal_assign_turn_number();

-- 7. Create trigger function for DELETE - shift down subsequent turn numbers
CREATE OR REPLACE FUNCTION superjournal_reorder_turn_numbers()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE superjournal
    SET turn_number = turn_number - 1
    WHERE user_id = OLD.user_id AND turn_number > OLD.turn_number;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_superjournal_reorder_turn_numbers
    AFTER DELETE ON superjournal
    FOR EACH ROW
    EXECUTE FUNCTION superjournal_reorder_turn_numbers();

-- 8. Add column comment
COMMENT ON COLUMN superjournal.turn_number IS 'Sequential turn number per user. Renumbers on delete to match UI display.';
