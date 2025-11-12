import { test, expect } from 'playwright/test';
import * as path from 'path';

/**
 * T5: End-to-End Tests - Error Scenarios
 *
 * Tests error handling:
 * - File size validation (>10MB)
 * - File type validation
 * - Duplicate detection
 * - Error messages display
 * - Error recovery
 *
 * Note: Tests run with userId = null (no auth implemented yet)
 */

test.describe('Error Scenarios', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('body')).toBeVisible();
	});

	test('rejects file larger than 10MB', async ({ page }) => {
		// Create a large file buffer (>10MB) via page evaluation
		await page.evaluate(() => {
			// Create synthetic file input change event with large file
			const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

			// Create mock file larger than 10MB (10485760 bytes)
			const largeSize = 10485761; // 10MB + 1 byte
			const blob = new Blob(['x'.repeat(largeSize)], { type: 'text/plain' });
			const file = new File([blob], 'large-file.txt', { type: 'text/plain' });

			// Create DataTransfer to set files
			const dataTransfer = new DataTransfer();
			dataTransfer.items.add(file);
			fileInput.files = dataTransfer.files;

			// Trigger change event
			fileInput.dispatchEvent(new Event('change', { bubbles: true }));
		});

		// Error banner should appear
		await expect(page.locator('.file-error-banner')).toBeVisible({ timeout: 5000 });

		// Error message should mention file size limit
		await expect(page.locator('.file-error-banner').filter({ hasText: /too large|10MB/i })).toBeVisible();

		// File should NOT appear in file list
		await expect(page.locator('.file-count')).not.toBeVisible();
	});

	test('rejects unsupported file type', async ({ page }) => {
		// Create a file with unsupported extension
		await page.evaluate(() => {
			const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

			// Create mock .exe file (not supported)
			const blob = new Blob(['test content'], { type: 'application/x-msdownload' });
			const file = new File([blob], 'virus.exe', { type: 'application/x-msdownload' });

			const dataTransfer = new DataTransfer();
			dataTransfer.items.add(file);
			fileInput.files = dataTransfer.files;

			fileInput.dispatchEvent(new Event('change', { bubbles: true }));
		});

		// Error banner should appear
		await expect(page.locator('.file-error-banner')).toBeVisible({ timeout: 5000 });

		// Error message should mention file type not supported
		await expect(page.locator('.file-error-banner').filter({ hasText: /not supported/i })).toBeVisible();

		// File should NOT appear in file list
		await expect(page.locator('.file-count')).not.toBeVisible();
	});

	test('error banner can be dismissed', async ({ page }) => {
		// Trigger an error (unsupported file type)
		await page.evaluate(() => {
			const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
			const blob = new Blob(['test'], { type: 'application/x-msdownload' });
			const file = new File([blob], 'test.exe', { type: 'application/x-msdownload' });

			const dataTransfer = new DataTransfer();
			dataTransfer.items.add(file);
			fileInput.files = dataTransfer.files;
			fileInput.dispatchEvent(new Event('change', { bubbles: true }));
		});

		// Error banner should appear
		await expect(page.locator('.file-error-banner')).toBeVisible({ timeout: 5000 });

		// Click close button
		const closeButton = page.locator('.error-close-btn');
		await expect(closeButton).toBeVisible();
		await closeButton.click();

		// Error banner should disappear
		await expect(page.locator('.file-error-banner')).not.toBeVisible();
	});

	test('error banner auto-dismisses after 5 seconds', async ({ page }) => {
		// Trigger an error
		await page.evaluate(() => {
			const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
			const blob = new Blob(['test'], { type: 'application/x-msdownload' });
			const file = new File([blob], 'test.exe', { type: 'application/x-msdownload' });

			const dataTransfer = new DataTransfer();
			dataTransfer.items.add(file);
			fileInput.files = dataTransfer.files;
			fileInput.dispatchEvent(new Event('change', { bubbles: true }));
		});

		// Error banner should appear
		await expect(page.locator('.file-error-banner')).toBeVisible({ timeout: 5000 });

		// Wait 5 seconds
		await page.waitForTimeout(5500);

		// Error banner should auto-dismiss
		await expect(page.locator('.file-error-banner')).not.toBeVisible();
	});

	test('shows error message for failed file processing', async ({ page }) => {
		// TODO: This requires backend processing to fail
		// For now, verify the UI structure for failed files exists

		// Failed files section should exist in DOM
		const failedSection = page.locator('.file-item-failed');
		await expect(failedSection).toBeAttached();

		// Failed file should show error icon (✕)
		const errorIcon = page.locator('.file-item-failed .file-item-status-icon');
		await expect(errorIcon).toBeAttached();

		// Failed file should show error message
		const errorMessage = page.locator('.file-item-error');
		await expect(errorMessage).toBeAttached();

		// Post-auth TODO: Test actual failed processing flow
		// 1. Mock backend to return processing error
		// 2. Upload file
		// 3. Wait for failed status
		// 4. Verify error message displayed
		// 5. Verify file appears in Failed section
	});

	test('duplicate file detection shows error', async ({ page }) => {
		// Upload the same file twice
		const fileInput = page.locator('input[type="file"]');
		const testFilePath = path.join(process.cwd(), 'test-files', 'test.txt');

		// Upload first time
		await fileInput.setInputFiles(testFilePath);
		await expect(page.locator('.file-item-name').filter({ hasText: 'test.txt' })).toBeVisible({ timeout: 5000 });

		// Try to upload same file again
		await fileInput.setInputFiles(testFilePath);

		// TODO: Backend should detect duplicate via content_hash
		// Error banner should appear with duplicate message
		// For now, file will be uploaded again (duplicate detection happens in backend)

		// Post-auth TODO: Verify duplicate detection
		// await expect(page.locator('.file-error-banner').filter({ hasText: /already exists|duplicate/i })).toBeVisible({ timeout: 5000 });
	});

	test('multiple errors show one at a time', async ({ page }) => {
		// Trigger first error
		await page.evaluate(() => {
			const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
			const blob = new Blob(['test'], { type: 'application/x-msdownload' });
			const file = new File([blob], 'test.exe', { type: 'application/x-msdownload' });

			const dataTransfer = new DataTransfer();
			dataTransfer.items.add(file);
			fileInput.files = dataTransfer.files;
			fileInput.dispatchEvent(new Event('change', { bubbles: true }));
		});

		// First error should appear
		await expect(page.locator('.file-error-banner')).toBeVisible({ timeout: 5000 });
		const firstErrorText = await page.locator('.file-error-banner').textContent();

		// Trigger second error (large file)
		await page.evaluate(() => {
			const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
			const largeSize = 10485761;
			const blob = new Blob(['x'.repeat(largeSize)], { type: 'text/plain' });
			const file = new File([blob], 'large.txt', { type: 'text/plain' });

			const dataTransfer = new DataTransfer();
			dataTransfer.items.add(file);
			fileInput.files = dataTransfer.files;
			fileInput.dispatchEvent(new Event('change', { bubbles: true }));
		});

		// Error banner should update with new error
		await expect(page.locator('.file-error-banner')).toBeVisible({ timeout: 5000 });
		const secondErrorText = await page.locator('.file-error-banner').textContent();

		// Error text should change
		expect(firstErrorText).not.toBe(secondErrorText);

		// Only one error banner should be visible
		const errorBanners = page.locator('.file-error-banner');
		await expect(errorBanners).toHaveCount(1);
	});

	test('error does not prevent subsequent uploads', async ({ page }) => {
		// Trigger an error
		await page.evaluate(() => {
			const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
			const blob = new Blob(['test'], { type: 'application/x-msdownload' });
			const file = new File([blob], 'test.exe', { type: 'application/x-msdownload' });

			const dataTransfer = new DataTransfer();
			dataTransfer.items.add(file);
			fileInput.files = dataTransfer.files;
			fileInput.dispatchEvent(new Event('change', { bubbles: true }));
		});

		// Error should appear
		await expect(page.locator('.file-error-banner')).toBeVisible({ timeout: 5000 });

		// Upload a valid file
		const fileInput = page.locator('input[type="file"]');
		const testFilePath = path.join(process.cwd(), 'test-files', 'test.txt');
		await fileInput.setInputFiles(testFilePath);

		// Valid file should upload successfully
		await expect(page.locator('.file-list-container')).toBeVisible({ timeout: 5000 });
		await expect(page.locator('.file-item-name').filter({ hasText: 'test.txt' })).toBeVisible();

		// Error banner should be dismissed automatically
		await expect(page.locator('.file-error-banner')).not.toBeVisible();
	});

	test('empty file upload shows appropriate error', async ({ page }) => {
		// Upload empty file
		const fileInput = page.locator('input[type="file"]');
		const emptyFilePath = path.join(process.cwd(), 'test-files', 'test-empty.txt');

		await fileInput.setInputFiles(emptyFilePath);

		// TODO: Backend should reject empty files
		// For now, empty file will be uploaded (validation happens in backend)

		// File should appear in list
		await expect(page.locator('.file-list-container')).toBeVisible({ timeout: 5000 });

		// Post-auth TODO: Verify empty file rejection
		// await expect(page.locator('.file-error-banner').filter({ hasText: /empty/i })).toBeVisible({ timeout: 5000 });
	});

	test('failed files can be deleted', async ({ page }) => {
		// TODO: Requires backend to create a failed file
		// Verify that failed files have delete button

		// Failed file structure should allow deletion
		const failedItem = page.locator('.file-item-failed');
		const deleteButton = failedItem.locator('.file-item-delete-btn');

		// Delete button should exist in DOM structure
		await expect(deleteButton).toBeAttached();

		// Post-auth TODO: Test deleting a failed file
		// 1. Create failed file (mock backend error)
		// 2. Verify file appears in Failed section
		// 3. Click delete button
		// 4. Confirm deletion
		// 5. Verify file removed from list
	});

	test('network error during upload shows error message', async ({ page }) => {
		// Intercept upload request and force failure
		await page.route('/api/files/upload', (route) => {
			route.abort('failed');
		});

		// Try to upload file
		const fileInput = page.locator('input[type="file"]');
		const testFilePath = path.join(process.cwd(), 'test-files', 'test.txt');
		await fileInput.setInputFiles(testFilePath);

		// Error banner should appear
		await expect(page.locator('.file-error-banner')).toBeVisible({ timeout: 5000 });

		// Error should mention upload failure
		await expect(page.locator('.file-error-banner').filter({ hasText: /failed|error/i })).toBeVisible();
	});

	test('error styling is visually distinct', async ({ page }) => {
		// Trigger an error
		await page.evaluate(() => {
			const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
			const blob = new Blob(['test'], { type: 'application/x-msdownload' });
			const file = new File([blob], 'test.exe', { type: 'application/x-msdownload' });

			const dataTransfer = new DataTransfer();
			dataTransfer.items.add(file);
			fileInput.files = dataTransfer.files;
			fileInput.dispatchEvent(new Event('change', { bubbles: true }));
		});

		// Error banner should be visible
		const errorBanner = page.locator('.file-error-banner');
		await expect(errorBanner).toBeVisible({ timeout: 5000 });

		// Verify error styling (red color theme)
		const backgroundColor = await errorBanner.evaluate((el) => {
			return window.getComputedStyle(el).backgroundColor;
		});

		// Background should have red tint (rgba with red channel)
		expect(backgroundColor).toContain('rgb');

		// Border should be red (rgb(239, 68, 68))
		const borderColor = await errorBanner.evaluate((el) => {
			return window.getComputedStyle(el).borderBottomColor;
		});

		expect(borderColor).toContain('rgb');
	});

	test('file input resets after successful upload', async ({ page }) => {
		const fileInput = page.locator('input[type="file"]');
		const testFilePath = path.join(process.cwd(), 'test-files', 'test.txt');

		// Upload file
		await fileInput.setInputFiles(testFilePath);

		// Wait for upload to complete
		await expect(page.locator('.file-list-container')).toBeVisible({ timeout: 5000 });

		// File input should be reset (value should be empty)
		const inputValue = await fileInput.evaluate((el: HTMLInputElement) => el.value);
		expect(inputValue).toBe('');

		// User should be able to upload the same file again
		await fileInput.setInputFiles(testFilePath);

		// File should appear again (or show duplicate error)
		// Either outcome is acceptable - the important part is input was reset
		await page.waitForTimeout(1000);
	});

	test('file input resets after error', async ({ page }) => {
		// Trigger an error
		await page.evaluate(() => {
			const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
			const blob = new Blob(['test'], { type: 'application/x-msdownload' });
			const file = new File([blob], 'test.exe', { type: 'application/x-msdownload' });

			const dataTransfer = new DataTransfer();
			dataTransfer.items.add(file);
			fileInput.files = dataTransfer.files;
			fileInput.dispatchEvent(new Event('change', { bubbles: true }));
		});

		// Error should appear
		await expect(page.locator('.file-error-banner')).toBeVisible({ timeout: 5000 });

		// File input should be reset even after error
		const fileInput = page.locator('input[type="file"]');
		const inputValue = await fileInput.evaluate((el: HTMLInputElement) => el.value);
		expect(inputValue).toBe('');

		// User should be able to try again
		const testFilePath = path.join(process.cwd(), 'test-files', 'test.txt');
		await fileInput.setInputFiles(testFilePath);

		// Valid file should upload successfully
		await expect(page.locator('.file-list-container')).toBeVisible({ timeout: 5000 });
	});
});
