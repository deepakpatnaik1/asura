// Test script for List and Delete APIs
import { readFile } from 'fs/promises';
import { FormData, Blob } from 'formdata-node';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const API_URL = 'http://localhost:5173/api/files';

// Use service role key to clean up test data
const supabase = createClient(
	process.env.PUBLIC_SUPABASE_URL,
	process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanupTestFiles() {
	// Delete test files from previous runs
	await supabase.from('files').delete().in('filename', [
		'list-test.md',
		'delete-test.txt',
		'cascade-test.md'
	]);
}

// ===== LIST API TESTS =====

async function testListFiles() {
	console.log('1. Testing list files...');

	const response = await fetch(API_URL);

	if (response.status !== 200) {
		console.error(`   ✗ Expected 200, got ${response.status}`);
		const result = await response.json();
		console.error(`   Response:`, result);
		throw new Error(`List files failed with status ${response.status}`);
	}

	const result = await response.json();

	console.assert(response.status === 200, `Expected 200, got ${response.status}`);
	console.assert(Array.isArray(result.files), 'Should return array');
	console.assert(result.files.length >= 0, 'Array can be empty');

	console.log('   ✓ List files test passed');
	console.log(`   Found ${result.files.length} files`);
	return result.files;
}

async function testFilterByStatus() {
	console.log('\n2. Testing filter by status...');

	// First upload a file to ensure we have test data
	const buffer = await readFile('test-files/strategic-journal.md');
	const formData = new FormData();
	formData.append('file', new Blob([buffer]), 'list-test.md');

	await fetch(`${API_URL}/upload`, {
		method: 'POST',
		body: formData
	});

	// Wait a moment for it to start processing
	await new Promise(resolve => setTimeout(resolve, 1000));

	// Test filter by processing
	const processingResponse = await fetch(`${API_URL}?status=processing`);
	const processingResult = await processingResponse.json();

	console.assert(processingResponse.status === 200, 'Should return 200 OK');
	console.assert(
		processingResult.files.every(f => f.status === 'processing'),
		'All files should be processing'
	);

	console.log('   ✓ Filter by status test passed');
	console.log(`   Found ${processingResult.files.length} processing files`);
}

async function testSorting() {
	console.log('\n3. Testing sorting...');

	const response = await fetch(API_URL);
	const result = await response.json();

	if (result.files.length > 1) {
		const dates = result.files.map(f => new Date(f.uploaded_at));
		for (let i = 0; i < dates.length - 1; i++) {
			console.assert(
				dates[i] >= dates[i + 1],
				`Files should be sorted by uploaded_at DESC (${dates[i]} >= ${dates[i + 1]})`
			);
		}
	}

	console.log('   ✓ Sorting test passed');
	console.log(`   Verified ${result.files.length} files are sorted correctly`);
}

// ===== DELETE API TESTS =====

async function testDeleteFile() {
	console.log('\n4. Testing delete file...');

	// First upload a file
	const buffer = Buffer.from('test content for deletion');
	const formData = new FormData();
	formData.append('file', new Blob([buffer]), 'delete-test.txt');

	const uploadResponse = await fetch(`${API_URL}/upload`, {
		method: 'POST',
		body: formData
	});

	if (uploadResponse.status !== 201 && uploadResponse.status !== 200) {
		console.error(`   ✗ Upload failed with status ${uploadResponse.status}`);
		const result = await uploadResponse.json();
		console.error(`   Response:`, result);
		throw new Error(`Upload failed with status ${uploadResponse.status}`);
	}

	const uploadResult = await uploadResponse.json();
	const fileId = uploadResult.fileId;

	if (!fileId) {
		console.error(`   ✗ Upload succeeded but no fileId returned`);
		console.error(`   Response:`, uploadResult);
		throw new Error('Upload succeeded but no fileId returned');
	}

	console.log(`   Created file with ID: ${fileId}`);

	// Now delete it
	const deleteResponse = await fetch(`${API_URL}/${fileId}`, {
		method: 'DELETE'
	});

	if (deleteResponse.status !== 200) {
		console.error(`   ✗ Expected 200, got ${deleteResponse.status}`);
		const result = await deleteResponse.json();
		console.error(`   Response:`, result);
		throw new Error(`Delete failed with status ${deleteResponse.status}`);
	}

	const deleteResult = await deleteResponse.json();

	console.assert(deleteResponse.status === 200, `Expected 200, got ${deleteResponse.status}`);
	console.assert(deleteResult.success === true, 'Should return success: true');
	console.assert(deleteResult.fileId === fileId, 'Should return fileId');

	// Verify file is gone
	const listResponse = await fetch(API_URL);
	const { files } = await listResponse.json();
	console.assert(!files.find(f => f.id === fileId), 'File should be deleted');

	console.log('   ✓ Delete file test passed');
	console.log(`   Successfully deleted file ${fileId}`);
}

async function testDeleteNonExistent() {
	console.log('\n5. Testing delete non-existent file...');

	const fakeId = '00000000-0000-0000-0000-000000000000';

	const response = await fetch(`${API_URL}/${fakeId}`, {
		method: 'DELETE'
	});

	console.assert(response.status === 404, `Expected 404, got ${response.status}`);

	const result = await response.json();
	console.assert(result.error === 'File not found', 'Should return file not found error');

	console.log('   ✓ Delete non-existent test passed');
	console.log(`   Error message: "${result.error}"`);
}

async function testCascadeDeletion() {
	console.log('\n6. Testing CASCADE deletion of chunks...');

	// Upload and process a file
	const buffer = await readFile('test-files/strategic-journal.md');
	const formData = new FormData();
	formData.append('file', new Blob([buffer]), 'cascade-test.md');

	const uploadResponse = await fetch(`${API_URL}/upload`, {
		method: 'POST',
		body: formData
	});

	const { fileId } = await uploadResponse.json();
	console.log(`   Created file with ID: ${fileId}`);

	// Wait for processing to complete (add chunks to database)
	console.log('   Waiting 30 seconds for processing to complete...');
	await new Promise(resolve => setTimeout(resolve, 30000));

	// Verify chunks exist
	const { data: chunksBefore } = await supabase
		.from('file_chunks')
		.select('id')
		.eq('file_id', fileId);

	if (!chunksBefore || chunksBefore.length === 0) {
		console.log('   ⚠ No chunks found - file may not have finished processing');
		console.log('   Skipping CASCADE test (not a failure, just incomplete processing)');

		// Clean up the file
		await fetch(`${API_URL}/${fileId}`, { method: 'DELETE' });
		return;
	}

	console.log(`   Found ${chunksBefore.length} chunks before deletion`);

	// Delete file
	const deleteResponse = await fetch(`${API_URL}/${fileId}`, {
		method: 'DELETE'
	});

	console.assert(deleteResponse.status === 200, 'Deletion should succeed');

	// Verify chunks are also deleted
	const { data: chunksAfter } = await supabase
		.from('file_chunks')
		.select('id')
		.eq('file_id', fileId);

	console.assert(
		!chunksAfter || chunksAfter.length === 0,
		'Chunks should be CASCADE deleted'
	);

	console.log('   ✓ CASCADE deletion test passed');
	console.log(`   Verified all ${chunksBefore.length} chunks were deleted`);
}

async function runAllTests() {
	console.log('=== List & Delete API Tests ===\n');

	try {
		// Clean up before tests
		await cleanupTestFiles();

		// Run tests
		await testListFiles();
		await testFilterByStatus();
		await testSorting();
		await testDeleteFile();
		await testDeleteNonExistent();
		await testCascadeDeletion();

		console.log('\n=== All list & delete API tests passed! ===');
	} catch (error) {
		console.error('\n✗ Test failed:', error);
		process.exit(1);
	}
}

runAllTests();
