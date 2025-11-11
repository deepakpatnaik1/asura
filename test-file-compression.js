/**
 * Manual test script for file compression library
 * Tests the compressFile() function with various file types and error scenarios
 */

// Note: This test script requires the TypeScript to be compiled first
// Run with: node test-file-compression.js

import fs from 'fs';
import path from 'path';

// Dynamic import to allow TypeScript modules
async function loadCompressor() {
	try {
		// Try importing the compiled JavaScript
		const { compressFile, FileCompressionError } = await import(
			'./src/lib/file-compressor.ts'
		);
		return { compressFile, FileCompressionError };
	} catch (error) {
		console.error('Failed to load file-compressor:', error.message);
		process.exit(1);
	}
}

/**
 * Test: Basic file compression
 */
async function testCompressionBasic() {
	const { compressFile } = await loadCompressor();
	console.log('\n=== Test 1: Basic File Compression ===');

	try {
		const result = await compressFile({
			extractedText:
				'Q3 2025 Financial Results: Revenue $5.2M, Operating margin 15%, Customer acquisition cost $850, Monthly churn rate 2.3%. Key strategic decision: Pivot to B2B enterprise focus over SMB self-serve. Rejected SMB approach due to high support costs.',
			filename: 'quarterly-report.pdf',
			fileType: 'pdf'
		});

		console.log('✓ PASS: Basic compression completed');
		console.log('  Filename:', result.filename);
		console.log('  File Type:', result.fileType);
		console.log('  Description Length:', result.description.length, 'chars');
		console.log('  Description:', result.description.substring(0, 150) + '...');
		return true;
	} catch (error) {
		console.log('✗ FAIL: Basic compression failed');
		console.error('  Error:', error.message);
		return false;
	}
}

/**
 * Test: Empty content validation
 */
async function testCompressionEmptyContent() {
	const { compressFile, FileCompressionError } = await loadCompressor();
	console.log('\n=== Test 2: Empty Content Validation ===');

	try {
		await compressFile({
			extractedText: '',
			filename: 'empty.txt',
			fileType: 'text'
		});

		console.log('✗ FAIL: Should have thrown error for empty content');
		return false;
	} catch (error) {
		if (error instanceof FileCompressionError && error.code === 'EMPTY_CONTENT') {
			console.log('✓ PASS: Empty content throws EMPTY_CONTENT error');
			console.log('  Error message:', error.message);
			return true;
		} else {
			console.log('✗ FAIL: Wrong error code or type');
			console.error('  Error:', error.message, 'Code:', error.code);
			return false;
		}
	}
}

/**
 * Test: Invalid file type validation
 */
async function testCompressionInvalidFileType() {
	const { compressFile, FileCompressionError } = await loadCompressor();
	console.log('\n=== Test 3: Invalid File Type Validation ===');

	try {
		await compressFile({
			extractedText: 'Some content',
			filename: 'test.xyz',
			fileType: 'invalid' // Invalid type
		});

		console.log('✗ FAIL: Should have thrown error for invalid file type');
		return false;
	} catch (error) {
		if (error instanceof FileCompressionError && error.code === 'INVALID_FILE_TYPE') {
			console.log('✓ PASS: Invalid file type throws INVALID_FILE_TYPE error');
			console.log('  Error message:', error.message);
			return true;
		} else {
			console.log('✗ FAIL: Wrong error code or type');
			console.error('  Error:', error.message, 'Code:', error.code);
			return false;
		}
	}
}

/**
 * Test: Multiple file types compression
 */
async function testCompressionMultipleTypes() {
	const { compressFile } = await loadCompressor();
	console.log('\n=== Test 4: Multiple File Types ===');

	const tests = [
		{
			name: 'PDF with financial data',
			input: {
				extractedText:
					'Investment Summary: Seed round $2M at $10M valuation. Led by Sequoia. Use of funds: 50% engineering, 30% sales, 20% operations. Runway: 24 months at current burn rate of $85K/month.',
				filename: 'seed-summary.pdf',
				fileType: 'pdf'
			}
		},
		{
			name: 'Code file',
			input: {
				extractedText:
					'function compressText(text) { const words = text.split(/\\s+/); const compressed = words.slice(0, 50).join(" "); return compressed.length < text.length ? compressed + "..." : compressed; }',
				filename: 'text-utils.js',
				fileType: 'code'
			}
		},
		{
			name: 'Text file with decisions',
			input: {
				extractedText:
					'Product Strategy Meeting Notes: Decision 1: Ship PLG freemium model first. Decision 2: Target SMB initially before enterprise. Rejected: Direct sales approach (too expensive). Next steps: Build free tier, launch in 3 weeks.',
				filename: 'strategy-notes.md',
				fileType: 'text'
			}
		},
		{
			name: 'Spreadsheet data',
			input: {
				extractedText:
					'Customer metrics spreadsheet: 150 rows, 8 columns (ID, name, ARR, churn, NPS, sign-up date, contract end, segment). Total ARR: $4.2M. Average NPS: 42. Segments: Enterprise 60%, Mid-market 25%, SMB 15%.',
				filename: 'customer-metrics.csv',
				fileType: 'spreadsheet'
			}
		}
	];

	let passed = 0;
	let failed = 0;

	for (const test of tests) {
		try {
			const result = await compressFile(test.input);
			console.log(`  ✓ ${test.name}`);
			console.log(`    Description length: ${result.description.length} chars`);
			console.log(`    Preview: ${result.description.substring(0, 100)}...`);
			passed++;
		} catch (error) {
			console.log(`  ✗ ${test.name}: ${error.message}`);
			failed++;
		}
	}

	console.log(`\nSummary: ${passed}/${tests.length} file types compressed successfully`);
	return failed === 0;
}

