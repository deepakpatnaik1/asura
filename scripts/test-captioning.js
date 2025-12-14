/**
 * Test script for captioning module
 *
 * Tests JoyCaption via Replicate API
 *
 * Usage: node --env-file=.env scripts/test-captioning.js
 */

const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY;

if (!REPLICATE_API_KEY) {
	console.error('REPLICATE_API_KEY not found in environment');
	process.exit(1);
}

// Test image - a public domain image
const TEST_IMAGE_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png';

/**
 * CRC32 calculation for ZIP file
 */
function crc32(data) {
	let crc = 0xFFFFFFFF;
	const table = getCrc32Table();

	for (let i = 0; i < data.length; i++) {
		crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
	}

	return (crc ^ 0xFFFFFFFF) >>> 0;
}

let crc32Table = null;
function getCrc32Table() {
	if (crc32Table) return crc32Table;

	crc32Table = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let j = 0; j < 8; j++) {
			c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
		}
		crc32Table[i] = c;
	}
	return crc32Table;
}

/**
 * Create a ZIP file containing a single image
 */
function createSingleImageZip(imageData, filename) {
	const encoder = new TextEncoder();
	const filenameBytes = encoder.encode(filename);

	const now = new Date();
	const dosTime = ((now.getSeconds() >> 1) | (now.getMinutes() << 5) | (now.getHours() << 11)) & 0xFFFF;
	const dosDate = (now.getDate() | ((now.getMonth() + 1) << 5) | ((now.getFullYear() - 1980) << 9)) & 0xFFFF;

	const crc = crc32(imageData);

	// Local file header
	const localHeader = new Uint8Array(30 + filenameBytes.length);
	const localView = new DataView(localHeader.buffer);
	localView.setUint32(0, 0x04034b50, true);
	localView.setUint16(4, 20, true);
	localView.setUint16(6, 0, true);
	localView.setUint16(8, 0, true);
	localView.setUint16(10, dosTime, true);
	localView.setUint16(12, dosDate, true);
	localView.setUint32(14, crc, true);
	localView.setUint32(18, imageData.length, true);
	localView.setUint32(22, imageData.length, true);
	localView.setUint16(26, filenameBytes.length, true);
	localView.setUint16(28, 0, true);
	localHeader.set(filenameBytes, 30);

	// Central directory header
	const centralHeader = new Uint8Array(46 + filenameBytes.length);
	const centralView = new DataView(centralHeader.buffer);
	centralView.setUint32(0, 0x02014b50, true);
	centralView.setUint16(4, 20, true);
	centralView.setUint16(6, 20, true);
	centralView.setUint16(8, 0, true);
	centralView.setUint16(10, 0, true);
	centralView.setUint16(12, dosTime, true);
	centralView.setUint16(14, dosDate, true);
	centralView.setUint32(16, crc, true);
	centralView.setUint32(20, imageData.length, true);
	centralView.setUint32(24, imageData.length, true);
	centralView.setUint16(28, filenameBytes.length, true);
	centralView.setUint16(30, 0, true);
	centralView.setUint16(32, 0, true);
	centralView.setUint16(34, 0, true);
	centralView.setUint16(36, 0, true);
	centralView.setUint32(38, 0, true);
	centralView.setUint32(42, 0, true);
	centralHeader.set(filenameBytes, 46);

	// End of central directory
	const centralDirOffset = localHeader.length + imageData.length;
	const endOfCentral = new Uint8Array(22);
	const endView = new DataView(endOfCentral.buffer);
	endView.setUint32(0, 0x06054b50, true);
	endView.setUint16(4, 0, true);
	endView.setUint16(6, 0, true);
	endView.setUint16(8, 1, true);
	endView.setUint16(10, 1, true);
	endView.setUint32(12, centralHeader.length, true);
	endView.setUint32(16, centralDirOffset, true);
	endView.setUint16(20, 0, true);

	// Combine all parts
	const zipData = new Uint8Array(localHeader.length + imageData.length + centralHeader.length + endOfCentral.length);
	let offset = 0;
	zipData.set(localHeader, offset); offset += localHeader.length;
	zipData.set(imageData, offset); offset += imageData.length;
	zipData.set(centralHeader, offset); offset += centralHeader.length;
	zipData.set(endOfCentral, offset);

	return zipData;
}

