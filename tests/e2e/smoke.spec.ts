/**
 * E2E Smoke Tests
 *
 * Basic smoke tests to verify the application is running correctly.
 * These are lightweight tests that should pass quickly.
 *
 * Run: npm run dev (in one terminal)
 * Then: npm run test:e2e (in another terminal)
 */

import { test, expect } from 'playwright/test';

test.describe('Smoke Tests', () => {
	test('app is running and responds', async ({ page }) => {
		const response = await page.goto('/');

		// App should respond with 200 or redirect (302/307)
		expect([200, 302, 307]).toContain(response?.status());
	});

	test('health check passes', async ({ request }) => {
		const response = await request.get('/api/health');

		expect(response.ok()).toBe(true);
		const data = await response.json();

		// Basic health check structure
		expect(data).toHaveProperty('status');
		expect(data).toHaveProperty('timestamp');
		expect(data).toHaveProperty('uptime');
		expect(data).toHaveProperty('checks');
	});

	test('static assets are served', async ({ page }) => {
		await page.goto('/');

		// Page should have basic HTML structure
		await expect(page.locator('html')).toBeVisible();
		await expect(page.locator('body')).toBeVisible();
	});

	test('no console errors on page load', async ({ page }) => {
		const errors: string[] = [];

		page.on('console', (msg) => {
			if (msg.type() === 'error') {
				errors.push(msg.text());
			}
		});

		await page.goto('/');

		// Filter out expected warnings/errors (e.g., auth redirects)
		const unexpectedErrors = errors.filter(
			(err) =>
				!err.includes('401') &&
				!err.includes('Unauthorized') &&
				!err.includes('Failed to load resource')
		);

		expect(unexpectedErrors).toHaveLength(0);
	});

	test('page has viewport meta tag', async ({ page }) => {
		await page.goto('/');

		const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
		expect(viewport).toContain('width=device-width');
	});
});

test.describe('Performance', () => {
	test('home page loads within 5 seconds', async ({ page }) => {
		const startTime = Date.now();

		await page.goto('/', { waitUntil: 'domcontentloaded' });

		const loadTime = Date.now() - startTime;
		expect(loadTime).toBeLessThan(5000);
	});

	test('health endpoint responds within 1 second', async ({ request }) => {
		const startTime = Date.now();

		await request.get('/api/health');

		const responseTime = Date.now() - startTime;
		expect(responseTime).toBeLessThan(1000);
	});
});
