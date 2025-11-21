import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { createServerClient } from '@supabase/ssr';
import type { Handle } from '@sveltejs/kit';

/**
 * Server-side authentication hook
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
	// Create Supabase client with automatic cookie handling
	event.locals.supabase = createServerClient(
		PUBLIC_SUPABASE_URL,
		PUBLIC_SUPABASE_ANON_KEY,
		{
			cookies: {
				getAll: () => event.cookies.getAll(),
				setAll: (cookiesToSet) => {
					cookiesToSet.forEach(({ name, value, options }) => {
						event.cookies.set(name, value, { ...options, path: '/' });
					});
				}
			}
		}
	);

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

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			// Required for Supabase auth to work correctly
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};
