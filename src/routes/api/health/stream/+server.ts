import type { RequestHandler } from './$types';

/**
 * Health Stream Endpoint (SSE)
 *
 * Persistent connection that sends heartbeats every 5 seconds.
 * Client knows server is dead the instant the connection drops.
 *
 * GET /api/health/stream
 * Response: Server-Sent Events stream
 */

const HEARTBEAT_INTERVAL = 5000;

export const GET: RequestHandler = async ({ locals: { supabase } }) => {
	let interval: ReturnType<typeof setInterval> | null = null;
	let closed = false;
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		start(controller) {
			const sendHeartbeat = async () => {
				// Don't enqueue if stream is closed
				if (closed) return;

				try {
					// Check database connectivity
					const { error } = await supabase.from('models').select('model_identifier').limit(1);
					const status = error ? 'degraded' : 'ok';

					const data = JSON.stringify({
						status,
						timestamp: new Date().toISOString()
					});

					if (!closed) controller.enqueue(encoder.encode(`event: heartbeat\ndata: ${data}\n\n`));
				} catch {
					// Server is alive but DB check failed
					if (closed) return;
					const data = JSON.stringify({
						status: 'degraded',
						timestamp: new Date().toISOString()
					});
					controller.enqueue(encoder.encode(`event: heartbeat\ndata: ${data}\n\n`));
				}
			};

			// Send initial heartbeat immediately
			sendHeartbeat();

			// Then send every 5 seconds
			interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
		},
		cancel() {
			// Client disconnected - clear the interval
			closed = true;
			if (interval) {
				clearInterval(interval);
				interval = null;
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
