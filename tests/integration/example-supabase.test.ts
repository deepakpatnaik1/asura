/**
 * Example Supabase Integration Test
 *
 * This is a template showing how to write tests that interact with
 * the remote Supabase database using the service role key.
 *
 * Copy this file and modify it for your own tests.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
	createTestSupabaseClient,
	createAnonSupabaseClient,
	generateTestId,
	insertTestData,
	cleanupTestData
} from '../helpers';

describe('Example Supabase Test (Template)', () => {
	// Generate unique IDs for test data
	let testId: string;

	beforeAll(() => {
		// Generate unique test ID before tests run
		testId = generateTestId('example');
		console.log(`Running tests with ID: ${testId}`);
	});

	afterAll(async () => {
		// Clean up test data after tests complete
		// NOTE: Adjust the table name and filter based on your test
		try {
			// Example cleanup - uncomment and modify as needed:
			// await cleanupTestData('your_table', { id: testId });
			console.log(`Cleanup completed for ID: ${testId}`);
		} catch (error) {
			console.error('Cleanup failed:', error);
		}
	});

	describe('Basic Connection Tests', () => {
		it('should create a service role client', () => {
			const client = createTestSupabaseClient();

			expect(client).toBeDefined();
			expect(client.from).toBeDefined();
			expect(client.auth).toBeDefined();
			expect(client.storage).toBeDefined();
		});

		it('should create an anon client', () => {
			const client = createAnonSupabaseClient();

			expect(client).toBeDefined();
			expect(client.from).toBeDefined();
			expect(client.auth).toBeDefined();
		});
	});

	describe('Database Query Tests', () => {
		it('should query models table', async () => {
			const client = createTestSupabaseClient();

			const { data, error } = await client
				.from('models')
				.select('*')
				.limit(5);

			expect(error).toBeNull();
			expect(data).toBeDefined();
			expect(Array.isArray(data)).toBe(true);
		});

		it('should query files table', async () => {
			const client = createTestSupabaseClient();

			const { data, error } = await client
				.from('files')
				.select('*')
				.limit(5);

			expect(error).toBeNull();
			expect(data).toBeDefined();
			expect(Array.isArray(data)).toBe(true);
		});
	});

	describe('Data Manipulation Tests', () => {
		it('should insert and cleanup test data (EXAMPLE ONLY)', async () => {
			// This is just an example - you'll need to adjust the data structure
			// to match your actual table schema

			const client = createTestSupabaseClient();

			// Example: Insert a test model
			// NOTE: Modify this based on your actual table structure
			const testData = {
				id: testId,
				// Add other required fields here based on your table schema
			};

			// Uncomment and modify when you know the table structure:
			/*
			const { data: inserted, error: insertError } = await client
				.from('your_table')
				.insert(testData)
				.select()
				.single();

			expect(insertError).toBeNull();
			expect(inserted).toBeDefined();
			expect(inserted?.id).toBe(testId);

			// Verify the data was inserted
			const { data: queried, error: queryError } = await client
				.from('your_table')
				.select('*')
				.eq('id', testId)
				.single();

			expect(queryError).toBeNull();
			expect(queried).toBeDefined();
			expect(queried?.id).toBe(testId);

			// Clean up
			await cleanupTestData('your_table', { id: testId });
			*/

			// For now, just verify the test ID is unique
			expect(testId).toBeDefined();
			expect(testId.startsWith('example-')).toBe(true);
		});
	});

	describe('Helper Function Tests', () => {
		it('should generate unique test IDs', () => {
			const id1 = generateTestId('test');
			const id2 = generateTestId('test');

			expect(id1).toBeDefined();
			expect(id2).toBeDefined();
			expect(id1).not.toBe(id2);
			expect(id1.startsWith('test-')).toBe(true);
			expect(id2.startsWith('test-')).toBe(true);
		});

		it('should enforce filter requirement in cleanupTestData', async () => {
			// cleanupTestData should throw if no filter is provided
			await expect(
				cleanupTestData('models')
			).rejects.toThrow('cleanupTestData requires a filter');
		});
	});
});
