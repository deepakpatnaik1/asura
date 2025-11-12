/**
 * Sample Test
 *
 * This test verifies that the test infrastructure is working correctly.
 * It should be deleted once real tests are written.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { wait, generateTestId } from '../helpers/test-utils';
import { createMockEmbedding } from '../mocks/voyage.mock';
import { createMockTextFile } from '../fixtures/files.fixture';

describe('Test Infrastructure', () => {
	describe('Basic Test Functionality', () => {
		it('should run a simple test', () => {
			expect(true).toBe(true);
		});

		it('should have access to test helpers', async () => {
			const testId = generateTestId('test');
			expect(testId).toMatch(/^test-[a-z0-9]+$/);

			await wait(10);
			expect(true).toBe(true);
		});

		it('should have access to mock factories', () => {
			const embedding = createMockEmbedding();
			expect(embedding).toHaveLength(1024);
			expect(embedding[0]).toBeTypeOf('number');
		});

		it('should have access to test fixtures', () => {
			const file = createMockTextFile('test.txt', 'Hello world');
			expect(file.name).toBe('test.txt');
			expect(file.type).toBe('text/plain');
		});
	});

	describe('Environment Variables', () => {
		it('should have test environment variables set', () => {
			expect(process.env.PUBLIC_SUPABASE_URL).toBe('https://test.supabase.co');
			expect(process.env.VOYAGE_API_KEY).toBe('test-voyage-key');
			expect(process.env.FIREWORKS_API_KEY).toBe('test-fireworks-key');
		});
	});

	describe('Test Lifecycle Hooks', () => {
		let counter: number;

		beforeEach(() => {
			counter = 0;
		});

		afterEach(() => {
			counter = 0;
		});

		it('should reset counter before each test', () => {
			expect(counter).toBe(0);
			counter++;
		});

		it('should have reset counter from previous test', () => {
			expect(counter).toBe(0);
		});
	});

	describe('Async Tests', () => {
		it('should handle async/await', async () => {
			const result = await Promise.resolve('success');
			expect(result).toBe('success');
		});

		it('should handle promise rejection', async () => {
			await expect(Promise.reject(new Error('test error'))).rejects.toThrow('test error');
		});
	});
});
