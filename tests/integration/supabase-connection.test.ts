/**
 * Supabase Connection Verification Test
 *
 * This test verifies that we can connect to the remote Supabase instance
 * using the service role key and perform basic database operations.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
	createTestSupabaseClient,
	createAnonSupabaseClient,
	generateTestId,
	insertTestData,
	cleanupTestData
} from '../helpers/database';

describe('Supabase Connection', () => {
	let testUserId: string;

	beforeAll(() => {
		// Generate a unique test user ID
		testUserId = generateTestId('verify-user');
	});

	it('should connect with service role key', () => {
		const client = createTestSupabaseClient();
		expect(client).toBeDefined();
		expect(client.auth).toBeDefined();
		expect(client.from).toBeDefined();
	});

	it('should connect with anon key', () => {
		const client = createAnonSupabaseClient();
		expect(client).toBeDefined();
		expect(client.auth).toBeDefined();
		expect(client.from).toBeDefined();
	});

	it('should have correct Supabase URL', () => {
		expect(process.env.PUBLIC_SUPABASE_URL).toBe('https://hsxjcowijclwdxcmhbhs.supabase.co');
	});

	it('should have service role key configured', () => {
		expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeDefined();
		expect(process.env.SUPABASE_SERVICE_ROLE_KEY?.length).toBeGreaterThan(0);
	});

	it('should be able to query tables with service role key', async () => {
		const client = createTestSupabaseClient();

		// Try to query the models table
		const { data, error } = await client
			.from('models')
			.select('id')
			.limit(1);

		// Should not error (even if table is empty)
		expect(error).toBeNull();
		expect(data).toBeDefined();
		expect(Array.isArray(data)).toBe(true);
	});

	it('should be able to query files table', async () => {
		const client = createTestSupabaseClient();

		// Try to query the files table
		const { data, error } = await client
			.from('files')
			.select('*')
			.limit(1);

		// Should not error (even if table is empty)
		expect(error).toBeNull();
		expect(data).toBeDefined();
		expect(Array.isArray(data)).toBe(true);
	});

	it('should prevent cleanupTestData without filter', async () => {
		// Should throw error if no filter is provided
		await expect(cleanupTestData('models')).rejects.toThrow(
			'cleanupTestData requires a filter'
		);
	});
});
