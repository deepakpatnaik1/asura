-- Remove obsolete 'reader' use case from model_parameters
-- The reader mode was unified into the single universal mode - all personas now use 'conversation'

-- Step 1: Delete all 'reader' rows from model_parameters
DELETE FROM model_parameters WHERE use_case = 'reader';

-- Step 2: Update CHECK constraint to only allow 'conversation' and 'compression'
ALTER TABLE model_parameters DROP CONSTRAINT IF EXISTS model_parameters_use_case_check;
ALTER TABLE model_parameters ADD CONSTRAINT model_parameters_use_case_check
  CHECK (use_case IN ('conversation', 'compression'));
