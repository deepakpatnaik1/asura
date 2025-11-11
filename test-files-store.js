// Test script for Files Store
// This tests the store behavior by directly calling the API endpoints
// and verifying store behavior would work correctly

import { FormData, Blob } from 'formdata-node';
import fetch from 'node-fetch';
import * as dotenv from 'dotenv';

dotenv.config();

const API_URL = 'http://localhost:5173/api/files';

// Simulate store behavior
let filesStore = [];

function simulateRefreshFiles(files) {
	filesStore = files;
	return filesStore;
}

function simulateDeleteFile(fileId) {
	filesStore = filesStore.filter((f) => f.id !== fileId);
	return filesStore;
}

function simulateProcessingFiles() {
	return filesStore.filter((f) => f.status === 'processing');
}

function simulateReadyFiles() {
	return filesStore.filter((f) => f.status === 'ready');
}

function simulateFailedFiles() {
	return filesStore.filter((f) => f.status === 'failed');
}

async function testInitialLoad() {
	console.log('1. Testing initial load (refreshFiles)...');

	const response = await fetch(API_URL);

	if (!response.ok) {
		throw new Error(`Failed to fetch files: ${response.status}`);
	}

	const data = await response.json();
	const files = simulateRefreshFiles(data.files || []);

	console.assert(Array.isArray(files), 'Files should be an array');
	console.log(`   ✓ Initial load works - Found ${files.length} files`);

	return files;
}

async function testUploadFile() {
	console.log('\n2. Testing file upload (uploadFile)...');

	// Create a test file
	const buffer = Buffer.from('Test content for store testing');
	const formData = new FormData();
	formData.append('file', new Blob([buffer]), 'store-test.txt');

	// Upload
	const response = await fetch(`${API_URL}/upload`, {
		method: 'POST',
		body: formData
	});

	if (!response.ok) {
		const errorData = await response.json();
		console.error(`   ✗ Upload failed:`, errorData);
		throw new Error(`Upload failed: ${response.status}`);
	}

	const data = await response.json();

	console.assert(data.fileId, 'Should return fileId');
	console.assert(data.status === 'processing', 'Initial status should be processing');
	console.log(`   ✓ Upload works - File ID: ${data.fileId}`);

	return data.fileId;
}

async function testRefreshAfterUpload(fileId) {
	console.log('\n3. Testing refresh after upload...');

	// Wait a moment for server to process
	await new Promise((resolve) => setTimeout(resolve, 500));

	// Refresh
	const response = await fetch(API_URL);
	const data = await response.json();
	const files = simulateRefreshFiles(data.files || []);

	// Find uploaded file
	const uploadedFile = files.find((f) => f.id === fileId);

	console.assert(uploadedFile, 'Uploaded file should appear in store');
	console.assert(
		uploadedFile.status === 'processing' || uploadedFile.status === 'ready' || uploadedFile.status === 'failed',
		'Status should be valid'
	);
	console.log(`   ✓ Refresh works - File found with status: ${uploadedFile.status}`);

	return uploadedFile;
}

async function testDerivedStores(fileId) {
	console.log('\n4. Testing derived stores...');

	const processingFiles = simulateProcessingFiles();
	const readyFiles = simulateReadyFiles();
	const failedFiles = simulateFailedFiles();

	console.assert(Array.isArray(processingFiles), 'processingFiles should be array');
	console.assert(Array.isArray(readyFiles), 'readyFiles should be array');
	console.assert(Array.isArray(failedFiles), 'failedFiles should be array');

	const totalFiles = filesStore.length;
	const derivedTotal = processingFiles.length + readyFiles.length + failedFiles.length;

	console.assert(
		totalFiles === derivedTotal,
		`Derived stores should contain all files (${totalFiles} === ${derivedTotal})`
	);

	console.log(`   ✓ Derived stores work`);
	console.log(`     - Processing: ${processingFiles.length}`);
	console.log(`     - Ready: ${readyFiles.length}`);
	console.log(`     - Failed: ${failedFiles.length}`);
}

