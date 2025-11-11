import { readFile } from 'fs/promises';
import { extractText, validateFileSize, generateContentHash } from './src/lib/file-extraction.ts';

async function testExtraction(filepath) {
	console.log(`\n=== Testing: ${filepath} ===`);
	try {
		const buffer = await readFile(filepath);
		const result = await extractText(buffer, filepath.split('/').pop());

		console.log('Success:', result.success);
		console.log('File Type:', result.fileType);
		console.log('Extension:', result.extension);
		console.log('Size:', result.fileSizeBytes, 'bytes');
		console.log('Hash:', result.contentHash.substring(0, 16) + '...');
		console.log('Word Count:', result.wordCount);
		console.log('Char Count:', result.charCount);
		console.log('Text Preview:', result.text.substring(0, 100).replace(/\n/g, ' '));
		if (result.warnings) {
			console.log('Warnings:', result.warnings);
		}
	} catch (error) {
		console.error('Error:', error.message);
		if (error.code) console.error('Code:', error.code);
	}
}

async function testValidateFileSize() {
	console.log('\n=== Testing File Size Validation ===');

	// Test empty file
	try {
		validateFileSize(Buffer.from([]), 10);
		console.log('FAIL: Empty file should throw error');
	} catch (error) {
		console.log('PASS: Empty file throws error:', error.code);
	}

	// Test oversized file
	try {
		const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
		validateFileSize(largeBuffer, 10);
		console.log('FAIL: Oversized file should throw error');
	} catch (error) {
		console.log('PASS: Oversized file throws error:', error.code);
	}

	// Test valid file
	try {
		const validBuffer = Buffer.alloc(5 * 1024 * 1024); // 5MB
		validateFileSize(validBuffer, 10);
		console.log('PASS: Valid file passes validation');
	} catch (error) {
		console.log('FAIL: Valid file should not throw error');
	}
}

async function testGenerateContentHash() {
	console.log('\n=== Testing Content Hash Generation ===');

	const buffer1 = Buffer.from('Hello World');
	const buffer2 = Buffer.from('Hello World');
	const buffer3 = Buffer.from('Different Content');

	const hash1 = await generateContentHash(buffer1);
	const hash2 = await generateContentHash(buffer2);
	const hash3 = await generateContentHash(buffer3);

	console.log('Hash 1:', hash1);
	console.log('Hash 2:', hash2);
	console.log('Hash 3:', hash3);
	console.log('PASS: Identical buffers have same hash:', hash1 === hash2);
	console.log('PASS: Different buffers have different hash:', hash1 !== hash3);
}

async function runTests() {
	await testValidateFileSize();
	await testGenerateContentHash();

	// Test various file types
	await testExtraction('test-files/test.pdf');
	await testExtraction('test-files/test.txt');
	await testExtraction('test-files/test.md');
	await testExtraction('test-files/test.js');
	await testExtraction('test-files/test.ts');
	await testExtraction('test-files/test.csv');
	await testExtraction('test-files/test.png');
	await testExtraction('test-files/test-empty.txt');
}

runTests().catch(console.error);
