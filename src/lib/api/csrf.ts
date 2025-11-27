/**
 * CSRF Protection Utility
 *
 * Validates that state-changing requests originate from the same site.
 * Uses Origin header validation (standard CSRF protection technique).
 */

import { json } from '@sveltejs/kit';

export interface CsrfResult {
	valid: true;
}

export interface CsrfError {
	valid: false;
	error: Response;
}

/**
 * Validate that the request originates from the same site.
 * Checks Origin header against Host header.
 *
 * @param request - The incoming request
 * @returns CsrfResult if valid, CsrfError if invalid
 *
 * @example
 * const csrf = validateCsrf(request);
 * if (!csrf.valid) return csrf.error;
 */
export function validateCsrf(request: Request): CsrfResult | CsrfError {
	const origin = request.headers.get('origin');
	const host = request.headers.get('host');

	// Same-origin requests (no Origin header) are allowed
	// This happens for GET requests and same-origin POST requests in some browsers
	if (!origin) {
		return { valid: true };
	}

	// Must have host header for comparison
	if (!host) {
		return {
			valid: false,
			error: json(
				{
					error: {
						message: 'Missing host header',
						code: 'CSRF_ERROR'
					}
				},
				{ status: 403 }
			)
		};
	}

	// Extract hostname from origin (handles http://localhost:5173 -> localhost:5173)
	let originHost: string;
	try {
		originHost = new URL(origin).host;
	} catch {
		return {
			valid: false,
			error: json(
				{
					error: {
						message: 'Invalid origin header',
						code: 'CSRF_ERROR'
					}
				},
				{ status: 403 }
			)
		};
	}

	// Compare origin host with request host
	if (originHost !== host) {
		return {
			valid: false,
			error: json(
				{
					error: {
						message: 'Cross-origin request blocked',
						code: 'CSRF_ERROR'
					}
				},
				{ status: 403 }
			)
		};
	}

	return { valid: true };
}

/**
 * List of HTTP methods that change state and require CSRF protection.
 */
export const STATE_CHANGING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Check if a request method requires CSRF protection.
 */
export function requiresCsrfProtection(method: string): boolean {
	return STATE_CHANGING_METHODS.includes(method.toUpperCase());
}
