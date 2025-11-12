import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// Test environment
		environment: 'node', // Use node for pure unit tests (no DOM needed)

		// Global test utilities
		globals: true,

		// Setup files
		setupFiles: ['./tests/unit/setup.unit.ts'],

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
			include: ['src/**/*.ts'],
			all: true,
			lines: 80,
			functions: 80,
			branches: 80,
			statements: 80
		},

		// Include only unit tests
		include: ['tests/unit/**/*.{test,spec}.{js,ts}'],
		exclude: ['node_modules', '.svelte-kit', 'build', 'dist'],

		// Test timeout
		testTimeout: 10000,

		// Watch options
		watch: false,

		// Reporter
		reporter: 'verbose',

		// Mock options
		clearMocks: true,
		mockReset: true,
		restoreMocks: true
	},

	resolve: {
		alias: {
			'$lib': '/Users/d.patnaik/code/asura/src/lib',
			'$env/static/public': '/Users/d.patnaik/code/asura/tests/mocks/env-public.mock.ts',
			'$env/static/private': '/Users/d.patnaik/code/asura/tests/mocks/env-private.mock.ts'
		}
	}
});