/**
 * Upload file to Replicate using multipart/form-data
 */
async function uploadToReplicate(data, filename, contentType) {
	console.log(`Uploading ${filename} (${data.length} bytes)...`);

	// Create a Blob from the data
	const blob = new Blob([data], { type: contentType });

	// Create FormData with the file
	const formData = new FormData();
	formData.append('content', blob, filename);

	const response = await fetch('https://api.replicate.com/v1/files', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${REPLICATE_API_KEY}`
			// Don't set Content-Type - let fetch set it with boundary
		},
		body: formData
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to upload file: ${response.status} - ${error}`);
	}

	const result = await response.json();
	console.log(`Uploaded, file ID: ${result.id}`);
	console.log(`URL: ${result.urls.get}`);
	return result.urls.get;
}

async function testCaptioning() {
	console.log('=== JoyCaption Test ===\n');

	// 1. Fetch test image
	console.log(`Fetching test image: ${TEST_IMAGE_URL}`);
	const imageResponse = await fetch(TEST_IMAGE_URL);
	if (!imageResponse.ok) {
		throw new Error(`Failed to fetch image: ${imageResponse.status}`);
	}
	const imageData = new Uint8Array(await imageResponse.arrayBuffer());
	console.log(`Image size: ${imageData.length} bytes\n`);

	// 2. Create ZIP
	console.log('Creating ZIP file...');
	const zipData = createSingleImageZip(imageData, 'test.png');
	console.log(`ZIP size: ${zipData.length} bytes\n`);

	// 3. Upload ZIP to Replicate
	const zipUrl = await uploadToReplicate(zipData, 'images.zip', 'application/zip');
	console.log('');

	// 4. Create prediction
	console.log('Creating prediction...');
	const startTime = Date.now();

	// Use version ID for the prediction
	const VERSION_ID = 'e5319aeb7b6bac4960678496413582ecf5fbdb1995dbfb26944324a4b7d45d12';
	const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${REPLICATE_API_KEY}`
		},
		body: JSON.stringify({
			version: VERSION_ID,
			input: {
				image_zip: zipUrl,
				prompt: 'Write a long descriptive caption for this image in a formal tone.',
				max_new_tokens: 512,
				temperature: 0.6,
				top_p: 0.9,
				internal_batch_size: 1
			}
		})
	});

	if (!createResponse.ok) {
		const error = await createResponse.text();
		throw new Error(`Replicate API error: ${createResponse.status} - ${error}`);
	}

	let prediction = await createResponse.json();
	console.log(`Prediction created: ${prediction.id}`);
	console.log(`Status: ${prediction.status}\n`);

	// 5. Poll for completion
	while (prediction.status === 'starting' || prediction.status === 'processing') {
		await new Promise(resolve => setTimeout(resolve, 500));
		process.stdout.write('.');

		const pollResponse = await fetch(prediction.urls.get, {
			headers: {
				'Authorization': `Bearer ${REPLICATE_API_KEY}`
			}
		});

		if (!pollResponse.ok) {
			throw new Error(`Failed to poll prediction: ${pollResponse.status}`);
		}

		prediction = await pollResponse.json();
	}

	const endTime = Date.now();
	console.log(`\n\nStatus: ${prediction.status}`);
	console.log(`Time: ${endTime - startTime}ms`);

	if (prediction.status === 'succeeded') {
		console.log('\n=== CAPTION ===');
		console.log(prediction.output);
		console.log('===============\n');
	} else if (prediction.status === 'failed') {
		console.error('Prediction failed:', prediction.error);
	}
}

testCaptioning().catch(err => {
	console.error('Test failed:', err);
	process.exit(1);
});
