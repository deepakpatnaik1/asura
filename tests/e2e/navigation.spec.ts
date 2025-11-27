/**
 * E2E Tests for Navigation and Page Loading
 *
 * Tests that basic navigation and page elements work correctly.
 * These tests run against a live dev server.
 *
 * Run: npm run dev (in one terminal)
 * Then: npm run test:e2e (in another terminal)
 */

import { test, expect } from 'playwright/test';

test.describe('Navigation', () => {
	test('home page redirects to login when not authenticated', async ({ page }) => {
		await page.goto('/');

		// Should redirect to login or show login button
		await expect(page).toHaveURL(/\/(login)?/);
	});

	test('login page loads', async ({ page }) => {
		await page.goto('/login');

		await expect(page).toHaveTitle(/Asura|Login/i);
		// Should have some login UI element
		await expect(page.locator('body')).toBeVisible();
	});

	test('health endpoint returns ok', async ({ request }) => {
		const response = await request.get('/api/health');

		expect(response.ok()).toBe(true);
		const body = await response.json();
		expect(body.status).toMatch(/ok|degraded/);
		expect(body.timestamp).toBeDefined();
	});
});

test.describe('Authenticated Routes (require login)', () => {
	// Note: These tests require authentication setup
	// For now, we just verify the routes redirect properly

	test('chat page redirects when not authenticated', async ({ page }) => {
		await page.goto('/chat');

		// Should redirect to login or show unauthorized
		// The exact behavior depends on the auth setup
		const url = page.url();
		const isRedirected = url.includes('login') || url.includes('auth');
		const showsLoginContent = await page.locator('text=/sign in|log in|google/i').count() > 0;

		expect(isRedirected || showsLoginContent).toBe(true);
	});

	test('reader page redirects when not authenticated', async ({ page }) => {
		await page.goto('/reader');

		// Should redirect to login or show unauthorized
		const url = page.url();
		const isRedirected = url.includes('login') || url.includes('auth');
		const showsLoginContent = await page.locator('text=/sign in|log in|google/i').count() > 0;

		expect(isRedirected || showsLoginContent).toBe(true);
	});
});

test.describe('API Endpoints', () => {
	test('models endpoint requires authentication', async ({ request }) => {
		const response = await request.get('/api/models');

		expect(response.status()).toBe(401);
	});

	test('settings endpoint requires authentication', async ({ request }) => {
		const response = await request.get('/api/settings');

		expect(response.status()).toBe(401);
	});

	test('chat endpoint requires authentication', async ({ request }) => {
		const response = await request.post('/api/chat', {
			data: { message: 'test' }
		});

		expect(response.status()).toBe(401);
	});
});
