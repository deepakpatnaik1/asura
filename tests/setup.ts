/**
 * Vitest Global Setup
 *
 * This file runs before all tests and sets up:
 * - Global test utilities
 * - Environment variables
 * - Test-specific DOM configurations
 */

import '@testing-library/jest-dom';
import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// ============================================================================
// ENVIRONMENT VARIABLES
// ============================================================================

beforeAll(() => {
	// Vitest automatically loads .env files
	// Validate that required environment variables are present
	const requiredEnvVars = [
		'PUBLIC_SUPABASE_URL',
		'PUBLIC_SUPABASE_ANON_KEY',
		'SUPABASE_SERVICE_ROLE_KEY'
	];

	const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

	if (missingVars.length > 0) {
		console.error('[Test Setup] Missing required environment variables:', missingVars);
		throw new Error(
			`Missing required environment variables: ${missingVars.join(', ')}. ` +
			'Please ensure .env file exists and contains all required variables.'
		);
	}

	console.log('[Test Setup] Environment variables loaded from .env');
	console.log('[Test Setup] Supabase URL:', process.env.PUBLIC_SUPABASE_URL);
	console.log('[Test Setup] Service Role Key:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Present' : 'Missing');
});

// ============================================================================
// GLOBAL CLEANUP
// ============================================================================

afterAll(() => {
	console.log('[Test Setup] All tests completed');
});

// ============================================================================
// PER-TEST SETUP/CLEANUP
// ============================================================================

beforeEach(() => {
	// Reset any global state before each test
	// This ensures test isolation
});

afterEach(() => {
	// Clean up after each test
	// Mocks are automatically cleared by Vitest config
});

// ============================================================================
// GLOBAL TEST UTILITIES
// ============================================================================

// Add any global test utilities here
// For example: custom matchers, helper functions, etc.
