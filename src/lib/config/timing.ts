/**
 * Timing Configuration
 *
 * Centralized constants for UI countdowns, SSE heartbeats, auto-scroll,
 * cleanup delays, and error display.
 */

export const TIMING = {
	/**
	 * Countdown duration for destructive actions (ms)
	 * Used for nuke button, file delete, message delete.
	 */
	countdownDuration: 3000,

	/**
	 * SSE heartbeat interval (ms)
	 * Server sends heartbeat every 30s to keep connection alive.
	 */
	heartbeatInterval: 30000,

	/**
	 * Auto-scroll active phase duration (ms)
	 * Scrolls continuously for 30 seconds.
	 */
	autoScrollDuration: 30000,

	/**
	 * Auto-scroll pause duration (ms)
	 * Pause for 60s, then scroll for 30s, repeat.
	 */
	autoScrollPause: 60000,

	/**
	 * SSE subscription cleanup delay (ms)
	 * Wait 5s before cleaning up Supabase subscription when all clients disconnect.
	 * Debounces rapid disconnect/reconnect cycles.
	 */
	cleanupDelay: 5000,

	/**
	 * Error message display duration (ms)
	 * Error messages auto-clear after 5 seconds.
	 */
	errorDisplayDuration: 5000,

	/**
	 * AI streaming timeout (ms)
	 * Maximum time to wait for AI response chunks before aborting.
	 * Prevents indefinite hangs on slow/stalled connections.
	 */
	streamingTimeout: 120_000 // 2 minutes
} as const;
