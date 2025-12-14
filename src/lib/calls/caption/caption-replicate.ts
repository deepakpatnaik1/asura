/**
 * Replicate Captioning
 *
 * Handles image captioning via Replicate models (JoyCaption).
 * JoyCaption Beta One requires a ZIP file input - we create one on the fly.
 */

import { REPLICATE_API_KEY } from '$env/static/private';
import type { CaptionParams, CaptionResult } from './index';

/** Replicate prediction response */
interface ReplicatePrediction {
	id: string;
	status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
	output?: string;
	error?: string;
	urls?: {
		get: string;
		cancel: string;
	};
	metrics?: {
		predict_time?: number;
	};
}

/**
 * Create a ZIP file containing a single image.
 * Uses JSZip-compatible format via manual construction.
 */
async function createSingleImageZip(imageData: Uint8Array, filename: string): Promise<Blob> {
	// We'll use the built-in CompressionStream if available, otherwise store uncompressed
	// For simplicity, we'll create an uncompressed ZIP (STORE method)

	const encoder = new TextEncoder();
	const filenameBytes = encoder.encode(filename);

	// Current date/time for ZIP header
	const now = new Date();
	const dosTime = ((now.getSeconds() >> 1) | (now.getMinutes() << 5) | (now.getHours() << 11)) & 0xFFFF;
	const dosDate = (now.getDate() | ((now.getMonth() + 1) << 5) | ((now.getFullYear() - 1980) << 9)) & 0xFFFF;

	// Calculate CRC32
	const crc = crc32(imageData);

	// Local file header
	const localHeader = new Uint8Array(30 + filenameBytes.length);
	const localView = new DataView(localHeader.buffer);
	localView.setUint32(0, 0x04034b50, true); // Local file header signature
	localView.setUint16(4, 20, true); // Version needed to extract
	localView.setUint16(6, 0, true); // General purpose bit flag
	localView.setUint16(8, 0, true); // Compression method (0 = store)
	localView.setUint16(10, dosTime, true); // Last mod file time
	localView.setUint16(12, dosDate, true); // Last mod file date
	localView.setUint32(14, crc, true); // CRC-32
	localView.setUint32(18, imageData.length, true); // Compressed size
	localView.setUint32(22, imageData.length, true); // Uncompressed size
	localView.setUint16(26, filenameBytes.length, true); // File name length
	localView.setUint16(28, 0, true); // Extra field length
	localHeader.set(filenameBytes, 30);

	// Central directory header
	const centralHeader = new Uint8Array(46 + filenameBytes.length);
	const centralView = new DataView(centralHeader.buffer);
	centralView.setUint32(0, 0x02014b50, true); // Central file header signature
	centralView.setUint16(4, 20, true); // Version made by
	centralView.setUint16(6, 20, true); // Version needed to extract
	centralView.setUint16(8, 0, true); // General purpose bit flag
	centralView.setUint16(10, 0, true); // Compression method
	centralView.setUint16(12, dosTime, true); // Last mod file time
	centralView.setUint16(14, dosDate, true); // Last mod file date
	centralView.setUint32(16, crc, true); // CRC-32
	centralView.setUint32(20, imageData.length, true); // Compressed size
	centralView.setUint32(24, imageData.length, true); // Uncompressed size
	centralView.setUint16(28, filenameBytes.length, true); // File name length
	centralView.setUint16(30, 0, true); // Extra field length
	centralView.setUint16(32, 0, true); // File comment length
	centralView.setUint16(34, 0, true); // Disk number start
	centralView.setUint16(36, 0, true); // Internal file attributes
	centralView.setUint32(38, 0, true); // External file attributes
	centralView.setUint32(42, 0, true); // Relative offset of local header
	centralHeader.set(filenameBytes, 46);

	// End of central directory
	const centralDirOffset = localHeader.length + imageData.length;
	const endOfCentral = new Uint8Array(22);
	const endView = new DataView(endOfCentral.buffer);
	endView.setUint32(0, 0x06054b50, true); // End of central dir signature
	endView.setUint16(4, 0, true); // Number of this disk
	endView.setUint16(6, 0, true); // Disk where central directory starts
	endView.setUint16(8, 1, true); // Number of central directory records on this disk
	endView.setUint16(10, 1, true); // Total number of central directory records
	endView.setUint32(12, centralHeader.length, true); // Size of central directory
	endView.setUint32(16, centralDirOffset, true); // Offset of start of central directory
	endView.setUint16(20, 0, true); // Comment length

	// Combine all parts
	const zipData = new Uint8Array(localHeader.length + imageData.length + centralHeader.length + endOfCentral.length);
	let offset = 0;
	zipData.set(localHeader, offset); offset += localHeader.length;
	zipData.set(imageData, offset); offset += imageData.length;
	zipData.set(centralHeader, offset); offset += centralHeader.length;
	zipData.set(endOfCentral, offset);

	return new Blob([zipData], { type: 'application/zip' });
}