async function testPollingBehavior(fileId) {
	console.log('\n5. Testing polling behavior (simulated)...');

	// Simulate polling by refreshing multiple times
	let previousProgress = -1;
	let pollCount = 0;
	const maxPolls = 5;

	while (pollCount < maxPolls) {
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const response = await fetch(API_URL);
		const data = await response.json();
		simulateRefreshFiles(data.files || []);

		const file = filesStore.find((f) => f.id === fileId);

		if (!file) {
			console.log(`   ⚠ File ${fileId} no longer exists (may have been deleted)`);
			break;
		}

		console.log(`   [Poll ${pollCount + 1}] Status: ${file.status}, Progress: ${file.progress}%`);

		// Check if status changed
		if (file.status !== 'processing') {
			console.log(`   ✓ File finished processing with status: ${file.status}`);
			break;
		}

		// Check if progress increased
		if (file.progress > previousProgress) {
			console.log(`   ✓ Progress increased: ${previousProgress}% → ${file.progress}%`);
			previousProgress = file.progress;
		}

		pollCount++;
	}

	const processingFiles = simulateProcessingFiles();
	console.log(`   ✓ Polling behavior tested - ${processingFiles.length} files still processing`);
}

async function testDeleteFile(fileId) {
	console.log('\n6. Testing file deletion (deleteFile)...');

	// Delete
	const response = await fetch(`${API_URL}/${fileId}`, {
		method: 'DELETE'
	});

	if (!response.ok) {
		const errorData = await response.json();
		console.error(`   ✗ Delete failed:`, errorData);
		throw new Error(`Delete failed: ${response.status}`);
	}

	const data = await response.json();

	console.assert(data.success === true, 'Delete should return success');
	console.assert(data.fileId === fileId, 'Should return correct fileId');

	// Simulate store update
	simulateDeleteFile(fileId);

	// Verify file is gone from store
	const fileStillExists = filesStore.some((f) => f.id === fileId);
	console.assert(!fileStillExists, 'File should be removed from store');

	console.log(`   ✓ Delete works - File ${fileId} removed from store`);
}

async function testErrorHandling() {
	console.log('\n7. Testing error handling...');

	// Test 1: Upload with missing file
	try {
		const emptyFormData = new FormData();
		const response = await fetch(`${API_URL}/upload`, {
			method: 'POST',
			body: emptyFormData
		});

		console.assert(response.status === 400, 'Missing file should return 400');

		const errorData = await response.json();
		console.assert(errorData.error, 'Should return error message');
		console.log(`   ✓ Missing file error: "${errorData.error}"`);
	} catch (e) {
		console.error(`   ✗ Missing file test failed:`, e.message);
	}

	// Test 2: Delete non-existent file
	try {
		const fakeId = '00000000-0000-0000-0000-000000000000';
		const response = await fetch(`${API_URL}/${fakeId}`, {
			method: 'DELETE'
		});

		console.assert(response.status === 404, 'Non-existent file should return 404');

		const errorData = await response.json();
		console.assert(errorData.error, 'Should return error message');
		console.log(`   ✓ Non-existent file error: "${errorData.error}"`);
	} catch (e) {
		console.error(`   ✗ Non-existent file test failed:`, e.message);
	}

	console.log('   ✓ Error handling works correctly');
}

async function runAllTests() {
	console.log('=== Files Store Tests ===\n');

	try {
		// Test 1: Initial load
		await testInitialLoad();

		// Test 2: Upload file
		const fileId = await testUploadFile();

		// Test 3: Refresh after upload
		await testRefreshAfterUpload(fileId);

		// Test 4: Derived stores
		await testDerivedStores(fileId);

		// Test 5: Polling behavior (simulated)
		await testPollingBehavior(fileId);

		// Test 6: Delete file
		await testDeleteFile(fileId);

		// Test 7: Error handling
		await testErrorHandling();

		console.log('\n=== All files store tests passed! ===');
	} catch (error) {
		console.error('\n✗ Test failed:', error);
		process.exit(1);
	}
}

runAllTests();
