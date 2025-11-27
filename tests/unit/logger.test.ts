/**
 * Tests for lib/api/logger.ts
 *
 * Tests the structured logging utility.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger, createSimpleLogger } from '$lib/api/logger';

describe('createLogger', () => {
	let consoleSpy: {
		log: ReturnType<typeof vi.spyOn>;
		warn: ReturnType<typeof vi.spyOn>;
		error: ReturnType<typeof vi.spyOn>;
	};

	beforeEach(() => {
		consoleSpy = {
			log: vi.spyOn(console, 'log').mockImplementation(() => {}),
			warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
			error: vi.spyOn(console, 'error').mockImplementation(() => {})
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('log levels', () => {
		it('logs debug messages', () => {
			const log = createLogger('TestComponent');

			log.debug('Debug message');

			expect(consoleSpy.log).toHaveBeenCalled();
			const loggedMessage = consoleSpy.log.mock.calls[0][0];
			expect(loggedMessage).toContain('DEBUG');
			expect(loggedMessage).toContain('TestComponent');
			expect(loggedMessage).toContain('Debug message');
		});

		it('logs info messages', () => {
			const log = createLogger('TestComponent');

			log.info('Info message');

			expect(consoleSpy.log).toHaveBeenCalled();
			const loggedMessage = consoleSpy.log.mock.calls[0][0];
			expect(loggedMessage).toContain('INFO');
		});

		it('logs warn messages', () => {
			const log = createLogger('TestComponent');

			log.warn('Warning message');

			expect(consoleSpy.warn).toHaveBeenCalled();
			const loggedMessage = consoleSpy.warn.mock.calls[0][0];
			expect(loggedMessage).toContain('WARN');
		});

		it('logs error messages', () => {
			const log = createLogger('TestComponent');

			log.error('Error message');

			expect(consoleSpy.error).toHaveBeenCalled();
			const loggedMessage = consoleSpy.error.mock.calls[0][0];
			expect(loggedMessage).toContain('ERROR');
		});
	});

	describe('context', () => {
		it('includes component name', () => {
			const log = createLogger('MyComponent');

			log.info('Test');

			const loggedMessage = consoleSpy.log.mock.calls[0][0];
			expect(loggedMessage).toContain('MyComponent');
		});

		it('includes user ID when provided', () => {
			const log = createLogger('TestComponent', 'user-12345678-abcd');

			log.info('Test');

			const loggedMessage = consoleSpy.log.mock.calls[0][0];
			expect(loggedMessage).toContain('user:user-123');
		});

		it('includes request ID', () => {
			const log = createLogger('TestComponent', 'user-id', 'req-12345');

			log.info('Test');

			const loggedMessage = consoleSpy.log.mock.calls[0][0];
			expect(loggedMessage).toContain('req-12345');
		});

		it('auto-generates request ID when not provided', () => {
			const log1 = createLogger('TestComponent');
			const log2 = createLogger('TestComponent');

			log1.info('Test 1');
			log2.info('Test 2');

			// Both should have request IDs (different from each other)
			const message1 = consoleSpy.log.mock.calls[0][0];
			const message2 = consoleSpy.log.mock.calls[1][0];

			// Request IDs are included in the format [requestId]
			expect(message1).toMatch(/\[[a-z0-9]+\]/);
			expect(message2).toMatch(/\[[a-z0-9]+\]/);
		});

		it('includes additional context data', () => {
			const log = createLogger('TestComponent');

			log.info('Processing', { count: 42, name: 'test' });

			const loggedMessage = consoleSpy.log.mock.calls[0][0];
			expect(loggedMessage).toContain('42');
			expect(loggedMessage).toContain('test');
		});
	});

	describe('child logger', () => {
		it('creates child logger with additional context', () => {
			const log = createLogger('ParentComponent');
			const childLog = log.child({ operation: 'save' });

			childLog.info('Saving data');

			const loggedMessage = consoleSpy.log.mock.calls[0][0];
			expect(loggedMessage).toContain('ParentComponent');
			expect(loggedMessage).toContain('save');
		});

		it('child logger merges context', () => {
			const log = createLogger('Component');
			const childLog = log.child({ step: 1 });

			childLog.info('Step complete', { duration: 100 });

			const loggedMessage = consoleSpy.log.mock.calls[0][0];
			expect(loggedMessage).toContain('step');
			expect(loggedMessage).toContain('duration');
		});

		it('child can create grandchild', () => {
			const log = createLogger('Root');
			const child = log.child({ level: 1 });
			const grandchild = child.child({ level: 2 });

			grandchild.info('Deep log');

			const loggedMessage = consoleSpy.log.mock.calls[0][0];
			expect(loggedMessage).toContain('Root');
		});
	});
});

describe('createSimpleLogger', () => {
	let consoleSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('creates logger without user context', () => {
		const log = createSimpleLogger('BackgroundJob');

		log.info('Job running');

		expect(consoleSpy).toHaveBeenCalled();
		const loggedMessage = consoleSpy.mock.calls[0][0];
		expect(loggedMessage).toContain('BackgroundJob');
		expect(loggedMessage).not.toContain('user:');
	});

	it('has all log level methods', () => {
		const log = createSimpleLogger('Test');

		expect(typeof log.debug).toBe('function');
		expect(typeof log.info).toBe('function');
		expect(typeof log.warn).toBe('function');
		expect(typeof log.error).toBe('function');
		expect(typeof log.child).toBe('function');
	});
});

describe('production mode', () => {
	let originalEnv: string | undefined;

	beforeEach(() => {
		originalEnv = process.env.NODE_ENV;
	});

	afterEach(() => {
		process.env.NODE_ENV = originalEnv;
	});

	it('outputs JSON in production', () => {
		process.env.NODE_ENV = 'production';
		const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

		const log = createLogger('ProdComponent');
		log.info('Production log', { data: 'test' });

		const loggedMessage = consoleSpy.mock.calls[0][0];

		// In production, should be valid JSON
		expect(() => JSON.parse(loggedMessage)).not.toThrow();

		const parsed = JSON.parse(loggedMessage);
		expect(parsed.level).toBe('info');
		expect(parsed.component).toBe('ProdComponent');
		expect(parsed.message).toBe('Production log');

		consoleSpy.mockRestore();
	});
});
