-- Create models table for LLM configuration
CREATE TABLE models (
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
INSERT INTO models (
  model_name,
  model_identifier,
  context_window,
  max_output_tokens,
  cost_per_million_input_tokens,
  cost_per_million_output_tokens
)
VALUES (
  'Qwen3-235B',
  'accounts/fireworks/models/qwen3-235b-a22b',
  131072,
  8192,
  0.22,
  0.88
);

-- Disable RLS for development (will re-enable in production)
ALTER TABLE models DISABLE ROW LEVEL SECURITY;
