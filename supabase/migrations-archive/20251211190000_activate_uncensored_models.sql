-- Activate uncensored models so they appear in Settings dropdown
-- These models were added but missing is_active = true

UPDATE models SET is_active = true WHERE model_identifier IN (
  'nothingiisreal/mn-celeste-12b',
  'neversleep/llama-3-lumimaid-70b',
  'cognitivecomputations/dolphin-mistral-24b-venice-edition:free'
);
