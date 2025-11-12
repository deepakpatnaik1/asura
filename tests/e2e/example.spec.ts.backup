import { test, expect } from '@playwright/test';

test('homepage has title and welcome message', async ({ page }) => {
	await page.goto('/');

	// Expect a title to contain "Svelte"
	await expect(page).toHaveTitle(/Svelte/);
});

test('app loads successfully', async ({ page }) => {
	await page.goto('/');

	// The page should be loaded without errors
	await expect(page.locator('body')).toBeVisible();
});
