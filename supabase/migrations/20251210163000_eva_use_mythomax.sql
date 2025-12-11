-- Update Eva to use MythoMax (OpenRouter) instead of Dobby (Fireworks - unauthorized)
-- Remove any Dobby references and set Eva to use gryphe/mythomax-l2-13b

-- 1. Remove Dobby model (unauthorized on Fireworks)
DELETE FROM model_parameters WHERE model_identifier LIKE '%dobby%';
DELETE FROM models WHERE model_identifier LIKE '%dobby%';

-- 2. Update Eva's model override to use MythoMax
UPDATE model_overrides
SET model = 'gryphe/mythomax-l2-13b'
WHERE persona = 'eva';

-- 3. If no Eva override exists, create one
INSERT INTO model_overrides (user_id, persona, model)
SELECT user_id, 'eva', 'gryphe/mythomax-l2-13b'
FROM user_settings
WHERE NOT EXISTS (
  SELECT 1 FROM model_overrides
  WHERE model_overrides.user_id = user_settings.user_id
  AND persona = 'eva'
)
ON CONFLICT (user_id, persona) DO NOTHING;
