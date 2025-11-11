/**
 * Test suite for file processor orchestration layer
 * Tests the complete file processing pipeline: extract → compress → embed → store
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Test result tracker
 */
let testsPassed = 0;
let testsFailed = 0;
const testResults = [];

/**
 * Log test result
 */
function logTestResult(testName, passed, message, details = null) {
	const status = passed ? '✓ PASS' : '✗ FAIL';
	console.log(`${status}: ${testName}`);
	console.log(`  ${message}`);
	if (details) {
		console.log(`  Details: ${JSON.stringify(details, null, 2)}`);
	}

	if (passed) {
		testsPassed++;
	} else {
		testsFailed++;
	}

	testResults.push({
		testName,
		passed,
		message,
		details
	});
}

/**
 * Print summary
 */
function printSummary() {
	console.log('\n' + '='.repeat(80));
	console.log('TEST SUMMARY');
	console.log('='.repeat(80));
	console.log(`Passed: ${testsPassed}`);
	console.log(`Failed: ${testsFailed}`);
	console.log(`Total: ${testsPassed + testsFailed}`);
	console.log('='.repeat(80));
}

/**
 * Generate test UUID (valid UUID v4 format for testing)
 */
function generateTestUUID() {
	return '123e4567-e89b-12d3-a456-426614174000';
}

/**
 * Create test file buffer
 */
function createTestFileBuffer(sizeBytes = 1024, content = null) {
	if (content) {
		return Buffer.from(content);
	}
	return Buffer.alloc(sizeBytes, 'a');
}

/**
 * Create large file buffer (near size limit)
 */
function createLargeFileBuffer(sizeBytes) {
	// Create file in chunks to avoid memory issues
	const chunk = Buffer.alloc(1024 * 1024, 'x'); // 1MB chunk
	const chunks = [];
	let remaining = sizeBytes;

	while (remaining > 0) {
		const size = Math.min(chunk.length, remaining);
		chunks.push(chunk.slice(0, size));
		remaining -= size;
	}

	return Buffer.concat(chunks);
}

// ============================================================================
// LOAD MODULES
// ============================================================================

/**
 * Load processor and dependencies
 */
async function loadModules() {
	try {
		// Set SvelteKit env variables for module loading
		if (!process.env.PUBLIC_SUPABASE_URL) {
			process.env.PUBLIC_SUPABASE_URL =
				process.env.PUBLIC_SUPABASE_URL || 'https://hsxjcowijclwdxcmhbhs.supabase.co';
		}
		if (!process.env.PUBLIC_SUPABASE_ANON_KEY) {
			process.env.PUBLIC_SUPABASE_ANON_KEY =
				process.env.PUBLIC_SUPABASE_ANON_KEY ||
				'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzeGpjb3dpamNsd2R4Y21oYmhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1MjA3NDksImV4cCI6MjA3ODA5Njc0OX0.j7vqsRPUpEXdKhOcxPoII3tWLM_6SJl6nNeSvfRrq7s';
		}

		const { processFile, FileProcessorError } = await import('./src/lib/file-processor.ts');
		return { processFile, FileProcessorError };
	} catch (error) {
		console.error('Failed to load file processor:', error.message);
		process.exit(1);
	}
}

// ============================================================================
// TEST SUITE
// ============================================================================

/**
 * Test 1: End-to-End File Processing (Happy Path)
 */
