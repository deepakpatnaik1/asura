/**
 * Test Eva's "Eyes" Workflow
 *
 * Simulates the conversational loop:
 * 1. Generate image
 * 2. Caption it (Eva's "eyes")
 * 3. User says "change clothes to white"
 * 4. Generate new image with modification
 * 5. Caption again to verify
 *
 * Usage: node --env-file=.env scripts/test-eva-eyes.js
 */

const FAL_API_KEY = process.env.FAL_API_KEY;
const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY;

function log(msg) {
	console.log(msg);
}

// =============================================================================
// IMAGE GENERATION (Fal.ai FLUX)
// =============================================================================

async function generateImage(prompt) {
	log(`\n  Generating: "${prompt.substring(0, 80)}..."`);

	const response = await fetch('https://fal.run/fal-ai/flux/schnell', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Key ${FAL_API_KEY}`
		},
		body: JSON.stringify({
			prompt,
			negative_prompt: 'bad hands, deformed, blurry, watermark, text',
			image_size: { width: 512, height: 512 },
			num_inference_steps: 4,
			seed: Math.floor(Math.random() * 2147483647),
			guidance_scale: 3.5,
			num_images: 1,
			enable_safety_checker: false
		})
	});

	if (!response.ok) {
		throw new Error(`Fal.ai error: ${response.status}`);
	}

	const data = await response.json();
	return data.images[0].url;
}

// =============================================================================
// CAPTIONING (JoyCaption via Replicate)
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

async function createZip(imageData, filename) {
	const encoder = new TextEncoder();
	const filenameBytes = encoder.encode(filename);
	const now = new Date();
	const dosTime = ((now.getSeconds() >> 1) | (now.getMinutes() << 5) | (now.getHours() << 11)) & 0xFFFF;
	const dosDate = (now.getDate() | ((now.getMonth() + 1) << 5) | ((now.getFullYear() - 1980) << 9)) & 0xFFFF;
	const crc = crc32(imageData);

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

async function captionImage(imageUrl) {
	log(`  Captioning image...`);

	// Fetch image
	const imgResponse = await fetch(imageUrl);
	const imageBuffer = new Uint8Array(await imgResponse.arrayBuffer());

	// Create ZIP
	const zipBlob = await createZip(imageBuffer, 'image.jpg');

	// Upload to Replicate
	const formData = new FormData();
	formData.append('content', zipBlob, 'images.zip');

	const uploadResponse = await fetch('https://api.replicate.com/v1/files', {
		method: 'POST',
		headers: { Authorization: `Bearer ${REPLICATE_API_KEY}` },
		body: formData
	});

	const uploadResult = await uploadResponse.json();
	const zipUrl = uploadResult.urls.get;

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
				prompt: 'Describe this image in detail. Focus on: the subject (appearance, features), clothing (color, style, material), pose and expression, lighting and mood.',
				max_new_tokens: 300,
				temperature: 0.6
			}
		})
	});

	let prediction = await createResponse.json();

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

	if (prediction.status !== 'succeeded') {
		throw new Error(`Captioning failed: ${prediction.error}`);
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

	return caption;
}

// =============================================================================
// MAIN WORKFLOW
// =============================================================================

async function main() {
	log('╔══════════════════════════════════════════════════════════════╗');
	log('║              EVA\'S EYES WORKFLOW TEST                        ║');
	log('╠══════════════════════════════════════════════════════════════╣');
	log('║  1. Generate image (woman in red lingerie)                   ║');
	log('║  2. Caption it (Eva sees what was created)                   ║');
	log('║  3. User: "change her clothes to white"                      ║');
	log('║  4. Generate new image with white clothes                    ║');
	log('║  5. Caption again (verify the change worked)                 ║');
	log('╚══════════════════════════════════════════════════════════════╝');

	if (!FAL_API_KEY || !REPLICATE_API_KEY) {
		log('\n❌ Missing API keys. Set FAL_API_KEY and REPLICATE_API_KEY.');
		process.exit(1);
	}

	// STEP 1: Generate initial image
	log('\n═══ STEP 1: GENERATE INITIAL IMAGE ═══');
	const prompt1 = 'A beautiful woman in red lingerie, soft boudoir lighting, elegant pose, intimate setting, professional photography, high quality portrait';
	const imageUrl1 = await generateImage(prompt1);
	log(`  ✓ Generated: ${imageUrl1}`);

	// STEP 2: Caption it (Eva's eyes)
	log('\n═══ STEP 2: EVA SEES THE IMAGE ═══');
	const caption1 = await captionImage(imageUrl1);
	log(`  Eva sees:\n  "${caption1}"`);

	// STEP 3: User feedback
	log('\n═══ STEP 3: USER FEEDBACK ═══');
	log('  User: "Change her clothes to white"');

	// Extract clothing details from caption for the new prompt
	// In real workflow, Eva would do this reasoning
	log('  Eva thinks: "I saw red lingerie. User wants white instead."');

	// STEP 4: Generate with modification
	log('\n═══ STEP 4: GENERATE WITH WHITE CLOTHES ═══');
	const prompt2 = 'A beautiful woman in white lingerie, soft boudoir lighting, elegant pose, intimate setting, professional photography, high quality portrait';
	const imageUrl2 = await generateImage(prompt2);
	log(`  ✓ Generated: ${imageUrl2}`);

	// STEP 5: Caption again to verify
	log('\n═══ STEP 5: EVA VERIFIES THE CHANGE ═══');
	const caption2 = await captionImage(imageUrl2);
	log(`  Eva sees:\n  "${caption2}"`);

	// Summary
	log('\n══════════════════════════════════════════════════════════════');
	log('SUMMARY');
	log('══════════════════════════════════════════════════════════════');

	const hadRed = caption1.toLowerCase().includes('red');
	const hasWhite = caption2.toLowerCase().includes('white');

	log(`  Image 1 caption mentions "red": ${hadRed ? '✓ YES' : '✗ NO'}`);
	log(`  Image 2 caption mentions "white": ${hasWhite ? '✓ YES' : '✗ NO'}`);
	log('');

	if (hasWhite) {
		log('  ✓ SUCCESS - Eva\'s eyes detected the clothing change!');
		log('  The workflow works: Generate → Caption → Feedback → Generate → Verify');
	} else {
		log('  ⚠ PARTIAL - Caption didn\'t explicitly mention white.');
		log('  Check the captions above for clothing descriptions.');
	}

	log('\n  Image URLs:');
	log(`  1. ${imageUrl1}`);
	log(`  2. ${imageUrl2}`);
	log('');
}

main().catch(err => {
	console.error('Fatal error:', err);
	process.exit(1);
});
