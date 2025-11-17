import { test, expect } from 'playwright/test';
import * as path from 'path';

/**
 * T5: End-to-End Tests - File Upload Flows
 *
 * Tests complete upload workflows:
 * - File selection and upload
 * - Drag and drop upload
 * - Progress tracking
 * - Status transitions (pending → processing → ready)
 *
 * Note: Tests run with userId = null (no auth implemented yet)
 */

test.describe('File Upload Flows', () => {
	test.beforeEach(async ({ page }) => {
		// Navigate to the application
		await page.goto('/');

		// Wait for page to be fully loaded
		await expect(page.locator('body')).toBeVisible();
	});

	test('uploads file via file picker successfully', async ({ page }) => {
		// Locate the file input element (hidden)
		const fileInput = page.locator('input[type="file"]');

		// Select test file
		const testFilePath = path.join(process.cwd(), 'test-files', 'test.txt');
		await fileInput.setInputFiles(testFilePath);

		// File list should auto-open and show the file
		await expect(page.locator('.file-list-container')).toBeVisible({ timeout: 5000 });

		// File should appear in the list with "processing" or "pending" status
		await expect(page.locator('.file-item')).toBeVisible({ timeout: 5000 });

		// Verify filename is displayed
		await expect(page.locator('.file-item-name').filter({ hasText: 'test.txt' })).toBeVisible();

		// File count badge should show 1 file
		await expect(page.locator('.file-count').filter({ hasText: '1' })).toBeVisible();
	});

	test('shows progress bar during file processing', async ({ page }) => {
		const fileInput = page.locator('input[type="file"]');
		const testFilePath = path.join(process.cwd(), 'test-files', 'test.txt');

		await fileInput.setInputFiles(testFilePath);

		// Wait for file list to appear
		await expect(page.locator('.file-list-container')).toBeVisible({ timeout: 5000 });

		// Check for progress bar (should be visible for processing files)
		const progressBar = page.locator('.progress-bar').first();
		await expect(progressBar).toBeVisible({ timeout: 5000 });

		// Progress bar should have width attribute (0-100%)
		const progressBarElement = await progressBar.getAttribute('style');
		expect(progressBarElement).toContain('width:');

		// Processing stage should be visible
		const processingStage = page.locator('.file-item-stage').first();
		await expect(processingStage).toBeVisible({ timeout: 5000 });

		// Stage should be one of: extraction, compression, embedding, finalization
		const stageText = await processingStage.textContent();
		expect(['extraction', 'compression', 'embedding', 'finalization', 'pending']).toContain(stageText);
	});

	test('file transitions from processing to ready status', async ({ page }) => {
		const fileInput = page.locator('input[type="file"]');
		const testFilePath = path.join(process.cwd(), 'test-files', 'test.txt');

		await fileInput.setInputFiles(testFilePath);

		// Wait for file to appear in processing section
		await expect(page.locator('.file-list-section-label').filter({ hasText: /Processing/i })).toBeVisible({ timeout: 5000 });

		// TODO: Wait for file to transition to ready status
		// This requires backend processing to complete, which depends on LLM APIs
		// For now, we verify the processing state appears correctly
		// Post-auth TODO: Mock backend processing to test full flow

		// Verify processing section shows at least 1 file
		const processingLabel = page.locator('.file-list-section-label').filter({ hasText: /Processing/i });
		const labelText = await processingLabel.textContent();
		expect(labelText).toMatch(/Processing \([1-9]\d*\)/); // At least 1 file
	});

	test('drag and drop upload works', async ({ page }) => {
		// Create a data transfer object for drag and drop
		const testFilePath = path.join(process.cwd(), 'test-files', 'test.txt');

		// Read file as buffer for drag and drop
		const fs = await import('fs');
		const buffer = fs.readFileSync(testFilePath);
		const dataTransfer = await page.evaluateHandle((data: number[]) => {
			const dt = new DataTransfer();
			const file = new File([new Uint8Array(data)], 'test.txt', { type: 'text/plain' });
			dt.items.add(file);
			return dt;
		}, Array.from(buffer));

		// Find the drop zone (input field wrapper)
		const dropZone = page.locator('.input-field-wrapper');

		// Trigger dragover event
		await dropZone.dispatchEvent('dragover', { dataTransfer });

		// Verify visual feedback appears (drag-active class)
		await expect(dropZone).toHaveClass(/drag-active/);

		// Trigger drop event
		await dropZone.dispatchEvent('drop', { dataTransfer });

		// Drag-active class should be removed
		await expect(dropZone).not.toHaveClass(/drag-active/);

		// File should appear in the list
		await expect(page.locator('.file-list-container')).toBeVisible({ timeout: 5000 });
		await expect(page.locator('.file-item-name').filter({ hasText: 'test.txt' })).toBeVisible();
	});

	test('multiple file uploads create separate entries', async ({ page }) => {
		const fileInput = page.locator('input[type="file"]');

		// Upload first file
		const testFile1 = path.join(process.cwd(), 'test-files', 'test.txt');
		await fileInput.setInputFiles(testFile1);

		// Wait for first file to appear
		await expect(page.locator('.file-item-name').filter({ hasText: 'test.txt' })).toBeVisible({ timeout: 5000 });

		// Upload second file
		const testFile2 = path.join(process.cwd(), 'test-files', 'test.md');
		await fileInput.setInputFiles(testFile2);

		// Wait for second file to appear
		await expect(page.locator('.file-item-name').filter({ hasText: 'test.md' })).toBeVisible({ timeout: 5000 });

		// Verify file count shows 2 files
		await expect(page.locator('.file-count').filter({ hasText: '2' })).toBeVisible();

		// Verify both files are in the list
		const fileItems = page.locator('.file-item');
		await expect(fileItems).toHaveCount(2, { timeout: 5000 });
	});

	test('file upload button shows paperclip icon', async ({ page }) => {
		// Verify file upload button is visible
		const uploadButton = page.locator('.file-upload-btn');
		await expect(uploadButton).toBeVisible();

		// Button should have paperclip icon (LuPaperclip)
		// Icon is rendered via svelte-icons-pack, check that button is clickable
		await expect(uploadButton).toBeEnabled();

		// Click should not throw error (triggers hidden input)
		await uploadButton.click();

		// Hidden file input should exist
		const fileInput = page.locator('input[type="file"]');
		await expect(fileInput).toBeAttached();
	});

	test('file list toggles visibility', async ({ page }) => {
		// Initially, file list should not be visible (no files uploaded)
		await expect(page.locator('.file-list-container')).not.toBeVisible();

		// Upload a file
		const fileInput = page.locator('input[type="file"]');
		const testFilePath = path.join(process.cwd(), 'test-files', 'test.txt');
		await fileInput.setInputFiles(testFilePath);

		// File list should auto-open
		await expect(page.locator('.file-list-container')).toBeVisible({ timeout: 5000 });

		// Click the close button
		const closeButton = page.locator('.file-list-close-btn');
		await closeButton.click();

		// File list should close
		await expect(page.locator('.file-list-container')).not.toBeVisible();

		// File count badge should still show 1
		await expect(page.locator('.file-count').filter({ hasText: '1' })).toBeVisible();

		// Click file list button to reopen
		const fileListButton = page.locator('.file-list-btn');
		await fileListButton.click();

		// File list should reopen
		await expect(page.locator('.file-list-container')).toBeVisible();
	});

	test('progress percentage updates during processing', async ({ page }) => {
		const fileInput = page.locator('input[type="file"]');
		const testFilePath = path.join(process.cwd(), 'test-files', 'test.txt');

		await fileInput.setInputFiles(testFilePath);

		// Wait for file to appear
		await expect(page.locator('.file-list-container')).toBeVisible({ timeout: 5000 });

		// Check for progress percentage display
		const progressPercent = page.locator('.file-item-percent').first();
		await expect(progressPercent).toBeVisible({ timeout: 5000 });

		// Progress should show a number with % symbol
		const percentText = await progressPercent.textContent();
		expect(percentText).toMatch(/\d+%/);

		// Progress should be between 0-100%
		const percentValue = parseInt(percentText?.replace('%', '') || '0');
		expect(percentValue).toBeGreaterThanOrEqual(0);
		expect(percentValue).toBeLessThanOrEqual(100);
	});

	test('upload different file types successfully', async ({ page }) => {
		const fileInput = page.locator('input[type="file"]');

		// Test different file types
		const fileTypes = [
			{ name: 'test.txt', type: 'text' },
			{ name: 'test.md', type: 'markdown' },
			{ name: 'test.js', type: 'code' },
			{ name: 'test.csv', type: 'spreadsheet' }
		];

		for (const file of fileTypes) {
			const testFilePath = path.join(process.cwd(), 'test-files', file.name);
			await fileInput.setInputFiles(testFilePath);

			// Wait for file to appear
			await expect(page.locator('.file-item-name').filter({ hasText: file.name })).toBeVisible({ timeout: 5000 });
		}

		// Verify all files are uploaded
		await expect(page.locator('.file-count').filter({ hasText: '4' })).toBeVisible();
	});

	test('file list sections are properly labeled', async ({ page }) => {
		const fileInput = page.locator('input[type="file"]');
		const testFilePath = path.join(process.cwd(), 'test-files', 'test.txt');

		await fileInput.setInputFiles(testFilePath);

		// Wait for file list to open
		await expect(page.locator('.file-list-container')).toBeVisible({ timeout: 5000 });

		// Check for section labels
		const sectionLabels = page.locator('.file-list-section-label');
		await expect(sectionLabels.first()).toBeVisible({ timeout: 5000 });

		// At least one section should be visible (Processing)
		const labelText = await sectionLabels.first().textContent();
		expect(labelText).toMatch(/Processing|Ready|Failed/i);
	});
});
