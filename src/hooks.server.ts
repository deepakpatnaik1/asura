import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { createServerClient } from '@supabase/ssr';
import type { Handle } from '@sveltejs/kit';
import { validateCsrf, requiresCsrfProtection } from '$lib/api/csrf';

/**
 * Server-side authentication hook with security hardening
 *
 * Security features:
 * - CSRF protection for state-changing requests (POST, PUT, PATCH, DELETE)
 * - Security headers (CSP, X-Frame-Options, etc.)
 * - Session-scoped Supabase client with RLS
 *
 * IMPORTANT: Uses PUBLIC_SUPABASE_ANON_KEY (NOT SERVICE_ROLE_KEY)
 * - ANON_KEY respects Row-Level Security (RLS) policies
 * - SERVICE_ROLE_KEY bypasses RLS (only for admin/background jobs)
 *
 * RLS Status: ✅ ENABLED (migration 20251121120000_enable_rls_for_multiuser.sql)
 * - Database-level security enforces user data isolation
 * - Users can only see/modify their own data
 * - All users can read models catalog (read-only)
 * - Service role bypasses RLS for admin operations
 */
export const handle: Handle = async ({ event, resolve }) => {
	// =========================================================================
	// CSRF Protection for state-changing requests
	// =========================================================================
	if (requiresCsrfProtection(event.request.method)) {
		// Skip CSRF for auth callbacks (they come from OAuth providers)
		const isAuthCallback = event.url.pathname.startsWith('/auth/');

		if (!isAuthCallback) {
			const csrf = validateCsrf(event.request);
			if (!csrf.valid) {
				return csrf.error;
			}
		}
	}

	// =========================================================================
	// Supabase Client Setup
	// =========================================================================
	event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookiesToSet) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					event.cookies.set(name, value, { ...options, path: '/' });
				});
			}
		}
	});

	/**
	 * Safe session retrieval with JWT validation
	 * Calls getUser() to verify JWT is valid before returning session
	 */
	event.locals.safeGetSession = async () => {
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();

		if (!session) {
			return { session: null, user: null };
		}

		const {
			data: { user },
			error
		} = await event.locals.supabase.auth.getUser();

		if (error) {
			// JWT invalid or expired
			return { session: null, user: null };
		}

		return { session, user };
	};

	// =========================================================================
	// Resolve with Security Headers
	// =========================================================================
	const response = await resolve(event, {
		filterSerializedResponseHeaders(name) {
			// Required for Supabase auth to work correctly
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});

	// Add security headers to all responses
	// These headers protect against common web vulnerabilities

	// Prevent clickjacking attacks
	response.headers.set('X-Frame-Options', 'DENY');

	// Prevent MIME type sniffing
	response.headers.set('X-Content-Type-Options', 'nosniff');

	// Control referrer information sent with requests
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

	// Only allow HTTPS in production (HSTS)
	// Note: Only set this in production after confirming HTTPS works correctly
	if (event.url.protocol === 'https:') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}

	// Permissions Policy - restrict sensitive browser features
	response.headers.set(
		'Permissions-Policy',
		'camera=(), microphone=(), geolocation=(), payment=()'
	);

	// Content Security Policy
	// Note: Inline scripts/styles are allowed for SvelteKit compatibility
	// In production, consider using nonces or hashes for stricter CSP
	const isLocalDev = PUBLIC_SUPABASE_URL.includes('localhost');
	response.headers.set(
		'Content-Security-Policy',
		[
			"default-src 'self'",
			"script-src 'self' 'unsafe-inline' https://accounts.google.com",
			"style-src 'self' 'unsafe-inline'",
			// Allow local Supabase storage in dev, HTTPS in prod
			`img-src 'self' data: https: blob:${isLocalDev ? ' http://localhost:54321' : ''}`,
			"font-src 'self'",
			`connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://api.voyageai.com${isLocalDev ? ' http://localhost:54321' : ''}`,
			"frame-src https://accounts.google.com",
			"frame-ancestors 'none'",
			"form-action 'self'",
			"base-uri 'self'"
		].join('; ')
	);

	return response;
};