async function test1_EndToEndProcessing() {
	const { processFile } = await loadModules();
	console.log('\n=== Test 1: End-to-End File Processing ===');

	try {
		const testContent = `
Strategic Analysis: Q4 2024 Market Position

Key Findings:
- Market share: 12.5% (up from 10%)
- Customer acquisition cost: $450 (down from $600)
- Monthly recurring revenue: $2.3M
- Churn rate: 2.1% (industry average: 3.5%)

Strategic Decision: Expand enterprise segment
Rationale: Higher margins (70% vs 45%), lower churn (1.2% vs 3.5%)

Action Items:
1. Hire 2 enterprise account executives (deadline: Jan 15)
2. Build enterprise features (SSO, audit logs) by Feb 1
3. Launch enterprise GTM campaign by March 1
`;

		const result = await processFile({
			fileBuffer: createTestFileBuffer(5000, testContent),
			filename: 'strategic-plan.txt',
			userId: generateTestUUID(),
			contentType: 'text/plain'
		});

		// Verify result
		const success =
			result.status === 'ready' &&
			result.id &&
			typeof result.id === 'string' &&
			result.filename === 'strategic-plan.txt' &&
			result.fileType === 'text';

		logTestResult(
			'Test 1: End-to-End Processing',
			success,
			success
				? 'File processed successfully with status=ready'
				: 'Processing completed but validation failed',
			{
				fileId: result.id,
				status: result.status,
				fileType: result.fileType,
				filename: result.filename
			}
		);

		return { success, fileId: result.id };
	} catch (error) {
		logTestResult('Test 1: End-to-End Processing', false, error.message, {
			errorCode: error.code,
			errorStage: error.stage
		});
		return { success: false };
	}
}

/**
 * Test 2: Duplicate File Detection (Per-User Scoped - FIX 1)
 */
async function test2_DuplicateDetection(test1Result) {
	const { processFile, FileProcessorError } = await loadModules();
	console.log('\n=== Test 2: Duplicate File Detection (Per-User Scoped) ===');

	try {
		const testContent = 'This is test content for duplicate detection';
		const userId = generateTestUUID();
		const fileBuffer = createTestFileBuffer(1000, testContent);

		// First upload - should succeed
		const result1 = await processFile({
			fileBuffer: fileBuffer,
			filename: 'duplicate-test.txt',
			userId: userId,
			contentType: 'text/plain'
		});

		if (result1.status !== 'ready') {
			throw new Error('First upload should succeed');
		}

		// Second upload - same file, same user (should fail with DUPLICATE_FILE)
		try {
			const result2 = await processFile({
				fileBuffer: fileBuffer,
				filename: 'duplicate-test-2.txt',
				userId: userId,
				contentType: 'text/plain'
			});

			logTestResult(
				'Test 2: Duplicate Detection',
				false,
				'Second upload should have thrown DUPLICATE_FILE error',
				{ result: result2 }
			);
			return { success: false };
		} catch (error) {
			if (error instanceof FileProcessorError && error.code === 'DUPLICATE_FILE') {
				logTestResult(
					'Test 2: Duplicate Detection',
					true,
					'Duplicate detection correctly rejected second upload (per-user scoped)',
					{
						firstFileId: result1.id,
						errorCode: error.code,
						message: error.message
					}
				);
				return { success: true };
			} else {
				throw error;
			}
		}
	} catch (error) {
		logTestResult(
			'Test 2: Duplicate Detection',
			false,
			error instanceof Error ? error.message : String(error),
			{ errorCode: error.code }
		);
		return { success: false };
	}
}

/**
 * Test 3: Large File (Near 10MB Limit)
 */
async function test3_LargeFile() {
	const { processFile } = await loadModules();
	console.log('\n=== Test 3: Large File (Near 10MB Limit) ===');

	try {
		// 9.9MB file
		const largeBuffer = createLargeFileBuffer(9.9 * 1024 * 1024);
		const testContent = 'Large file test content: ' + 'x'.repeat(1000);

		const result = await processFile({
			fileBuffer: Buffer.concat([
				Buffer.from(testContent),
				largeBuffer
			]),
			filename: 'large-file.bin',
			userId: generateTestUUID(),
			contentType: 'application/octet-stream'
		});

		const success = result.status === 'ready';
		logTestResult(
			'Test 3: Large File (Near 10MB)',
			success,
			success
				? 'Large file (9.9MB+) processed successfully'
				: `Processing returned status: ${result.status}`,
			{ fileId: result.id, fileSize: '9.9MB+' }
		);

		return { success };
	} catch (error) {
		logTestResult(
			'Test 3: Large File (Near 10MB)',
			false,
			error instanceof Error ? error.message : String(error),
			{ errorCode: error.code }
		);
		return { success: false };
	}
}

/**
 * Test 4: File Over Size Limit (10.1MB)
 */
