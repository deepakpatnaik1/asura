/**
 * Unit Test Setup
 *
 * Sets environment variables BEFORE any module imports.
 * This file is loaded by vitest before running tests.
 */

// Set ALL environment variables BEFORE any module imports
process.env.VOYAGE_API_KEY = 'test-voyage-key';
process.env.FIREWORKS_API_KEY = 'test-fireworks-key';
process.env.PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
