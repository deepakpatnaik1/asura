/**
 * Authentication Utility
 *
 * Extracts common auth check pattern used across API routes.
 * Returns either the authenticated user or an error response.
 */

import type { Session, User } from '@supabase/supabase-js';
import { unauthorizedError } from './errors';

type SafeGetSession = () => Promise<{ session: Session | null; user: User | null }>;

export type AuthResult =
	| { success: true; user: User; userId: string }
	| { success: false; error: Response };

/**
 * Check authentication and return user or error response.
 *
 * @param safeGetSession - The safeGetSession function from locals
 * @returns AuthResult with either the user or an error response
 *
 * @example
 * const auth = await requireAuth(safeGetSession);
 * if (!auth.success) return auth.error;
 * const { user, userId } = auth;
 */
export async function requireAuth(safeGetSession: SafeGetSession): Promise<AuthResult> {
	const { user } = await safeGetSession();

	if (!user) {
		return {
			success: false,
			error: unauthorizedError('Unauthorized - must be logged in')
		};
	}

	return {
		success: true,
		user,
		userId: user.id
	};
}
