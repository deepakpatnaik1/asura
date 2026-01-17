import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { createServerClient } from '@supabase/ssr';
import type { Handle } from '@sveltejs/kit';
import { validateCsrf, requiresCsrfProtection } from '$lib/api/csrf';
import { startScanWatcher } from '$lib/api/scan-tools';

// ============================================================================
// Initialize background services (run once on server start)
// ============================================================================
let scanWatcherInitialized = false;

function initializeBackgroundServices() {
	if (scanWatcherInitialized) return;
	scanWatcherInitialized = true;

	// Start watching /Users/d.patnaik/paper-scans for new PDFs
	try {
		startScanWatcher();
		console.log('[Hooks] Scan watcher started');
	} catch (error) {
		console.error('[Hooks] Failed to start scan watcher:', error);
	}
}

// Initialize on module load
initializeBackgroundServices();

/**
 * Hardcoded user for localhost-only single-user mode.
 * No Google OAuth needed — app is local development tool only.
 */
const LOCALHOST_USER = {
	id: '8288224b-40c0-41e3-aa30-5bd704533524',
	email: 'boss@localhost',
	app_metadata: {},
	user_metadata: {},
	aud: 'authenticated',
	created_at: '2024-01-01T00:00:00.000Z'
} as const;

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
					try {
						event.cookies.set(name, value, { ...options, path: '/' });
					} catch {
						// Ignore cookie errors during SSE streaming
						// This happens when Supabase auth tries to refresh tokens mid-stream
					}
				});
			}
		}
	});

	/**
	 * Localhost-only mode: Always return hardcoded user.
	 * No OAuth, no session validation — single-user local tool.
	 */
	event.locals.safeGetSession = async () => {
		// Always authenticated as the localhost user
		return {
			session: { user: LOCALHOST_USER } as any,
			user: LOCALHOST_USER as any
		};
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
			`img-src 'self' data: https: blob:${isLocalDev ? ' http://localhost:54321 http://localhost:* http://127.0.0.1:*' : ''}`,
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
