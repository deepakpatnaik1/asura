/**
 * Integration Tests for /api/health
 *
 * Tests the health check API endpoint.
 * Uses mocked Supabase client to test endpoint logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockLocals } from '../mocks/supabase';

// Dynamically import the server module to avoid type generation issues
const { GET } = await import('../../src/routes/api/health/+server');

describe('GET /api/health', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 200 status when database is healthy', async () => {
		const locals = createMockLocals({
			authenticated: false, // Health check doesn't require auth
			queryData: { model_identifier: 'test-model' }
		});

		const response = await GET({ locals } as any);

		expect(response.status).toBe(200);
	});

	it('returns JSON content type', async () => {
		const locals = createMockLocals({
			queryData: { model_identifier: 'test-model' }
		});

		const response = await GET({ locals } as any);

		expect(response.headers.get('Content-Type')).toContain('application/json');
	});

	it('returns status ok when all checks pass', async () => {
		const locals = createMockLocals({
			queryData: { model_identifier: 'test-model' }
		});

		const response = await GET({ locals } as any);
		const body = await response.json();

		expect(body.status).toBe('ok');
	});

	it('returns timestamp', async () => {
		const locals = createMockLocals({
			queryData: { model_identifier: 'test-model' }
		});

		const response = await GET({ locals } as any);
		const body = await response.json();

		expect(body.timestamp).toBeDefined();
		// Verify it's a valid ISO timestamp
		expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
	});

	it('returns uptime', async () => {
		const locals = createMockLocals({
			queryData: { model_identifier: 'test-model' }
		});

		const response = await GET({ locals } as any);
		const body = await response.json();

		expect(body.uptime).toBeDefined();
		expect(typeof body.uptime).toBe('number');
	});

	it('returns checks object', async () => {
		const locals = createMockLocals({
			queryData: { model_identifier: 'test-model' }
		});

		const response = await GET({ locals } as any);
		const body = await response.json();

		expect(body.checks).toBeDefined();
		expect(body.checks.server).toBe('ok');
		expect(body.checks.database).toBe('ok');
	});

	it('returns 503 when database is unhealthy', async () => {
		const locals = createMockLocals({
			queryError: new Error('Database connection failed')
		});

		const response = await GET({ locals } as any);

		expect(response.status).toBe(503);
		const body = await response.json();
		expect(body.status).toBe('degraded');
		expect(body.checks.database).toBe('error');
	});

	it('includes no-store cache header', async () => {
		const locals = createMockLocals({
			queryData: { model_identifier: 'test-model' }
		});

		const response = await GET({ locals } as any);

		expect(response.headers.get('Cache-Control')).toBe('no-store');
	});
});
