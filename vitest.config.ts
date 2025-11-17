import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],

	test: {
		// Test environment
		environment: 'jsdom', // Use jsdom for DOM testing (Svelte components)

		// Global test utilities
		globals: true, // Enable global test APIs (describe, it, expect, etc.)

		// Environment variables
		env: {
			// Load .env file for tests
			// Vitest will automatically load .env files
		},

		// Setup files
		setupFiles: ['./tests/setup.ts'],

		// Coverage configuration
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html', 'lcov'],
			exclude: [
				'node_modules/',
				'tests/',
				'.svelte-kit/',
				'build/',
				'dist/',
				'**/*.d.ts',
				'**/*.config.*',
				'**/mocks/**',
				'**/fixtures/**'
			],
			include: ['src/**/*.ts', 'src/**/*.svelte'],
			all: true,
			lines: 80,
			functions: 80,
			branches: 80,
			statements: 80
		},

		// Include/exclude patterns
		include: ['tests/**/*.{test,spec}.{js,ts}'],
		exclude: ['node_modules', '.svelte-kit', 'build', 'dist', 'tests/e2e/**'],

		// Test timeout
		testTimeout: 10000, // 10 seconds

		// Watch options
		watch: false, // Disable watch mode by default

		// Reporter
		reporter: 'verbose',

		// Mock options
		clearMocks: true, // Clear mocks between tests
		mockReset: true,  // Reset mocks between tests
		restoreMocks: true // Restore original implementations between tests
	},

	resolve: {
		alias: {
			// Ensure $lib alias works in tests (SvelteKit convention)
			$lib: '/Users/d.patnaik/code/asura/src/lib',
			$app: '/Users/d.patnaik/code/asura/.svelte-kit/runtime/app',
			$routes: '/Users/d.patnaik/code/asura/src/routes'
		}
	}
});
