/**
 * Tests for lib/api/parse-json.ts
 *
 * Tests the safe JSON parsing utility that prevents crashes on malformed input.
 */

import { describe, it, expect } from 'vitest';
import { parseRequestJson } from '$lib/api/parse-json';

describe('parseRequestJson', () => {
	describe('valid JSON', () => {
		it('parses valid JSON object', async () => {
			const body = { message: 'Hello', count: 42 };
			const request = new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			const result = await parseRequestJson<typeof body>(request);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.message).toBe('Hello');
				expect(result.data.count).toBe(42);
			}
		});

		it('parses valid JSON array', async () => {
			const body = [1, 2, 3];
			const request = new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			const result = await parseRequestJson<number[]>(request);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toEqual([1, 2, 3]);
			}
		});

		it('parses empty object', async () => {
			const request = new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});

			const result = await parseRequestJson<object>(request);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toEqual({});
			}
		});

		it('parses null value', async () => {
			const request = new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(null)
			});

			const result = await parseRequestJson<null>(request);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toBeNull();
			}
		});

		it('parses nested objects', async () => {
			const body = {
				user: { name: 'Test', settings: { theme: 'dark' } },
				items: [{ id: 1 }, { id: 2 }]
			};
			const request = new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			const result = await parseRequestJson<typeof body>(request);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.user.settings.theme).toBe('dark');
				expect(result.data.items).toHaveLength(2);
			}
		});
	});

	describe('invalid JSON', () => {
		it('returns error for malformed JSON', async () => {
			const request = new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: '{ invalid json }'
			});

			const result = await parseRequestJson(request);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBeInstanceOf(Response);
				expect(result.error.status).toBe(400);

				const errorBody = await result.error.json();
				expect(errorBody.error.code).toBe('INVALID_JSON');
				expect(errorBody.error.message).toBe('Invalid JSON in request body');
			}
		});

		it('returns error for empty body', async () => {
			const request = new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: ''
			});

			const result = await parseRequestJson(request);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.status).toBe(400);
			}
		});

		it('returns error for plain text', async () => {
			const request = new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: 'just plain text'
			});

			const result = await parseRequestJson(request);

			expect(result.success).toBe(false);
		});

		it('returns error for truncated JSON', async () => {
			const request = new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: '{"message": "incomplete'
			});

			const result = await parseRequestJson(request);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.status).toBe(400);
			}
		});

		it('returns error for undefined value (not valid JSON)', async () => {
			const request = new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: 'undefined'
			});

			const result = await parseRequestJson(request);

			expect(result.success).toBe(false);
		});
	});

	describe('edge cases', () => {
		it('handles special characters in strings', async () => {
			const body = { text: 'Hello "world" with \n newlines and \t tabs' };
			const request = new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			const result = await parseRequestJson<typeof body>(request);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.text).toContain('newlines');
			}
		});

		it('handles unicode characters', async () => {
			const body = { emoji: '🎉', japanese: '日本語' };
			const request = new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			const result = await parseRequestJson<typeof body>(request);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.emoji).toBe('🎉');
				expect(result.data.japanese).toBe('日本語');
			}
		});

		it('handles large numbers', async () => {
			const body = { big: 9007199254740991, negative: -9007199254740991 };
			const request = new Request('http://localhost', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			const result = await parseRequestJson<typeof body>(request);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.big).toBe(9007199254740991);
			}
		});
	});
});