/**
 * Test: Preserves non-inferable information
 */
async function testNonInferableInfoPreserved() {
	const { compressFile } = await loadCompressor();
	console.log('\n=== Test 5: Non-Inferable Information Preservation ===');

	const testContent =
		'Project Alpha: Status update from Q3. Revenue increased from $1.2M to $1.8M (50% growth). Team grew from 8 to 12 people. Key hires: VP Sales (from Slack), Senior Engineer (from Google). Churn decreased from 5% to 3%. Main strategy change: Moved from freemium to enterprise-first sales. Risks identified: Market saturation in North America, competition from larger players.';

	try {
		const result = await compressFile({
			extractedText: testContent,
			filename: 'project-alpha-update.pdf',
			fileType: 'pdf'
		});

		// Check that numerical data is preserved
		const hasNumbers = /\d+/.test(result.description);
		// Check that business terms are present
		const hasBusinessTerms = /revenue|growth|churn|strategy|risk/i.test(result.description);

		if (hasNumbers && hasBusinessTerms) {
			console.log('✓ PASS: Non-inferable information preserved');
			console.log('  - Contains numerical data: YES');
			console.log('  - Contains business terms: YES');
			console.log('  - Description:', result.description);
			return true;
		} else {
			console.log('✗ FAIL: Important information was lost during compression');
			console.log('  - Contains numerical data:', hasNumbers);
			console.log('  - Contains business terms:', hasBusinessTerms);
			console.log('  - Description:', result.description);
			return false;
		}
	} catch (error) {
		console.log('✗ FAIL: Compression failed');
		console.error('  Error:', error.message);
		return false;
	}
}

/**
 * Test: Real file from test-files directory
 */
async function testRealFile() {
	const { compressFile } = await loadCompressor();
	console.log('\n=== Test 6: Real File Compression ===');

	try {
		const testFilePath = path.join(process.cwd(), 'test-files', 'test-strategic.md');

		if (!fs.existsSync(testFilePath)) {
			console.log('⊘ SKIP: Test file not found at', testFilePath);
			return true;
		}

		const fileContent = fs.readFileSync(testFilePath, 'utf-8');

		if (fileContent.length === 0) {
			console.log('⊘ SKIP: Test file is empty');
			return true;
		}

		const result = await compressFile({
			extractedText: fileContent,
			filename: 'test-strategic.md',
			fileType: 'text'
		});

		console.log('✓ PASS: Real file compression succeeded');
		console.log('  File size:', fileContent.length, 'chars');
		console.log('  Compressed size:', result.description.length, 'chars');
		console.log('  Compression ratio:', (
			((fileContent.length - result.description.length) / fileContent.length) * 100
		).toFixed(1) + '%');
		console.log('  Description:', result.description);
		return true;
	} catch (error) {
		console.log('✗ FAIL: Real file compression failed');
		console.error('  Error:', error.message);
		return false;
	}
}

/**
 * Main test runner
 */
async function runAllTests() {
	console.log('========================================');
	console.log('File Compression Library Test Suite');
	console.log('========================================');

	// Check environment first
	if (!process.env.FIREWORKS_API_KEY) {
		console.error('\nERROR: FIREWORKS_API_KEY not set in environment');
		console.error('Please set: export FIREWORKS_API_KEY="your-key"');
		process.exit(1);
	}

	console.log('Environment check: FIREWORKS_API_KEY is set ✓');

	const results = [];

	try {
		results.push(['Basic Compression', await testCompressionBasic()]);
		results.push(['Empty Content Validation', await testCompressionEmptyContent()]);
		results.push(['Invalid File Type', await testCompressionInvalidFileType()]);
		results.push(['Multiple File Types', await testCompressionMultipleTypes()]);
		results.push(['Non-Inferable Info', await testNonInferableInfoPreserved()]);
		results.push(['Real File Compression', await testRealFile()]);
	} catch (error) {
		console.error('\nFATAL ERROR during test execution:', error.message);
		console.error(error.stack);
		process.exit(1);
	}

	// Print summary
	console.log('\n========================================');
	console.log('Test Summary');
	console.log('========================================');

	const passed = results.filter(([_, result]) => result).length;
	const total = results.length;

	for (const [testName, result] of results) {
		const status = result ? '✓ PASS' : '✗ FAIL';
		console.log(`${status}: ${testName}`);
	}

	console.log(`\nTotal: ${passed}/${total} tests passed`);

	if (passed === total) {
		console.log('\n✓ All tests passed!');
		process.exit(0);
	} else {
		console.log(`\n✗ ${total - passed} test(s) failed`);
		process.exit(1);
	}
}

// Run tests
runAllTests().catch((error) => {
	console.error('Unhandled error:', error);
	process.exit(1);
});
