-- Fix: Activate Fireworks chat models that were inserted without is_active flag
UPDATE models SET is_active = true WHERE model_identifier LIKE 'accounts/fireworks/%';
