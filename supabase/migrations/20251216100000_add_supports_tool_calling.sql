-- Add supports_tool_calling column to models table
-- This determines whether the model can be used directly for tool calling
-- or needs to route through the tool_calling model from settings

ALTER TABLE models ADD COLUMN IF NOT EXISTS supports_tool_calling boolean DEFAULT false;

-- Anthropic models: all support tool calling natively
UPDATE models SET supports_tool_calling = true WHERE provider = 'anthropic';

-- OpenAI models: all support tool calling natively
UPDATE models SET supports_tool_calling = true WHERE provider = 'openai';

-- Google models: all support tool calling natively
UPDATE models SET supports_tool_calling = true WHERE provider = 'google';

-- Groq models: Llama 4 Maverick supports tool calling
UPDATE models SET supports_tool_calling = true WHERE provider = 'groq';

-- OpenRouter models: case by case
-- Grok 4.1 Fast: YES (xAI's best tool calling model)
UPDATE models SET supports_tool_calling = true WHERE model_identifier = 'x-ai/grok-4.1-fast';

-- Hermes 3 70B: NO (OpenRouter endpoints don't support tools even though model can)
UPDATE models SET supports_tool_calling = false WHERE model_identifier = 'nousresearch/hermes-3-llama-3.1-70b';

-- Dolphin Mixtral models: NO (unclear OpenRouter support, being conservative)
UPDATE models SET supports_tool_calling = false WHERE model_identifier LIKE 'cognitivecomputations/dolphin%';

-- Lumimaid models: NO (roleplay focused, no tool support)
UPDATE models SET supports_tool_calling = false WHERE model_identifier LIKE 'neversleep/llama-3.1-lumimaid%';

-- MythoMax: NO (roleplay focused, explicitly no tool support)
UPDATE models SET supports_tool_calling = false WHERE model_identifier = 'gryphe/mythomax-l2-13b';

-- Replicate models: DeepSeek R1 does NOT support tool calling natively
UPDATE models SET supports_tool_calling = false WHERE provider = 'replicate';

-- Together models: conservative default to false (needs verification)
UPDATE models SET supports_tool_calling = false WHERE provider = 'together';
