/**
 * Hosted Supabase client for cross-device features
 *
 * Used for features that need to work across devices:
 * - Felix cron triggers (Edge Function writes, Aether reads)
 * - Gmail push notifications
 *
 * Separate from local Supabase which stores user data and tokens.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

let hostedClient: SupabaseClient | null = null;

/**
 * Get hosted Supabase client (singleton)
 * @throws Error if environment variables not configured
 */
export function getHostedSupabase(): SupabaseClient {
	if (hostedClient) return hostedClient;

	const url = env.HOSTED_SUPABASE_URL;
	const key = env.HOSTED_SUPABASE_SERVICE_KEY;

	if (!url || !key) {
		throw new Error(
			'HOSTED_SUPABASE_URL and HOSTED_SUPABASE_SERVICE_KEY must be configured'
		);
	}

	hostedClient = createClient(url, key);
	return hostedClient;
}

/**
 * Check if hosted Supabase is configured
 */
export function isHostedSupabaseConfigured(): boolean {
	return !!(env.HOSTED_SUPABASE_URL && env.HOSTED_SUPABASE_SERVICE_KEY);
}
