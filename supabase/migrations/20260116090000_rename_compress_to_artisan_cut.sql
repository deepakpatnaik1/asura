-- Rename compress → artisan_cut and remove obsolete uncensored flags
-- The uncensored flags were a workaround; now users set artisan cut models directly via dropdowns

-- Step 1: Drop obsolete uncensored columns (8 total)
ALTER TABLE user_settings DROP COLUMN IF EXISTS compression_uncensored_gunnar;
ALTER TABLE user_settings DROP COLUMN IF EXISTS compression_uncensored_kirby;
ALTER TABLE user_settings DROP COLUMN IF EXISTS compression_uncensored_samara;
ALTER TABLE user_settings DROP COLUMN IF EXISTS compression_uncensored_alicja;
ALTER TABLE user_settings DROP COLUMN IF EXISTS compression_uncensored_eva;
ALTER TABLE user_settings DROP COLUMN IF EXISTS compression_uncensored_ananya;
ALTER TABLE user_settings DROP COLUMN IF EXISTS compression_uncensored_nico;
ALTER TABLE user_settings DROP COLUMN IF EXISTS compression_uncensored_felix;

-- Step 2: Rename model columns
ALTER TABLE user_settings RENAME COLUMN model_compression TO model_file_artisan_cut;
ALTER TABLE user_settings RENAME COLUMN model_chat_compression TO model_chat_artisan_cut;

-- Step 3: Update existing rows that use 'compression' to 'artisan_cut'
-- Must happen BEFORE adding the new constraint
UPDATE model_parameters SET use_case = 'artisan_cut' WHERE use_case = 'compression';

-- Step 4: Update model_parameters use_case CHECK constraint
ALTER TABLE model_parameters DROP CONSTRAINT IF EXISTS model_parameters_use_case_check;
ALTER TABLE model_parameters ADD CONSTRAINT model_parameters_use_case_check
  CHECK (use_case = ANY (ARRAY['conversation'::text, 'artisan_cut'::text]));
