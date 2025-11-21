/**
 * Admin Supabase client for server-side background jobs
 *
 * IMPORTANT: Uses SERVICE_ROLE_KEY which BYPASSES Row-Level Security (RLS)
 * - Only use for background jobs and admin operations
 * - Never expose this client to the browser
 * - For user-facing operations, use locals.supabase from hooks.server.ts
 */

import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

if (!PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
	throw new Error('Missing Supabase environment variables for admin client');
}

export const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
