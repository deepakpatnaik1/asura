/**
 * Quick validation test for file compression library
 * Tests only input validation (no API calls)
 */

import { compressFile, FileCompressionError } from './src/lib/file-compressor';

async function testValidation() {
	console.log('========================================');
	console.log('File Compression - Input Validation Tests');
	console.log('========================================\n');

	// Test 1: Empty content
	console.log('Test 1: Empty content validation');
	try {
		await compressFile({
			extractedText: '',
			filename: 'empty.txt',
			fileType: 'text'
		});
		console.log('✗ FAIL: Should have thrown EMPTY_CONTENT error\n');
	} catch (error) {
		if (error instanceof FileCompressionError && error.code === 'EMPTY_CONTENT') {
			console.log('✓ PASS: Correctly throws EMPTY_CONTENT error');
			console.log(`  Message: ${error.message}\n`);
		} else {
			console.log(`✗ FAIL: Wrong error - ${error.code}\n`);
		}
	}

	// Test 2: Whitespace-only content
	console.log('Test 2: Whitespace-only content validation');
	try {
		await compressFile({
			extractedText: '   \n\n\t  ',
			filename: 'whitespace.txt',
			fileType: 'text'
		});
		console.log('✗ FAIL: Should have thrown EMPTY_CONTENT error\n');
	} catch (error) {
		if (error instanceof FileCompressionError && error.code === 'EMPTY_CONTENT') {
			console.log('✓ PASS: Correctly throws EMPTY_CONTENT error for whitespace\n');
		}
	}

	// Test 3: Invalid file type
	console.log('Test 3: Invalid file type validation');
	try {
		await compressFile({
			extractedText: 'Some content',
			filename: 'test.xyz',
			fileType: 'invalid' as any
		});
		console.log('✗ FAIL: Should have thrown INVALID_FILE_TYPE error\n');
	} catch (error) {
		if (error instanceof FileCompressionError && error.code === 'INVALID_FILE_TYPE') {
			console.log('✓ PASS: Correctly throws INVALID_FILE_TYPE error');
			console.log(`  Message: ${error.message}\n`);
		} else {
			console.log(`✗ FAIL: Wrong error - ${error.code}\n`);
		}
	}

	// Test 4: Valid inputs accepted (but will fail on API call)
	console.log('Test 4: Valid inputs pass validation');
	const validTests = [
		{ text: 'PDF content', file: 'doc.pdf', type: 'pdf' as const },
		{ text: 'Code here', file: 'app.js', type: 'code' as const },
		{ text: 'Text content', file: 'notes.txt', type: 'text' as const },
		{ text: 'Image description', file: 'pic.png', type: 'image' as const },
		{ text: 'Spreadsheet data', file: 'data.csv', type: 'spreadsheet' as const },
		{ text: 'Unknown type', file: 'unknown.xyz', type: 'other' as const }
	];

	for (const test of validTests) {
		try {
			await compressFile({
				extractedText: test.text,
				filename: test.file,
				fileType: test.type
			});
			console.log(`  ✓ ${test.type}: Passed input validation (would call API)`);
		} catch (error) {
			if (error instanceof FileCompressionError &&
				(error.code === 'API_ERROR' || error.code === 'EMPTY_CONTENT' || error.code === 'INVALID_FILE_TYPE')) {
				// API_ERROR means validation passed, API call failed
				if (error.code === 'API_ERROR') {
					console.log(`  ✓ ${test.type}: Input validation passed (API call failed as expected)`);
				} else {
					console.log(`  ✗ ${test.type}: Validation error - ${error.code}`);
				}
			} else {
				console.log(`  ? ${test.type}: Unexpected error - ${error.code}`);
			}
		}
	}

	console.log('\n========================================');
	console.log('Input Validation Tests Complete');
	console.log('========================================');
}

testValidation().catch(console.error);
