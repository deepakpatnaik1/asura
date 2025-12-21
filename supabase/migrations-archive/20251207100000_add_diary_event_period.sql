-- Add event_period column for fuzzy dates like "Summer 2023", "Early 2022"
-- logged_at remains as creation timestamp, event_period is display-only

ALTER TABLE founder_diary ADD COLUMN IF NOT EXISTS event_period TEXT;
