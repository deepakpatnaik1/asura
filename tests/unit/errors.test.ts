import { describe, it, expect } from 'vitest';
import {
	errorResponse,
	unauthorizedError,
	forbiddenError,
	notFoundError,
	validationError,
	rateLimitedError,
	internalError,
	databaseError,
	externalServiceError,
	ERROR_CODES
} from '$lib/api/errors';

describe('errors module', () => {
	describe('ERROR_CODES', () => {
		it('has all expected error codes', () => {
			expect(ERROR_CODES.UNAUTHORIZED).toEqual({ code: 'UNAUTHORIZED', status: 401, message: 'Must be logged in' });
			expect(ERROR_CODES.FORBIDDEN).toEqual({ code: 'FORBIDDEN', status: 403, message: 'Access denied' });
			expect(ERROR_CODES.NOT_FOUND).toEqual({ code: 'NOT_FOUND', status: 404, message: 'Resource not found' });
			expect(ERROR_CODES.VALIDATION_ERROR).toEqual({ code: 'VALIDATION_ERROR', status: 400, message: 'Validation failed' });
			expect(ERROR_CODES.RATE_LIMITED).toEqual({ code: 'RATE_LIMITED', status: 429, message: 'Too many requests' });
			expect(ERROR_CODES.INTERNAL_ERROR).toEqual({ code: 'INTERNAL_ERROR', status: 500, message: 'Internal server error' });
		});
	});

	describe('errorResponse', () => {
		it('creates response with default message', async () => {
			const response = errorResponse('NOT_FOUND');
			expect(response.status).toBe(404);

			const body = await response.json();
			expect(body).toEqual({
				error: {
					message: 'Resource not found',
					code: 'NOT_FOUND'
				}
			});
		});

		it('creates response with custom message', async () => {
			const response = errorResponse('NOT_FOUND', { message: 'Article not found' });
			expect(response.status).toBe(404);

			const body = await response.json();
			expect(body.error.message).toBe('Article not found');
		});

		it('includes optional field', async () => {
			const response = errorResponse('VALIDATION_ERROR', {
				message: 'Invalid email',
				field: 'email'
			});
			const body = await response.json();
			expect(body.error.field).toBe('email');
		});

		it('includes optional details', async () => {
			const response = errorResponse('VALIDATION_ERROR', {
				details: [{ path: 'email', message: 'Invalid' }]
			});
			const body = await response.json();
			expect(body.error.details).toEqual([{ path: 'email', message: 'Invalid' }]);
		});

		it('adds Retry-After header for rate limit', async () => {
			const response = errorResponse('RATE_LIMITED', { retryAfter: 60000 });
			expect(response.headers.get('Retry-After')).toBe('60');
		});
	});

	describe('helper functions', () => {
		it('unauthorizedError returns 401', async () => {
			const response = unauthorizedError();
			expect(response.status).toBe(401);
			const body = await response.json();
			expect(body.error.code).toBe('UNAUTHORIZED');
		});

		it('unauthorizedError accepts custom message', async () => {
			const response = unauthorizedError('Please login first');
			const body = await response.json();
			expect(body.error.message).toBe('Please login first');
		});

		it('forbiddenError returns 403', async () => {
			const response = forbiddenError();
			expect(response.status).toBe(403);
			const body = await response.json();
			expect(body.error.code).toBe('FORBIDDEN');
		});

		it('notFoundError returns 404', async () => {
			const response = notFoundError();
			expect(response.status).toBe(404);
			const body = await response.json();
			expect(body.error.code).toBe('NOT_FOUND');
		});

		it('notFoundError formats resource name', async () => {
			const response = notFoundError('Article');
			const body = await response.json();
			expect(body.error.message).toBe('Article not found');
		});

		it('validationError returns 400 with field', async () => {
			const response = validationError('Invalid email format', 'email');
			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error.code).toBe('VALIDATION_ERROR');
			expect(body.error.message).toBe('Invalid email format');
			expect(body.error.field).toBe('email');
		});

		it('rateLimitedError returns 429 with retry info', async () => {
			const response = rateLimitedError(30000);
			expect(response.status).toBe(429);
			expect(response.headers.get('Retry-After')).toBe('30');
			const body = await response.json();
			expect(body.error.code).toBe('RATE_LIMITED');
			expect(body.error.retryAfter).toBe(30000);
		});

		it('internalError returns 500', async () => {
			const response = internalError();
			expect(response.status).toBe(500);
			const body = await response.json();
			expect(body.error.code).toBe('INTERNAL_ERROR');
		});

		it('internalError accepts custom message', async () => {
			const response = internalError('Unexpected failure');
			const body = await response.json();
			expect(body.error.message).toBe('Unexpected failure');
		});

		it('databaseError returns 500 with DATABASE_ERROR code', async () => {
			const response = databaseError();
			expect(response.status).toBe(500);
			const body = await response.json();
			expect(body.error.code).toBe('DATABASE_ERROR');
		});

		it('externalServiceError returns 502 with service name', async () => {
			const response = externalServiceError('Anthropic');
			expect(response.status).toBe(502);
			const body = await response.json();
			expect(body.error.code).toBe('EXTERNAL_SERVICE_ERROR');
			expect(body.error.message).toBe('Anthropic service error');
		});
	});
});
