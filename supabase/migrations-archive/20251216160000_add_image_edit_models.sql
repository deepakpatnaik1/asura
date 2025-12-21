-- Add instruction-based image editing models for R8 (character consistency)
-- These models take a source image + text instruction and output an edited image

-- Z-Image Turbo img2img - Fast, cheap, NSFW capable (enable_safety_checker: false)
INSERT INTO models (model_identifier, model_name, provider, model_type, cost_per_image, is_active, context_window, input_price_per_million, output_price_per_million, supports_tool_calling)
VALUES ('fal-ai/z-image/turbo/image-to-image', 'Z-Image Turbo', 'fal', 'image_edit', 0.005, true, 0, 0, 0, false)
ON CONFLICT (model_identifier) DO NOTHING;

-- FLUX Dev img2img - Higher quality, NSFW capable (enable_safety_checker: false)
INSERT INTO models (model_identifier, model_name, provider, model_type, cost_per_image, is_active, context_window, input_price_per_million, output_price_per_million, supports_tool_calling)
VALUES ('fal-ai/flux/dev/image-to-image', 'FLUX Dev img2img', 'fal', 'image_edit', 0.025, true, 0, 0, 0, false)
ON CONFLICT (model_identifier) DO NOTHING;

-- FLUX Kontext Dev - Character consistency focused, NSFW status unclear
INSERT INTO models (model_identifier, model_name, provider, model_type, cost_per_image, is_active, context_window, input_price_per_million, output_price_per_million, supports_tool_calling)
VALUES ('fal-ai/flux-kontext/dev', 'FLUX Kontext Dev', 'fal', 'image_edit', 0.025, true, 0, 0, 0, false)
ON CONFLICT (model_identifier) DO NOTHING;

-- FLUX Kontext Max - Premium character consistency
INSERT INTO models (model_identifier, model_name, provider, model_type, cost_per_image, is_active, context_window, input_price_per_million, output_price_per_million, supports_tool_calling)
VALUES ('fal-ai/flux-pro/kontext/max', 'FLUX Kontext Max', 'fal', 'image_edit', 0.080, true, 0, 0, 0, false)
ON CONFLICT (model_identifier) DO NOTHING;
