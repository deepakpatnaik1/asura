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
	 * Chat scrolls continuously for 5 seconds.
	 */
	autoScrollDuration: 5000,

	/**
	 * Auto-scroll pause duration (ms)
	 * After scrolling for 5s, pause for 60s before next scroll.
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
	errorDisplayDuration: 5000
} as const;