async function test4_FileTooLarge() {
	const { processFile, FileProcessorError } = await loadModules();
	console.log('\n=== Test 4: File Over Size Limit ===');

	try {
		// 10.1MB file - should exceed limit
		const oversizeBuffer = createLargeFileBuffer(10.1 * 1024 * 1024);

		try {
			const result = await processFile({
				fileBuffer: oversizeBuffer,
				filename: 'oversized.bin',
				userId: generateTestUUID(),
				contentType: 'application/octet-stream'
			});

			logTestResult(
				'Test 4: File Over Size Limit',
				false,
				'Should have thrown VALIDATION_ERROR for file > 10MB',
				{ result }
			);
			return { success: false };
		} catch (error) {
			if (error instanceof FileProcessorError && error.code === 'VALIDATION_ERROR') {
				logTestResult(
					'Test 4: File Over Size Limit',
					true,
					'Correctly rejected file over 10MB limit with VALIDATION_ERROR',
					{
						errorCode: error.code,
						errorMessage: error.message
					}
				);
				return { success: true };
			} else {
				throw error;
			}
		}
	} catch (error) {
		logTestResult(
			'Test 4: File Over Size Limit',
			false,
			error instanceof Error ? error.message : String(error),
			{ errorCode: error.code }
		);
		return { success: false };
	}
}

/**
 * Test 5: Progress Callbacks
 */
async function test5_ProgressCallbacks() {
	const { processFile } = await loadModules();
	console.log('\n=== Test 5: Progress Callbacks ===');

	try {
		const progressUpdates = [];

		const result = await processFile(
			{
				fileBuffer: createTestFileBuffer(5000, 'Test file for progress tracking'),
				filename: 'progress-test.txt',
				userId: generateTestUUID(),
				contentType: 'text/plain'
			},
			{
				onProgress: (update) => {
					progressUpdates.push(update);
				}
			}
		);

		// Verify progress updates
		const hasUpdates = progressUpdates.length > 0;
		const progressIncreases = progressUpdates.every((u, i) => {
			return i === 0 || u.progress >= progressUpdates[i - 1].progress;
		});
		const hasAllStages = ['extraction', 'compression', 'embedding', 'finalization'].every((stage) =>
			progressUpdates.some((u) => u.stage === stage)
		);
		const hasFinalProgress = progressUpdates[progressUpdates.length - 1]?.progress === 100;

		const success =
			result.status === 'ready' &&
			hasUpdates &&
			progressIncreases &&
			hasAllStages &&
			hasFinalProgress;

		logTestResult(
			'Test 5: Progress Callbacks',
			success,
			success
				? 'Progress callbacks fired with correct stages and progression'
				: 'Progress tracking incomplete',
			{
				totalUpdates: progressUpdates.length,
				stages: [...new Set(progressUpdates.map((u) => u.stage))],
				progressRange: [
					progressUpdates[0]?.progress,
					progressUpdates[progressUpdates.length - 1]?.progress
				],
				sampleUpdates: progressUpdates.slice(0, 3)
			}
		);

		return { success };
	} catch (error) {
		logTestResult(
			'Test 5: Progress Callbacks',
			false,
			error instanceof Error ? error.message : String(error)
		);
		return { success: false };
	}
}

/**
 * Test 6: Invalid User ID
 */
async function test6_InvalidUserID() {
	const { processFile, FileProcessorError } = await loadModules();
	console.log('\n=== Test 6: Invalid User ID ===');

	try {
		try {
			const result = await processFile({
				fileBuffer: createTestFileBuffer(1000, 'Test content'),
				filename: 'test.txt',
				userId: 'not-a-valid-uuid',
				contentType: 'text/plain'
			});

			logTestResult(
				'Test 6: Invalid User ID',
				false,
				'Should have thrown VALIDATION_ERROR for invalid UUID',
				{ result }
			);
			return { success: false };
		} catch (error) {
			if (error instanceof FileProcessorError && error.code === 'VALIDATION_ERROR') {
				logTestResult(
					'Test 6: Invalid User ID',
					true,
					'Correctly rejected invalid user ID with VALIDATION_ERROR',
					{
						errorCode: error.code,
						errorMessage: error.message
					}
				);
				return { success: true };
			} else {
				throw error;
			}
		}
	} catch (error) {
		logTestResult(
			'Test 6: Invalid User ID',
			false,
			error instanceof Error ? error.message : String(error),
			{ errorCode: error.code }
		);
		return { success: false };
	}
}

