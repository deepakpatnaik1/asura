/**
 * Safe JSON Parsing Utility
 *
 * Wraps request.json() in try-catch to prevent crashes on malformed input.
 * Returns a tuple of [data, error] for clean error handling.
 */

import { json } from '@sveltejs/kit';

export type ParseResult<T> =
	| { success: true; data: T }
	| { success: false; error: Response };

/**
 * Safely parse JSON from a request body.
 *
 * @param request - The incoming request object
 * @returns ParseResult with either the parsed data or an error response
 *
 * @example
 * const result = await parseRequestJson<{ message: string }>(request);
 * if (!result.success) return result.error;
 * const { message } = result.data;
 */
export async function parseRequestJson<T>(request: Request): Promise<ParseResult<T>> {
	try {
		const data = await request.json();
		return { success: true, data: data as T };
	} catch {
		return {
			success: false,
			error: json(
				{
					error: {
						message: 'Invalid JSON in request body',
						code: 'INVALID_JSON'
					}
				},
				{ status: 400 }
			)
		};
	}
}
