/**
 * Standardized API Error Responses
 *
 * Provides consistent error handling across all API endpoints.
 * All endpoints should use these helpers for error responses.
 */

import { json } from '@sveltejs/kit';

// ============================================================================
// Error Interface
// ============================================================================

export interface ApiError {
	error: {
		message: string;
		code: string;
		details?: unknown;
		field?: string;
		retryAfter?: number;
	};
}

// ============================================================================
// Standard Error Codes
// ============================================================================

export const ERROR_CODES = {
	// Authentication & Authorization (4xx)
	UNAUTHORIZED: { code: 'UNAUTHORIZED', status: 401, message: 'Must be logged in' },
	FORBIDDEN: { code: 'FORBIDDEN', status: 403, message: 'Access denied' },

	// Client Errors (4xx)
	BAD_REQUEST: { code: 'BAD_REQUEST', status: 400, message: 'Invalid request' },
	VALIDATION_ERROR: { code: 'VALIDATION_ERROR', status: 400, message: 'Validation failed' },
	INVALID_JSON: { code: 'INVALID_JSON', status: 400, message: 'Invalid JSON in request body' },
	NOT_FOUND: { code: 'NOT_FOUND', status: 404, message: 'Resource not found' },
	CONFLICT: { code: 'CONFLICT', status: 409, message: 'Resource conflict' },
	PAYLOAD_TOO_LARGE: { code: 'PAYLOAD_TOO_LARGE', status: 413, message: 'Request payload too large' },
	RATE_LIMITED: { code: 'RATE_LIMITED', status: 429, message: 'Too many requests' },

	// Server Errors (5xx)
	INTERNAL_ERROR: { code: 'INTERNAL_ERROR', status: 500, message: 'Internal server error' },
	SERVICE_UNAVAILABLE: { code: 'SERVICE_UNAVAILABLE', status: 503, message: 'Service temporarily unavailable' },
	DATABASE_ERROR: { code: 'DATABASE_ERROR', status: 500, message: 'Database operation failed' },
	EXTERNAL_SERVICE_ERROR: { code: 'EXTERNAL_SERVICE_ERROR', status: 502, message: 'External service error' }
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

// ============================================================================
// Error Response Helpers
// ============================================================================

/**
 * Create a standardized error response.
 *
 * @param code - Error code from ERROR_CODES
 * @param options - Optional overrides and additional details
 * @returns JSON Response with consistent error structure
 *
 * @example
 * // Basic usage
 * return errorResponse('NOT_FOUND');
 *
 * // With custom message
 * return errorResponse('NOT_FOUND', { message: 'Article not found' });
 *
 * // With details
 * return errorResponse('VALIDATION_ERROR', {
 *   message: 'Invalid email format',
 *   field: 'email',
 *   details: validationErrors
 * });
 */
export function errorResponse(
	code: ErrorCode,
	options?: {
		message?: string;
		details?: unknown;
		field?: string;
		retryAfter?: number;
	}
): Response {
	const errorDef = ERROR_CODES[code];

	const body: ApiError = {
		error: {
			message: options?.message ?? errorDef.message,
			code: errorDef.code
		}
	};

	if (options?.details !== undefined) {
		body.error.details = options.details;
	}
	if (options?.field !== undefined) {
		body.error.field = options.field;
	}
	if (options?.retryAfter !== undefined) {
		body.error.retryAfter = options.retryAfter;
	}

	const headers: Record<string, string> = {};
	if (options?.retryAfter !== undefined) {
		headers['Retry-After'] = String(Math.ceil(options.retryAfter / 1000));
	}

	return json(body, {
		status: errorDef.status,
		headers: Object.keys(headers).length > 0 ? headers : undefined
	});
}

/**
 * Create a 401 Unauthorized response.
 */
export function unauthorizedError(message?: string): Response {
	return errorResponse('UNAUTHORIZED', { message });
}

/**
 * Create a 403 Forbidden response.
 */
export function forbiddenError(message?: string): Response {
	return errorResponse('FORBIDDEN', { message });
}

/**
 * Create a 404 Not Found response.
 */
export function notFoundError(resource?: string): Response {
	return errorResponse('NOT_FOUND', {
		message: resource ? `${resource} not found` : undefined
	});
}

/**
 * Create a 400 Validation Error response.
 */
export function validationError(message: string, field?: string, details?: unknown): Response {
	return errorResponse('VALIDATION_ERROR', { message, field, details });
}

/**
 * Create a 429 Rate Limited response.
 */
export function rateLimitedError(retryAfterMs: number, message?: string): Response {
	return errorResponse('RATE_LIMITED', {
		message: message ?? `Rate limit exceeded. Try again in ${Math.ceil(retryAfterMs / 1000)} seconds.`,
		retryAfter: retryAfterMs
	});
}

/**
 * Create a 500 Internal Error response.
 * Note: Be careful not to leak sensitive error details to clients.
 */
export function internalError(message?: string): Response {
	return errorResponse('INTERNAL_ERROR', { message });
}

/**
 * Create a 500 Database Error response.
 */
export function databaseError(message?: string): Response {
	return errorResponse('DATABASE_ERROR', { message });
}

/**
 * Create a 502 External Service Error response.
 */
export function externalServiceError(service: string): Response {
	return errorResponse('EXTERNAL_SERVICE_ERROR', {
		message: `${service} service error`
	});
}
