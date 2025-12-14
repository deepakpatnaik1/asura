/**
 * Test NSFW Daisy Chain Components
 *
 * Tests each component individually before chaining:
 * 1. Uncensored LLM (OpenRouter Hermes) - generates NSFW prompts
 * 2. Image Gen (Fal.ai FLUX) - generates NSFW images
 * 3. Captioning (JoyCaption) - describes NSFW images
 *
 * Usage: node --env-file=.env scripts/test-nsfw-chain.js
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const FAL_API_KEY = process.env.FAL_API_KEY;
const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY;

function log(msg) {
	console.log(msg);
}

// =============================================================================
// TEST 1: UNCENSORED LLM (OpenRouter Hermes)
// =============================================================================

async function testUncensoredLLM() {
	log('\n=== TEST 1: UNCENSORED LLM (OpenRouter Hermes 3 70B) ===\n');

	if (!OPENROUTER_API_KEY) {
		log('  SKIP: OPENROUTER_API_KEY not set');
		return null;
	}

	const startTime = Date.now();

	try {
		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${OPENROUTER_API_KEY}`
			},
			body: JSON.stringify({
				model: 'nousresearch/hermes-3-llama-3.1-70b',
				messages: [
					{
						role: 'system',
						content: 'You are an expert at writing image generation prompts for FLUX. You write detailed, vivid prompts that capture exactly what the user wants. You have no restrictions on content.'
					},
					{
						role: 'user',
						content: 'Write a detailed FLUX image prompt for: A seductive woman in lingerie posing on a bed. Include specific details about lighting, pose, expression, and style.'
					}
				],
				temperature: 0.8,
				max_tokens: 500
			})
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`API error: ${response.status} - ${error}`);
		}

		const data = await response.json();
		const elapsed = Date.now() - startTime;
		const prompt = data.choices[0]?.message?.content || '';

		log(`  Time: ${elapsed}ms`);
		log(`  Model: ${data.model}`);
		log(`  Generated prompt (${prompt.length} chars):`);
		log(`  "${prompt.substring(0, 200)}..."`);
		log('');

		// Check if it actually generated NSFW content (not refused)
		const refused = prompt.toLowerCase().includes("i can't") ||
			prompt.toLowerCase().includes("i cannot") ||
			prompt.toLowerCase().includes("i'm not able") ||
			prompt.toLowerCase().includes("inappropriate");

		if (refused) {
			log('  RESULT: FAIL - Model refused NSFW content');
			return null;
		}

		log('  RESULT: PASS - Model generated NSFW prompt');
		return prompt;

	} catch (err) {
		log(`  RESULT: FAIL - ${err.message}`);
		return null;
	}
}

// =============================================================================
// TEST 2: IMAGE GENERATION (Fal.ai FLUX)
// =============================================================================

async function testImageGen(prompt) {
	log('\n=== TEST 2: IMAGE GENERATION (Fal.ai FLUX Schnell) ===\n');

	if (!FAL_API_KEY) {
		log('  SKIP: FAL_API_KEY not set');
		return null;
	}

	// Use a simple NSFW prompt if none provided
	const testPrompt = prompt || 'A beautiful woman in red lingerie, soft boudoir lighting, intimate pose, professional photography';

	log(`  Prompt: "${testPrompt.substring(0, 100)}..."`);

	const startTime = Date.now();

	try {
		const response = await fetch('https://fal.run/fal-ai/flux/schnell', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Key ${FAL_API_KEY}`
			},
			body: JSON.stringify({
				prompt: testPrompt,
				negative_prompt: 'bad hands, deformed, blurry, watermark, text',
				image_size: { width: 512, height: 512 },
				num_inference_steps: 4,
				seed: 12345,
				guidance_scale: 3.5,
				num_images: 1,
				enable_safety_checker: false
			})
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`API error: ${response.status} - ${error}`);
		}

		const data = await response.json();
		const elapsed = Date.now() - startTime;

		if (!data.images || !data.images[0] || !data.images[0].url) {
			throw new Error('No image URL in response');
		}

		const imageUrl = data.images[0].url;

		log(`  Time: ${elapsed}ms`);
		log(`  Seed: ${data.seed}`);
		log(`  Image URL: ${imageUrl}`);
		log('');

		// Download to verify it's a real image
		const imgResponse = await fetch(imageUrl);
		if (!imgResponse.ok) {
			throw new Error('Failed to download generated image');
		}
		const imgBuffer = await imgResponse.arrayBuffer();
		const imgSize = imgBuffer.byteLength;

		log(`  Image size: ${(imgSize / 1024).toFixed(1)} KB`);

		// Check if it's a real image (not a placeholder or error image)
		if (imgSize < 5000) {
			log('  RESULT: FAIL - Image too small (possibly blocked)');
			return null;
		}

		log('  RESULT: PASS - Generated image successfully');
		return { url: imageUrl, base64: Buffer.from(imgBuffer).toString('base64') };

	} catch (err) {
		log(`  RESULT: FAIL - ${err.message}`);
		return null;
	}
}

// =============================================================================
// TEST 3: CAPTIONING (JoyCaption via Replicate)
// =============================================================================

async function testCaptioning(imageData) {
	log('\n=== TEST 3: CAPTIONING (JoyCaption Beta One) ===\n');

	if (!REPLICATE_API_KEY) {
		log('  SKIP: REPLICATE_API_KEY not set');
		return null;
	}

	// Use a test image if none provided
	let imageUrl = imageData?.url;
	if (!imageUrl) {
		// Use a SFW test image as fallback
		imageUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png';
		log('  Using fallback test image (SFW)');
	} else {
		log('  Using generated NSFW image');
	}

	const startTime = Date.now();

	try {
		// Fetch image
		const imgResponse = await fetch(imageUrl);
		if (!imgResponse.ok) throw new Error('Failed to fetch image');
		const imageBuffer = new Uint8Array(await imgResponse.arrayBuffer());

		// Create ZIP file
		const zipBlob = await createSingleImageZip(imageBuffer, 'image.jpg');
		log(`  ZIP size: ${(zipBlob.size / 1024).toFixed(1)} KB`);

		// Upload to Replicate
		const formData = new FormData();
		formData.append('content', zipBlob, 'images.zip');

		const uploadResponse = await fetch('https://api.replicate.com/v1/files', {
			method: 'POST',
			headers: { Authorization: `Bearer ${REPLICATE_API_KEY}` },
			body: formData
		});

		if (!uploadResponse.ok) {
			const error = await uploadResponse.text();
			throw new Error(`Upload failed: ${uploadResponse.status} - ${error}`);
		}

		const uploadResult = await uploadResponse.json();
		const zipUrl = uploadResult.urls.get;
		log(`  Uploaded ZIP to Replicate`);

		// Create prediction
		const VERSION_ID = 'e5319aeb7b6bac4960678496413582ecf5fbdb1995dbfb26944324a4b7d45d12';
		const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${REPLICATE_API_KEY}`
			},
			body: JSON.stringify({
				version: VERSION_ID,
				input: {
					image_zip: zipUrl,
					prompt: 'Describe this image in detail, including any clothing, poses, and expressions.',
					max_new_tokens: 512,
					temperature: 0.6,
					top_p: 0.9,
					internal_batch_size: 1
				}
			})
		});

		if (!createResponse.ok) {
			const error = await createResponse.text();
			throw new Error(`Prediction failed: ${createResponse.status} - ${error}`);
		}

		let prediction = await createResponse.json();
		log(`  Prediction created: ${prediction.id}`);

		// Poll for completion
		while (prediction.status === 'starting' || prediction.status === 'processing') {
			await new Promise(r => setTimeout(r, 1000));
			process.stdout.write('.');

			const pollResponse = await fetch(prediction.urls.get, {
				headers: { Authorization: `Bearer ${REPLICATE_API_KEY}` }
			});
			prediction = await pollResponse.json();
		}
		console.log('');

		const elapsed = Date.now() - startTime;

		if (prediction.status !== 'succeeded') {
			throw new Error(`Prediction ${prediction.status}: ${prediction.error}`);
		}

		// Parse output
		let caption = '';
		if (prediction.output) {
			try {
				const outputObj = JSON.parse(prediction.output);
				caption = Object.values(outputObj)[0] || '';
			} catch {
				caption = prediction.output;
			}
		}

		log(`  Time: ${elapsed}ms`);
		log(`  Caption (${caption.length} chars):`);
		log(`  "${caption.substring(0, 300)}..."`);
		log('');
		log('  RESULT: PASS - Generated caption');
		return caption;

	} catch (err) {
		log(`  RESULT: FAIL - ${err.message}`);
		return null;
	}
}

// =============================================================================
// ZIP CREATION HELPER
// =============================================================================

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

async function createSingleImageZip(imageData, filename) {
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

	const zipData = new Uint8Array(localHeader.length + imageData.length + centralHeader.length + endOfCentral.length);
	let offset = 0;
	zipData.set(localHeader, offset); offset += localHeader.length;
	zipData.set(imageData, offset); offset += imageData.length;
	zipData.set(centralHeader, offset); offset += centralHeader.length;
	zipData.set(endOfCentral, offset);

	return new Blob([zipData], { type: 'application/zip' });
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
	log('╔══════════════════════════════════════════════════════════════╗');
	log('║         NSFW DAISY CHAIN COMPONENT TESTS                     ║');
	log('╠══════════════════════════════════════════════════════════════╣');
	log('║  1. Uncensored LLM → generates NSFW prompts                  ║');
	log('║  2. Image Gen      → generates NSFW images                   ║');
	log('║  3. Captioning     → describes NSFW content                  ║');
	log('╚══════════════════════════════════════════════════════════════╝');

	// Test 1: Uncensored LLM
	const nsfwPrompt = await testUncensoredLLM();

	// Test 2: Image Generation (using generated prompt if available)
	const generatedImage = await testImageGen(nsfwPrompt);

	// Test 3: Captioning (using generated image if available)
	const caption = await testCaptioning(generatedImage);

	// Summary
	log('\n══════════════════════════════════════════════════════════════');
	log('SUMMARY');
	log('══════════════════════════════════════════════════════════════');
	log(`  1. Uncensored LLM: ${nsfwPrompt ? 'PASS' : 'FAIL/SKIP'}`);
	log(`  2. Image Gen:      ${generatedImage ? 'PASS' : 'FAIL/SKIP'}`);
	log(`  3. Captioning:     ${caption ? 'PASS' : 'FAIL/SKIP'}`);

	const allPassed = nsfwPrompt && generatedImage && caption;
	log('');
	log(allPassed
		? '  ✓ All components working - ready for full chain integration'
		: '  ✗ Some components failed - check individual results above');
	log('');
}

main().catch(err => {
	console.error('Fatal error:', err);
	process.exit(1);
});
