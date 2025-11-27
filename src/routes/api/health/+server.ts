import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Health Check Endpoint
 *
 * Returns service health status for monitoring and load balancers.
 * Does not require authentication.
 *
 * GET /api/health
 * Response: { status: 'ok', timestamp: string, uptime: number }
 */

const startTime = Date.now();

export const GET: RequestHandler = async ({ locals: { supabase } }) => {
	const checks: Record<string, 'ok' | 'error'> = {
		server: 'ok'
	};

	// Check database connectivity
	try {
		const { error } = await supabase.from('models').select('model_identifier').limit(1);
		checks.database = error ? 'error' : 'ok';
	} catch {
		checks.database = 'error';
	}

	const allHealthy = Object.values(checks).every((status) => status === 'ok');

	return json(
		{
			status: allHealthy ? 'ok' : 'degraded',
			timestamp: new Date().toISOString(),
			uptime: Math.floor((Date.now() - startTime) / 1000),
			checks
		},
		{
			status: allHealthy ? 200 : 503,
			headers: {
				'Cache-Control': 'no-store'
			}
		}
	);
};
