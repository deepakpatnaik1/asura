// Test script for Upload API
import { readFile } from 'fs/promises';
import { FormData, Blob } from 'formdata-node';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const API_URL = 'http://localhost:5173/api/files/upload';

// Use service role key to clean up test data
const supabase = createClient(
	process.env.PUBLIC_SUPABASE_URL,
	process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanupTestFiles() {
	// Delete test files from previous runs
	await supabase.from('files').delete().in('filename', [
		'strategic-journal.md',
		'large.pdf'
	]);
}

async function testUpload() {
	console.log('1. Testing file upload...');

	const buffer = await readFile('test-files/strategic-journal.md');
	const formData = new FormData();
	formData.append('file', new Blob([buffer]), 'strategic-journal.md');

	const response = await fetch(API_URL, {
		method: 'POST',
		body: formData
	});

	const result = await response.json();

	if (response.status !== 201) {
		console.error(`   ✗ Expected 201, got ${response.status}`);
		console.error(`   Response:`, result);
		throw new Error(`Upload failed with status ${response.status}`);
	}

	console.assert(response.status === 201, `Expected 201, got ${response.status}`);
	console.assert(result.fileId, 'Should return fileId');
	console.assert(result.filename === 'strategic-journal.md', 'Filename matches');
	console.assert(result.status === 'processing', 'Status is processing');
	console.assert(!result.isDuplicate, 'Should not be marked as duplicate');

	console.log('   ✓ Upload test passed');
	console.log(`   File ID: ${result.fileId}`);
	return result.fileId;
}

async function testDuplicateUpload() {
	console.log('\n2. Testing duplicate upload detection...');

	const buffer = await readFile('test-files/strategic-journal.md');
	const formData1 = new FormData();
	formData1.append('file', new Blob([buffer]), 'strategic-journal.md');

	// First upload
	const response1 = await fetch(API_URL, {
		method: 'POST',
		body: formData1
	});

	const result1 = await response1.json();
	const firstFileId = result1.fileId;

	// Second upload (same content)
	const formData2 = new FormData();
	formData2.append('file', new Blob([buffer]), 'strategic-journal.md');

	const response2 = await fetch(API_URL, {
		method: 'POST',
		body: formData2
	});

	const result2 = await response2.json();

	console.assert(response2.status === 200, `Expected 200, got ${response2.status}`);
	console.assert(result2.isDuplicate === true, 'Should mark as duplicate');
	console.assert(result2.fileId === firstFileId, 'Should return same fileId');

	console.log('   ✓ Duplicate upload test passed');
	console.log(`   Returned existing file ID: ${result2.fileId}`);
}

async function testFileTooLarge() {
	console.log('\n3. Testing file size validation...');

	const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
	const formData = new FormData();
	formData.append('file', new Blob([largeBuffer]), 'large.pdf');

	const response = await fetch(API_URL, {
		method: 'POST',
		body: formData
	});

	console.assert(response.status === 400, `Expected 400, got ${response.status}`);

	const result = await response.json();
	console.assert(result.error, 'Should return error message');
	console.assert(
		result.error.toLowerCase().includes('exceed') || result.error.toLowerCase().includes('large'),
		'Error mentions size issue'
	);

	console.log('   ✓ File too large test passed');
	console.log(`   Error message: "${result.error}"`);
}

async function testNoFile() {
	console.log('\n4. Testing missing file...');

	const formData = new FormData();
	// No file attached

	const response = await fetch(API_URL, {
		method: 'POST',
		body: formData
	});

	console.assert(response.status === 400, `Expected 400, got ${response.status}`);

	const result = await response.json();
	console.assert(result.error === 'No file provided', 'Should return no file error');

	console.log('   ✓ No file test passed');
	console.log(`   Error message: "${result.error}"`);
}

async function testProcessingStarted(fileId) {
	console.log('\n5. Testing background processing started...');

	// Wait a moment for processing to start
	await new Promise(resolve => setTimeout(resolve, 1000));

	// Check database for file record
	const { data: file, error } = await supabase
		.from('files')
		.select('id, filename, status, progress, processing_stage')
		.eq('id', fileId)
		.single();

	if (error) {
		console.error('   ✗ Failed to fetch file record:', error);
		return;
	}

	console.assert(file, 'File record should exist');
	console.assert(file.status === 'processing' || file.status === 'ready', 'Status should be processing or ready');
	console.assert(file.progress !== undefined, 'Progress should be set');

	console.log('   ✓ Background processing test passed');
	console.log(`   File status: ${file.status}, progress: ${file.progress}%, stage: ${file.processing_stage || 'complete'}`);
}

async function runAllTests() {
	console.log('=== Upload API Tests ===\n');

	try {
		// Clean up before tests
		await cleanupTestFiles();

		// Run tests
		const fileId = await testUpload();
		await testDuplicateUpload();
		await testFileTooLarge();
		await testNoFile();
		await testProcessingStarted(fileId);

		console.log('\n=== All upload API tests passed! ===');
	} catch (error) {
		console.error('\n✗ Test failed:', error);
		process.exit(1);
	}
}

runAllTests();
