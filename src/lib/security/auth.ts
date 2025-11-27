import { json } from '@sveltejs/kit';
import type { User } from '@supabase/supabase-js';

/**
 * Authentication result from requireAuth
 */
export interface AuthResult {
	user: User;
	userId: string;
}

/**
 * Error response for unauthorized requests
 */
export const UNAUTHORIZED_RESPONSE = json(
	{
		error: {
			message: 'Unauthorized - must be logged in',
			code: 'UNAUTHORIZED'
		}
	},
	{ status: 401 }
);

/**
 * Require authentication for API routes.
 *
 * Usage:
 * ```ts
 * const auth = await requireAuth(safeGetSession);
 * if (!auth) return UNAUTHORIZED_RESPONSE;
 * const { userId } = auth;
 * ```
 *
 * @param safeGetSession - The safeGetSession function from event.locals
 * @returns AuthResult if authenticated, null if not
 */
export async function requireAuth(
	safeGetSession: () => Promise<{ user: User | null; session: unknown }>
): Promise<AuthResult | null> {
	const { user } = await safeGetSession();

	if (!user) {
		return null;
	}

	return {
		user,
		userId: user.id
	};
}
