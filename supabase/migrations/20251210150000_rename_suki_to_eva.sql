-- Rename persona 'suki' to 'eva' across all tables
-- Part of Suki → Eva rename (2025-12-10)

-- Superjournal: update persona_name column
UPDATE superjournal SET persona_name = 'eva' WHERE persona_name = 'suki';

-- Superjournal: replace "Suki" in message content
UPDATE superjournal SET user_message = REPLACE(user_message, 'Suki', 'Eva') WHERE user_message LIKE '%Suki%';
UPDATE superjournal SET ai_response = REPLACE(ai_response, 'Suki', 'Eva') WHERE ai_response LIKE '%Suki%';

-- Journal: update persona_name column
UPDATE journal SET persona_name = 'eva' WHERE persona_name = 'suki';

-- Journal: replace "Suki" in compressed summaries (assuming similar columns or JSON)
UPDATE journal SET boss_essence = REPLACE(boss_essence, 'Suki', 'Eva') WHERE boss_essence LIKE '%Suki%';
UPDATE journal SET persona_essence = REPLACE(persona_essence, 'Suki', 'Eva') WHERE persona_essence LIKE '%Suki%';

-- User settings: selected persona
UPDATE user_settings SET selected_persona = 'eva' WHERE selected_persona = 'suki';

-- Add Eva to personas table (she was never added before)
INSERT INTO personas (name, display_name) VALUES
  ('eva', 'Eva')
ON CONFLICT (name) DO NOTHING;
