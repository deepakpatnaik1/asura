/**
 * API Versioning Strategy
 *
 * Provides utilities for API versioning to prepare for future breaking changes.
 *
 * Versioning approaches supported:
 * 1. Header-based: Accept: application/vnd.asura.v1+json
 * 2. URL-based: /api/v1/chat (future consideration)
 *
 * Current version: 1 (no version header = v1)
 */

/**
 * Current API version
 */
export const CURRENT_API_VERSION = 1;

/**
 * Minimum supported API version
 */
export const MIN_SUPPORTED_VERSION = 1;

/**
 * Maximum supported API version
 */
export const MAX_SUPPORTED_VERSION = 1;

/**
 * Extract API version from request headers.
 *
 * Looks for version in Accept header:
 * - `application/vnd.asura.v1+json` -> version 1
 * - `application/vnd.asura.v2+json` -> version 2
 *
 * If no version specified, returns CURRENT_API_VERSION.
 *
 * @param request - The incoming request
 * @returns The requested API version number
 *
 * @example
 * const version = getApiVersion(request);
 * if (version === 1) {
 *   // Handle v1 request format
 * } else if (version === 2) {
 *   // Handle v2 request format
 * }
 */
export function getApiVersion(request: Request): number {
	const accept = request.headers.get('accept') || '';
	const match = accept.match(/vnd\.asura\.v(\d+)/);

	if (match) {
		const requestedVersion = parseInt(match[1], 10);
		// Clamp to supported range
		return Math.min(Math.max(requestedVersion, MIN_SUPPORTED_VERSION), MAX_SUPPORTED_VERSION);
	}

	return CURRENT_API_VERSION;
}

/**
 * Check if a specific API version is supported.
 *
 * @param version - The version to check
 * @returns True if the version is supported
 */
export function isVersionSupported(version: number): boolean {
	return version >= MIN_SUPPORTED_VERSION && version <= MAX_SUPPORTED_VERSION;
}

/**
 * Get the API version response header value.
 * Include this header in responses to inform clients of the version used.
 *
 * @param version - The version used to process the request
 * @returns Header value for X-API-Version
 */
export function getVersionHeader(version: number): string {
	return `v${version}`;
}

/**
 * Create version-aware response headers.
 * Adds X-API-Version header to response.
 *
 * @param version - The API version used
 * @param additionalHeaders - Any additional headers to include
 * @returns Headers object with version information
 */
export function createVersionedHeaders(
	version: number,
	additionalHeaders?: Record<string, string>
): Record<string, string> {
	return {
		'X-API-Version': getVersionHeader(version),
		...additionalHeaders
	};
}

/**
 * Deprecation warning header value.
 * Use when a version or endpoint is deprecated.
 *
 * @param message - The deprecation message
 * @param sunsetDate - Optional date when the feature will be removed
 * @returns Header value for Deprecation header
 */
export function getDeprecationHeader(message: string, sunsetDate?: Date): string {
	if (sunsetDate) {
		return `${message}; sunset=${sunsetDate.toISOString()}`;
	}
	return message;
}
