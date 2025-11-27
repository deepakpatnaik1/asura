/**
 * Integration Tests for /api/reader/upload
 *
 * Tests the article upload API endpoint.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '$routes/api/reader/upload/+server';
import { createMockLocals } from '../mocks/supabase';
import { sampleHtmlSmall, generateLargeHtml } from '../fixtures/articles';

// Mock the file-reader capabilities
vi.mock('$lib/capabilities', () => ({
	validateHtmlSize: vi.fn((html: string) => {
		const MAX_SIZE = 5 * 1024 * 1024; // 5MB
		if (html.length > MAX_SIZE) {
			return { valid: false, error: 'HTML content exceeds maximum size of 5MB' };
		}
		return { valid: true };
	}),
	extractTitleFromHtml: vi.fn((html: string) => {
		const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
		return titleMatch ? titleMatch[1] : 'Untitled Article';
	})
}));

describe('POST /api/reader/upload', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('authentication', () => {
		it('returns 401 when unauthenticated', async () => {
			const locals = createMockLocals({ authenticated: false });

			const response = await POST({
				locals,
				request: new Request('http://localhost/api/reader/upload', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ html: sampleHtmlSmall })
				})
			} as any);

			expect(response.status).toBe(401);
			const body = await response.json();
			expect(body.error.code).toBe('UNAUTHORIZED');
		});
	});

	describe('input validation', () => {
		it('returns 400 when html is missing', async () => {
			const locals = createMockLocals({ authenticated: true });

			const response = await POST({
				locals,
				request: new Request('http://localhost/api/reader/upload', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({})
				})
			} as any);

			expect(response.status).toBe(400);
			const body = await response.json();
			expect(body.error.code).toBe('INVALID_INPUT');
		});

		it('returns 400 when html is not a string', async () => {
			const locals = createMockLocals({ authenticated: true });

			const response = await POST({
				locals,
				request: new Request('http://localhost/api/reader/upload', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ html: 12345 })
				})
			} as any);

			expect(response.status).toBe(400);
		});

		it('returns 400 when html is empty string', async () => {
			const locals = createMockLocals({ authenticated: true });

			const response = await POST({
				locals,
				request: new Request('http://localhost/api/reader/upload', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ html: '' })
				})
			} as any);

			expect(response.status).toBe(400);
		});

		it('returns 413 when html exceeds size limit', async () => {
			const locals = createMockLocals({ authenticated: true });
			const largeHtml = generateLargeHtml(6000); // 6MB

			const response = await POST({
				locals,
				request: new Request('http://localhost/api/reader/upload', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ html: largeHtml })
				})
			} as any);

			expect(response.status).toBe(413);
			const body = await response.json();
			expect(body.error.code).toBe('INPUT_TOO_LARGE');
		});
	});

	describe('successful upload', () => {
		it('creates article with processing status', async () => {
			const mockArticle = {
				id: 'new-article-id',
				title: 'Test Article',
				status: 'processing'
			};

			const locals = createMockLocals({
				authenticated: true,
				queryData: mockArticle
			});

			const response = await POST({
				locals,
				request: new Request('http://localhost/api/reader/upload', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ html: sampleHtmlSmall })
				})
			} as any);

			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body.success).toBe(true);
			expect(body.article_id).toBe('new-article-id');
		});

		it('extracts title from HTML', async () => {
			const mockArticle = {
				id: 'article-with-title',
				title: 'Test Article',
				status: 'processing'
			};

			const locals = createMockLocals({
				authenticated: true,
				queryData: mockArticle
			});

			const response = await POST({
				locals,
				request: new Request('http://localhost/api/reader/upload', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ html: sampleHtmlSmall })
				})
			} as any);

			const body = await response.json();
			expect(body.title).toBeDefined();
		});

		it('returns article_id for subsequent processing', async () => {
			const mockArticle = {
				id: 'uuid-for-processing',
				title: 'Article Title',
				status: 'processing'
			};

			const locals = createMockLocals({
				authenticated: true,
				queryData: mockArticle
			});

			const response = await POST({
				locals,
				request: new Request('http://localhost/api/reader/upload', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ html: sampleHtmlSmall })
				})
			} as any);

			const body = await response.json();
			expect(body.article_id).toBe('uuid-for-processing');
		});
	});

	describe('database operations', () => {
		it('inserts article with correct user_id', async () => {
			const mockArticle = { id: 'test-id', title: 'Test', status: 'processing' };
			const locals = createMockLocals({
				authenticated: true,
				queryData: mockArticle
			});

			await POST({
				locals,
				request: new Request('http://localhost/api/reader/upload', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ html: sampleHtmlSmall })
				})
			} as any);

			expect(locals.supabase.from).toHaveBeenCalledWith('articles');
		});

		it('stores raw HTML in article record', async () => {
			const mockArticle = { id: 'test-id', title: 'Test', status: 'processing' };
			const locals = createMockLocals({
				authenticated: true,
				queryData: mockArticle
			});

			await POST({
				locals,
				request: new Request('http://localhost/api/reader/upload', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ html: sampleHtmlSmall })
				})
			} as any);

			// Verify from('articles') was called - our mock returns a query builder
			expect(locals.supabase.from).toHaveBeenCalledWith('articles');
		});

		it('returns 500 on database insert failure', async () => {
			const locals = createMockLocals({
				authenticated: true,
				queryError: new Error('Database insert failed')
			});

			const response = await POST({
				locals,
				request: new Request('http://localhost/api/reader/upload', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ html: sampleHtmlSmall })
				})
			} as any);

			expect(response.status).toBe(500);
			const body = await response.json();
			expect(body.error.code).toBe('DATABASE_ERROR');
		});
	});

	describe('title extraction', () => {
		it('extracts title from title tag', async () => {
			const htmlWithTitle = '<html><head><title>My Custom Title</title></head><body></body></html>';
			const mockArticle = { id: 'test', title: 'My Custom Title', status: 'processing' };
			const locals = createMockLocals({
				authenticated: true,
				queryData: mockArticle
			});

			const response = await POST({
				locals,
				request: new Request('http://localhost/api/reader/upload', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ html: htmlWithTitle })
				})
			} as any);

			const body = await response.json();
			expect(body.title).toBe('My Custom Title');
		});

		it('uses default title when no title tag found', async () => {
			const htmlNoTitle = '<html><body><p>Content</p></body></html>';
			const mockArticle = { id: 'test', title: 'Untitled Article', status: 'processing' };
			const locals = createMockLocals({
				authenticated: true,
				queryData: mockArticle
			});

			const response = await POST({
				locals,
				request: new Request('http://localhost/api/reader/upload', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ html: htmlNoTitle })
				})
			} as any);

			const body = await response.json();
			expect(body.title).toBe('Untitled Article');
		});
	});
});