/**
 * CRC32 calculation for ZIP file
 */
function crc32(data: Uint8Array): number {
	let crc = 0xFFFFFFFF;
	const table = getCrc32Table();

	for (let i = 0; i < data.length; i++) {
		crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
	}

	return (crc ^ 0xFFFFFFFF) >>> 0;
}

let crc32Table: Uint32Array | null = null;
function getCrc32Table(): Uint32Array {
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
 * Upload a blob to Replicate's file upload endpoint using multipart/form-data
 */
async function uploadToReplicate(blob: Blob, filename: string): Promise<string> {
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

	const result = await response.json() as { urls: { get: string } };
	return result.urls.get;
}

/**
 * Caption an image using Replicate (JoyCaption).
 *
 * @param params - Caption parameters
 * @returns Caption result with description text
 */
export async function captionReplicate(params: CaptionParams): Promise<CaptionResult> {
	const {
		imageUrl,
		imageBase64,
		prompt = 'Write a long descriptive caption for this image in a formal tone.',
		model,
		maxTokens = 512,
		temperature = 0.6
	} = params;

	// Get image data
	let imageData: Uint8Array;
	let imageFilename = 'image.jpg';

	if (imageBase64) {
		// Decode base64
		const binaryString = atob(imageBase64);
		imageData = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			imageData[i] = binaryString.charCodeAt(i);
		}
	} else if (imageUrl) {
		// Fetch image from URL
		const response = await fetch(imageUrl);
		if (!response.ok) {
			throw new Error(`Failed to fetch image: ${response.status}`);
		}
		imageData = new Uint8Array(await response.arrayBuffer());

		// Try to get filename from URL
		const urlParts = imageUrl.split('/');
		const lastPart = urlParts[urlParts.length - 1].split('?')[0];
		if (lastPart && /\.(jpg|jpeg|png|webp|gif)$/i.test(lastPart)) {
			imageFilename = lastPart;
		}
	} else {
		throw new Error('Either imageUrl or imageBase64 must be provided');
	}

	// Create ZIP with single image
	const zipBlob = await createSingleImageZip(imageData, imageFilename);

	// Upload ZIP to Replicate
	const zipUrl = await uploadToReplicate(zipBlob, 'images.zip');

	// Model identifier to version mapping
	// JoyCaption Beta One version ID
	const MODEL_VERSIONS: Record<string, string> = {
		'nsfw-api/joycaption-beta-one': 'e5319aeb7b6bac4960678496413582ecf5fbdb1995dbfb26944324a4b7d45d12'
	};

	const version = MODEL_VERSIONS[model];
	if (!version) {
		throw new Error(`Unknown captioning model: ${model}`);
	}

	// Create prediction using version ID
	const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${REPLICATE_API_KEY}`
		},
		body: JSON.stringify({
			version,
			input: {
				image_zip: zipUrl,
				prompt,
				max_new_tokens: maxTokens,
				temperature,
				top_p: 0.9,
				internal_batch_size: 1
			}
		})
	});

	if (!createResponse.ok) {
		const error = await createResponse.text();
		throw new Error(`Replicate API error: ${createResponse.status} - ${error}`);
	}

	let prediction: ReplicatePrediction = await createResponse.json();

	// Poll for completion
	while (prediction.status === 'starting' || prediction.status === 'processing') {
		await new Promise(resolve => setTimeout(resolve, 500));

		const pollResponse = await fetch(prediction.urls!.get, {
			headers: {
				'Authorization': `Bearer ${REPLICATE_API_KEY}`
			}
		});

		if (!pollResponse.ok) {
			throw new Error(`Failed to poll prediction: ${pollResponse.status}`);
		}

		prediction = await pollResponse.json();
	}

	if (prediction.status === 'failed') {
		throw new Error(`Captioning failed: ${prediction.error}`);
	}

	if (prediction.status === 'canceled') {
		throw new Error('Captioning was canceled');
	}

	// Parse output - JoyCaption returns JSON with filename keys: { "image.jpg": "caption..." }
	let caption = '';
	if (prediction.output) {
		try {
			const outputObj = JSON.parse(prediction.output);
			// Get the first (and typically only) caption
			const captions = Object.values(outputObj) as string[];
			caption = captions[0] || '';
		} catch {
			// If not JSON, use as-is
			caption = prediction.output;
		}
	}

	return {
		caption,
		model,
		latencyMs: prediction.metrics?.predict_time ? prediction.metrics.predict_time * 1000 : undefined
	};
}
