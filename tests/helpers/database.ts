/**
 * Database Test Helpers
 *
 * Utilities for working with Supabase in tests.
 * These helpers use the service role key to bypass RLS policies.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Create a Supabase client with service role key for testing
 *
 * This client bypasses Row Level Security (RLS) policies and should
 * only be used in test environments.
 *
 * @returns Supabase client with service role privileges
 * @throws Error if required environment variables are not set
 */
export function createTestSupabaseClient(): SupabaseClient {
	const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl) {
		throw new Error(
			'PUBLIC_SUPABASE_URL is not set. Ensure .env file exists and contains this variable.'
		);
	}

	if (!serviceRoleKey) {
		throw new Error(
			'SUPABASE_SERVICE_ROLE_KEY is not set. Ensure .env file exists and contains this variable.'
		);
	}

	// Create client with service role key
	// This bypasses RLS and gives full database access
	return createClient(supabaseUrl, serviceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	});
}

/**
 * Create a Supabase client with anon key (standard client)
 *
 * This client respects RLS policies and is useful for testing
 * user-facing functionality.
 *
 * @returns Supabase client with anon key
 * @throws Error if required environment variables are not set
 */
export function createAnonSupabaseClient(): SupabaseClient {
	const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
	const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY;

	if (!supabaseUrl) {
		throw new Error(
			'PUBLIC_SUPABASE_URL is not set. Ensure .env file exists and contains this variable.'
		);
	}

	if (!anonKey) {
		throw new Error(
			'PUBLIC_SUPABASE_ANON_KEY is not set. Ensure .env file exists and contains this variable.'
		);
	}

	return createClient(supabaseUrl, anonKey);
}

/**
 * Clean up test data from a table
 *
 * WARNING: This deletes data from the database. Use with caution.
 *
 * @param tableName - Name of the table to clean
 * @param filter - Optional filter to apply (e.g., { id: 'test-id' })
 * @returns Promise that resolves when cleanup is complete
 */
export async function cleanupTestData(
	tableName: string,
	filter?: Record<string, any>
): Promise<void> {
	const client = createTestSupabaseClient();

	let query = client.from(tableName).delete();

	// Apply filters if provided
	if (filter) {
		for (const [key, value] of Object.entries(filter)) {
			query = query.eq(key, value);
		}
	} else {
		// If no filter, require a test prefix or ID to prevent accidental deletion
		throw new Error(
			'cleanupTestData requires a filter to prevent accidental deletion of all data. ' +
			'Use a filter like { id_prefix: "test-" } or { id: "specific-test-id" }'
		);
	}

	const { error } = await query;

	if (error) {
		console.error(`Failed to cleanup test data from ${tableName}:`, error);
		throw error;
	}
}

/**
 * Insert test data into a table
 *
 * @param tableName - Name of the table
 * @param data - Data to insert (single object or array)
 * @returns Promise with inserted data
 */
export async function insertTestData<T = any>(
	tableName: string,
	data: T | T[]
): Promise<T[]> {
	const client = createTestSupabaseClient();

	const { data: insertedData, error } = await client
		.from(tableName)
		.insert(Array.isArray(data) ? data : [data])
		.select();

	if (error) {
		console.error(`Failed to insert test data into ${tableName}:`, error);
		throw error;
	}

	return insertedData as T[];
}

/**
 * Helper to generate a unique test ID
 *
 * @param prefix - Optional prefix for the ID (default: 'test')
 * @returns Unique test ID with timestamp
 */
export function generateTestId(prefix: string = 'test'): string {
	const timestamp = Date.now();
	const random = Math.random().toString(36).substring(2, 9);
	return `${prefix}-${timestamp}-${random}`;
}

/**
 * Wait for a database operation to complete
 *
 * Useful for testing eventual consistency or waiting for triggers.
 *
 * @param checkFn - Function that returns true when operation is complete
 * @param options - Timeout and interval options
 */
export async function waitForDbOperation(
	checkFn: () => Promise<boolean>,
	options: { timeout?: number; interval?: number } = {}
): Promise<void> {
	const { timeout = 5000, interval = 100 } = options;
	const startTime = Date.now();

	while (true) {
		const result = await checkFn();
		if (result) {
			return;
		}

		if (Date.now() - startTime > timeout) {
			throw new Error(`Database operation timed out after ${timeout}ms`);
		}

		await new Promise((resolve) => setTimeout(resolve, interval));
	}
}
