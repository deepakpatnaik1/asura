/**
 * Structured Logger
 *
 * Provides structured logging with user context for multi-user debugging.
 * Outputs JSON in production for log aggregation services.
 *
 * Usage:
 *   const log = createLogger('ChatAPI', userId);
 *   log.info('Processing message', { messageLength: 100 });
 *   log.error('Failed to save', { error: err.message });
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
	[key: string]: unknown;
}

interface LogEntry {
	timestamp: string;
	level: LogLevel;
	component: string;
	message: string;
	userId?: string;
	requestId?: string;
	context?: LogContext;
}

// Generate a short request ID for tracing
function generateRequestId(): string {
	return Math.random().toString(36).substring(2, 10);
}

// Format log entry based on environment
function formatLog(entry: LogEntry): string {
	// In production, output JSON for log aggregation
	if (process.env.NODE_ENV === 'production') {
		return JSON.stringify(entry);
	}

	// In development, output human-readable format
	const { timestamp, level, component, message, userId, requestId, context } = entry;
	const levelColors: Record<LogLevel, string> = {
		debug: '\x1b[36m', // cyan
		info: '\x1b[32m', // green
		warn: '\x1b[33m', // yellow
		error: '\x1b[31m' // red
	};
	const reset = '\x1b[0m';
	const color = levelColors[level];

	let output = `${color}[${level.toUpperCase()}]${reset} [${component}]`;
	if (requestId) output += ` [${requestId}]`;
	if (userId) output += ` [user:${userId.substring(0, 8)}]`;
	output += ` ${message}`;

	if (context && Object.keys(context).length > 0) {
		output += ` ${JSON.stringify(context)}`;
	}

	return output;
}

// Log output function (can be replaced with external service)
function outputLog(entry: LogEntry): void {
	const formatted = formatLog(entry);

	switch (entry.level) {
		case 'error':
			console.error(formatted);
			break;
		case 'warn':
			console.warn(formatted);
			break;
		default:
			console.log(formatted);
	}
}

export interface Logger {
	debug: (message: string, context?: LogContext) => void;
	info: (message: string, context?: LogContext) => void;
	warn: (message: string, context?: LogContext) => void;
	error: (message: string, context?: LogContext) => void;
	/** Create a child logger with additional context */
	child: (additionalContext: LogContext) => Logger;
}

/**
 * Create a logger instance for a component
 *
 * @param component - Name of the component/endpoint (e.g., 'ChatAPI', 'ReaderChat')
 * @param userId - Optional user ID for request context
 * @param requestId - Optional request ID for tracing (auto-generated if not provided)
 */
export function createLogger(component: string, userId?: string, requestId?: string): Logger {
	const reqId = requestId || generateRequestId();

	const log = (level: LogLevel, message: string, context?: LogContext): void => {
		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level,
			component,
			message,
			userId,
			requestId: reqId,
			context
		};
		outputLog(entry);
	};

	return {
		debug: (message: string, context?: LogContext) => log('debug', message, context),
		info: (message: string, context?: LogContext) => log('info', message, context),
		warn: (message: string, context?: LogContext) => log('warn', message, context),
		error: (message: string, context?: LogContext) => log('error', message, context),
		child: (additionalContext: LogContext) => {
			// Returns a new logger that includes the additional context in all logs
			const childLog = (level: LogLevel, message: string, context?: LogContext): void => {
				log(level, message, { ...additionalContext, ...context });
			};
			return {
				debug: (message: string, context?: LogContext) => childLog('debug', message, context),
				info: (message: string, context?: LogContext) => childLog('info', message, context),
				warn: (message: string, context?: LogContext) => childLog('warn', message, context),
				error: (message: string, context?: LogContext) => childLog('error', message, context),
				child: (moreContext: LogContext) => createLogger(component, userId, reqId).child({ ...additionalContext, ...moreContext })
			};
		}
	};
}

/**
 * Create a simple logger without user context (for non-request code)
 */
export function createSimpleLogger(component: string): Logger {
	return createLogger(component);
}
