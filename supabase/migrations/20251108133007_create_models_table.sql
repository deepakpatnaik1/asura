-- Create models table for LLM configuration
CREATE TABLE IF NOT EXISTS models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name TEXT NOT NULL,
  model_identifier TEXT NOT NULL UNIQUE,
  context_window INTEGER NOT NULL,
  max_output_tokens INTEGER,
  cost_per_million_input_tokens DECIMAL(10,2),
  cost_per_million_output_tokens DECIMAL(10,2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert Qwen3-235B with Fireworks AI pricing
-- Use conditional insert to handle both old and new column names
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'models' AND column_name = 'input_price_per_million') THEN
        INSERT INTO models (model_name, model_identifier, provider, context_window, max_output_tokens, input_price_per_million, output_price_per_million)
        VALUES ('Qwen3-235B', 'accounts/fireworks/models/qwen3-235b-a22b', 'fireworks', 131072, 8192, 0.22, 0.88)
        ON CONFLICT (model_identifier) DO NOTHING;
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'models' AND column_name = 'cost_per_million_input_tokens') THEN
        INSERT INTO models (model_name, model_identifier, context_window, max_output_tokens, cost_per_million_input_tokens, cost_per_million_output_tokens)
        VALUES ('Qwen3-235B', 'accounts/fireworks/models/qwen3-235b-a22b', 131072, 8192, 0.22, 0.88)
        ON CONFLICT (model_identifier) DO NOTHING;
    END IF;
END $$;

-- Disable RLS for development (will re-enable in production)
ALTER TABLE models DISABLE ROW LEVEL SECURITY;
