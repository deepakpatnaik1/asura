/**
 * Proxy endpoint for dev sidecar status
 *
 * Forwards requests to the sidecar running on port 5199.
 * This avoids CORS/CSP issues since the browser only talks to same-origin.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const SIDECAR_URL = 'http://localhost:5199';

export const GET: RequestHandler = async () => {
	try {
		const res = await fetch(`${SIDECAR_URL}/status`, {
			signal: AbortSignal.timeout(2000)
		});
		const data = await res.json();

		return json({
			sidecar: true,
			running: data.running,
			ready: data.ready
		});
	} catch {
		// Sidecar not running - user is using npm run dev instead of npm run dev:restart
		return json({
			sidecar: false,
			running: false,
			ready: false
		});
	}
};

export const POST: RequestHandler = async () => {
	try {
		const res = await fetch(`${SIDECAR_URL}/restart`, {
			method: 'POST',
			signal: AbortSignal.timeout(60000)
		});
		const data = await res.json();

		return json({
			success: data.success,
			ready: data.ready
		});
	} catch {
		return json({
			success: false,
			ready: false,
			error: 'Sidecar not available'
		}, { status: 503 });
	}
};
