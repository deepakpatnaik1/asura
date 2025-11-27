/**
 * Global Test Setup
 *
 * This file runs before all tests and sets up:
 * - Environment variables
 * - Global mocks
 * - Test utilities
 */

import { vi, beforeAll, afterAll, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Mock environment variables
vi.stubEnv('PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');
vi.stubEnv('VOYAGE_API_KEY', 'test-voyage-key');
vi.stubEnv('BRAVE_API_KEY', 'test-brave-key');
vi.stubEnv('NODE_ENV', 'test');

// Mock $env/static/private
vi.mock('$env/static/private', () => ({
	SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
	ANTHROPIC_API_KEY: 'test-anthropic-key',
	VOYAGE_API_KEY: 'test-voyage-key',
	BRAVE_API_KEY: 'test-brave-key'
}));

// Mock $env/static/public
vi.mock('$env/static/public', () => ({
	PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
	PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key'
}));

// Mock SvelteKit json helper
vi.mock('@sveltejs/kit', () => ({
	json: (data: unknown, init?: ResponseInit) => {
		return new Response(JSON.stringify(data), {
			status: init?.status ?? 200,
			headers: {
				'Content-Type': 'application/json',
				...init?.headers
			}
		});
	}
}));

// Global setup
beforeAll(() => {
	// Any global setup needed before all tests
});

// Cleanup after each test
afterEach(() => {
	vi.clearAllMocks();
});

// Global teardown
afterAll(() => {
	vi.unstubAllEnvs();
});

// Helper to parse JSON response from mock Response
export async function parseJsonResponse<T>(response: Response): Promise<T> {
	return response.json();
}

// Helper to create mock Request
export function createMockRequest(
	method: string,
	body?: unknown,
	headers?: Record<string, string>
): Request {
	return new Request('http://localhost', {
		method,
		body: body ? JSON.stringify(body) : undefined,
		headers: {
			'Content-Type': 'application/json',
			...headers
		}
	});
}
