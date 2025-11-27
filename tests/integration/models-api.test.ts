/**
 * Integration Tests for /api/models
 *
 * Tests the models catalog API endpoint.
 * Uses mocked Supabase client to test endpoint logic in isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockLocals } from '../mocks/supabase';

// Dynamically import the server module to avoid type generation issues
const { GET } = await import('../../src/routes/api/models/+server');

const mockModels = [
	{
		model_name: 'Claude Sonnet 4.5',
		model_identifier: 'claude-sonnet-4-5-20250929',
		provider: 'anthropic',
		model_type: 'chat',
		context_window: 200000,
		input_price_per_million: 3.0,
		output_price_per_million: 15.0
	},
	{
		model_name: 'Claude Haiku 3.5',
		model_identifier: 'claude-haiku-3-5-20241022',
		provider: 'anthropic',
		model_type: 'chat',
		context_window: 200000,
		input_price_per_million: 0.8,
		output_price_per_million: 4.0
	}
];

describe('GET /api/models', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('authentication', () => {
		it('returns 401 when unauthenticated', async () => {
			const locals = createMockLocals({ authenticated: false });

			const response = await GET({
				locals,
				request: new Request('http://localhost/api/models')
			} as any);

			expect(response.status).toBe(401);
			const body = await response.json();
			expect(body.error.code).toBe('UNAUTHORIZED');
		});
	});

	describe('models retrieval', () => {
		it('returns models array when authenticated', async () => {
			const locals = createMockLocals({
				authenticated: true,
				queryData: mockModels
			});

			const response = await GET({
				locals,
				request: new Request('http://localhost/api/models')
			} as any);

			expect(response.status).toBe(200);
			const body = await response.json();
			// API returns array directly, not {models: [...]}
			expect(Array.isArray(body)).toBe(true);
		});

		it('returns all model fields', async () => {
			const locals = createMockLocals({
				authenticated: true,
				queryData: mockModels
			});

			const response = await GET({
				locals,
				request: new Request('http://localhost/api/models')
			} as any);

			const body = await response.json();
			const model = body[0];

			expect(model.model_name).toBeDefined();
			expect(model.model_identifier).toBeDefined();
			expect(model.provider).toBeDefined();
			expect(model.context_window).toBeDefined();
		});

		it('queries the models table', async () => {
			const locals = createMockLocals({
				authenticated: true,
				queryData: mockModels
			});

			await GET({
				locals,
				request: new Request('http://localhost/api/models')
			} as any);

			expect(locals.supabase.from).toHaveBeenCalledWith('models');
		});

		it('returns empty array when no models', async () => {
			const locals = createMockLocals({
				authenticated: true,
				queryData: []
			});

			const response = await GET({
				locals,
				request: new Request('http://localhost/api/models')
			} as any);

			const body = await response.json();
			expect(body).toEqual([]);
		});
	});

	describe('caching', () => {
		it('includes cache headers', async () => {
			const locals = createMockLocals({
				authenticated: true,
				queryData: mockModels
			});

			const response = await GET({
				locals,
				request: new Request('http://localhost/api/models')
			} as any);

			const cacheControl = response.headers.get('Cache-Control');
			expect(cacheControl).toBeDefined();
			expect(cacheControl).toContain('max-age=300');
		});
	});

	describe('error handling', () => {
		it('returns 500 on database error', async () => {
			const locals = createMockLocals({
				authenticated: true,
				queryError: new Error('Database connection failed')
			});

			const response = await GET({
				locals,
				request: new Request('http://localhost/api/models')
			} as any);

			expect(response.status).toBe(500);
		});
	});
});