/**
 * Test 7: Missing Filename
 */
async function test7_MissingFilename() {
	const { processFile, FileProcessorError } = await loadModules();
	console.log('\n=== Test 7: Missing Filename ===');

	try {
		try {
			const result = await processFile({
				fileBuffer: createTestFileBuffer(1000, 'Test content'),
				filename: '',
				userId: generateTestUUID(),
				contentType: 'text/plain'
			});

			logTestResult(
				'Test 7: Missing Filename',
				false,
				'Should have thrown VALIDATION_ERROR for empty filename',
				{ result }
			);
			return { success: false };
		} catch (error) {
			if (error instanceof FileProcessorError && error.code === 'VALIDATION_ERROR') {
				logTestResult(
					'Test 7: Missing Filename',
					true,
					'Correctly rejected empty filename with VALIDATION_ERROR',
					{
						errorCode: error.code,
						errorMessage: error.message
					}
				);
				return { success: true };
			} else {
				throw error;
			}
		}
	} catch (error) {
		logTestResult(
			'Test 7: Missing Filename',
			false,
			error instanceof Error ? error.message : String(error),
			{ errorCode: error.code }
		);
		return { success: false };
	}
}

/**
 * Test 8: Skip Duplicate Check Option
 */
async function test8_SkipDuplicateCheck() {
	const { processFile } = await loadModules();
	console.log('\n=== Test 8: Skip Duplicate Check Option ===');

	try {
		const testContent = 'Content for skip duplicate test';
		const userId = generateTestUUID();
		const fileBuffer = createTestFileBuffer(1000, testContent);

		// First upload
		const result1 = await processFile({
			fileBuffer: fileBuffer,
			filename: 'test1.txt',
			userId: userId,
			contentType: 'text/plain'
		});

		if (result1.status !== 'ready') {
			throw new Error('First upload failed');
		}

		// Second upload - same file, but with skipDuplicateCheck=true
		const result2 = await processFile(
			{
				fileBuffer: fileBuffer,
				filename: 'test2.txt',
				userId: userId,
				contentType: 'text/plain'
			},
			{ skipDuplicateCheck: true }
		);

		const success = result2.status === 'ready' && result2.id !== result1.id;

		logTestResult(
			'Test 8: Skip Duplicate Check',
			success,
			success
				? 'skipDuplicateCheck flag allows processing duplicate content'
				: 'Second upload should succeed when skipDuplicateCheck=true',
			{
				firstFileId: result1.id,
				secondFileId: result2.id,
				bothReady: result1.status === 'ready' && result2.status === 'ready'
			}
		);

		return { success };
	} catch (error) {
		logTestResult(
			'Test 8: Skip Duplicate Check',
			false,
			error instanceof Error ? error.message : String(error),
			{ errorCode: error.code }
		);
		return { success: false };
	}
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

/**
 * Run all tests
 */
async function runAllTests() {
	console.log('='.repeat(80));
	console.log('FILE PROCESSOR TEST SUITE');
	console.log('Testing: Extract → Compress → Embed → Store Pipeline');
	console.log('='.repeat(80));

	const test1Result = await test1_EndToEndProcessing();
	const test2Result = await test2_DuplicateDetection(test1Result);
	const test3Result = await test3_LargeFile();
	const test4Result = await test4_FileTooLarge();
	const test5Result = await test5_ProgressCallbacks();
	const test6Result = await test6_InvalidUserID();
	const test7Result = await test7_MissingFilename();
	const test8Result = await test8_SkipDuplicateCheck();

	printSummary();

	// Exit with appropriate code
	process.exit(testsFailed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch((error) => {
	console.error('Fatal error during test execution:', error);
	process.exit(1);
});
