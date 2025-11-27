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
export const personaSchema = z.enum(['gunnar', 'kirby']);

// ============================================================================
// Chat Schemas
// ============================================================================

/** POST /api/chat - Send chat message */
export const chatMessageSchema = z.object({
	message: z.string()
		.min(1, 'Message is required')
		.max(50000, 'Message too long (max 50000 characters)'),
	persona: personaSchema.optional()
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
	selected_conversation_model: z.string().optional(),
	selected_compression_model: z.string().optional(),
	selected_reader_model: z.string().optional(),
	selected_embedding_model: z.string().optional(),
	active_reader_article_id: z.string().uuid().nullable().optional()
}).refine(
	(data) => Object.keys(data).length > 0,
	{ message: 'At least one field must be provided' }
);

// ============================================================================
// Reader Schemas
// ============================================================================

/** POST /api/reader/upload - Upload article HTML */
export const readerUploadSchema = z.object({
	html: z.string()
		.min(1, 'HTML content is required')
		.max(5_000_000, 'HTML too large (max 5MB)')
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

/** POST /api/reader/filter-charts - Filter charts with AI */
export const filterChartsSchema = z.object({
	article_id: uuidSchema
});

/** DELETE /api/reader/articles - Delete an article */
export const deleteArticleSchema = z.object({
	article_id: uuidSchema
});

// ============================================================================
// Validation Helper
// ============================================================================

import { json } from '@sveltejs/kit';

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
			error: json(
				{
					error: {
						message: firstError.message,
						code: 'VALIDATION_ERROR',
						field: firstError.path.join('.') || undefined,
						details: result.error.issues
					}
				},
				{ status: 400 }
			)
		};
	}

	return { success: true, data: result.data };
}
