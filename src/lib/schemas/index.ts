/**
 * Zod Validation Schemas
 *
 * Centralized input validation schemas for all API endpoints.
 * All POST/PUT/DELETE endpoints should use these schemas.
 */

import { z } from 'zod';

// ============================================================================
// Common Validators
// ============================================================================

/** UUID v4 format validator */
export const uuidSchema = z.string().uuid('Invalid ID format');

/** Non-empty string validator */
export const nonEmptyString = z.string().min(1, 'Required');

/** Persona enum (allowed values) */
export const personaSchema = z.enum(['gunnar', 'kirby', 'samara', 'alicja', 'eva', 'ananya']);

/** Override key enum (personas + processor types for model overrides) */
export const overrideKeySchema = z.enum([
	'gunnar', 'kirby', 'samara', 'alicja', 'eva', 'ananya', // Personas
	'embeddings', 'compression', 'chat_compression', // Text processes
	'tool_calling', 'image_gen', 'image_edit', // Eva pipeline
	'comment_generator' // Ananya pipeline
]);

// ============================================================================
// Chat Schemas
// ============================================================================

/** Chart source type for chat mode */
export const chartSourceSchema = z.enum(['file', 'superjournal']);

/** POST /api/chat - Send chat message */
export const chatMessageSchema = z.object({
	message: z.string()
		.min(1, 'Message is required')
		.max(50000, 'Message too long (max 50000 characters)'),
	persona: personaSchema.optional(),
	chart_id: z.string().uuid().optional(),
	chart_source: chartSourceSchema.optional(),
	article_ids: z.array(z.string().uuid()).optional(), // active article(s) for context injection
	whiteboard_ids: z.array(z.string().uuid()).optional(), // selected whiteboards for Gunnar context
	canvas_ids: z.array(z.string().uuid()).optional() // selected designer canvases for Eva context
});

/** POST /api/chat/compress - Orphan recovery compression */
export const compressSchema = z.object({
	superjournal_id: uuidSchema,
	user_message: nonEmptyString,
	ai_response: nonEmptyString,
	persona_name: nonEmptyString
});

// ============================================================================
// Settings Schemas
// ============================================================================

/** PUT /api/settings - Update user settings */
export const settingsUpdateSchema = z.object({
	// Core settings
	default_model: z.string().optional(),
	active_content_id: z.string().uuid().nullable().optional(),
	selected_persona: personaSchema.optional(),

	// Persona model overrides
	model_gunnar: z.string().nullable().optional(),
	model_kirby: z.string().nullable().optional(),
	model_samara: z.string().nullable().optional(),
	model_alicja: z.string().nullable().optional(),
	model_eva: z.string().nullable().optional(),
	model_ananya: z.string().nullable().optional(),

	// Process model overrides
	model_embeddings: z.string().nullable().optional(),
	model_compression: z.string().nullable().optional(),
	model_chat_compression: z.string().nullable().optional(),
	model_character_planning: z.string().nullable().optional(),
	model_image_gen: z.string().nullable().optional(),
	model_image_edit: z.string().nullable().optional(),

	// Per-persona uncensored compression flags
	compression_uncensored_gunnar: z.boolean().optional(),
	compression_uncensored_kirby: z.boolean().optional(),
	compression_uncensored_samara: z.boolean().optional(),
	compression_uncensored_alicja: z.boolean().optional(),
	compression_uncensored_eva: z.boolean().optional(),
	compression_uncensored_ananya: z.boolean().optional(),

	// Live-linked article watch state
	watched_article_id: z.string().uuid().nullable().optional(),

	// Focus mode persistence
	focused_message_id: z.string().uuid().nullable().optional()
}).refine(
	(data) => Object.keys(data).length > 0,
	{ message: 'At least one field must be provided' }
);

// ============================================================================
// Reader Schemas
// ============================================================================

/** POST /api/reader/upload - Upload article content */
export const readerUploadSchema = z.object({
	content: z.string()
		.min(1, 'Content is required')
		.max(5_000_000, 'Content too large (max 5MB)'),
	persistent: z.boolean().optional().default(false)
});

/** POST /api/reader/process-article - Process article with AI */
export const processArticleSchema = z.object({
	article_id: uuidSchema
});

/** POST /api/reader/chat - Reader follow-up question */
export const readerChatSchema = z.object({
	article_id: uuidSchema,
	message: z.string()
		.min(1, 'Message is required')
		.max(10000, 'Message too long (max 10000 characters)'),
	chart_index: z.number().int().min(0).nullable().optional()
});

/** POST /api/reader/extract-images - Extract images from HTML */
export const extractImagesSchema = z.object({
	article_id: uuidSchema,
	html: z.string()
		.min(1, 'HTML content is required')
		.max(5_000_000, 'HTML too large (max 5MB)')
});

/** DELETE /api/reader/articles - Delete an article */
export const deleteArticleSchema = z.object({
	article_id: uuidSchema
});

// ============================================================================
// Validation Helper
// ============================================================================

import { validationError } from '$lib/api/errors';

export interface ValidationResult<T> {
	success: true;
	data: T;
}

export interface ValidationError {
	success: false;
	error: Response;
}

/**
 * Validate request data against a Zod schema.
 * Returns a discriminated union for type-safe handling.
 *
 * @example
 * const validation = validateSchema(chatMessageSchema, data);
 * if (!validation.success) return validation.error;
 * const { message, persona } = validation.data;
 */
export function validateSchema<T>(
	schema: z.ZodSchema<T>,
	data: unknown
): ValidationResult<T> | ValidationError {
	const result = schema.safeParse(data);

	if (!result.success) {
		const firstError = result.error.issues[0];
		return {
			success: false,
			error: validationError(
				firstError.message,
				firstError.path.join('.') || undefined,
				result.error.issues
			)
		};
	}

	return { success: true, data: result.data };
}
