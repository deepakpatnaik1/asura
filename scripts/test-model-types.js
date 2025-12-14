/**
 * Test script for all model type modules
 *
 * Tests: Captioning, Audio Transcription, Audio Generation (TTS)
 *
 * Usage: node --env-file=.env scripts/test-model-types.js [module]
 *
 * Modules:
 *   caption     - JoyCaption (Replicate)
 *   transcribe  - Whisper (OpenAI, Groq), Parakeet (Replicate)
 *   tts         - TTS-1 (OpenAI)
 *   all         - Run all tests (default)
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY;

// Test assets - public domain
const TEST_IMAGE_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png';
// We'll generate test audio from TTS instead of downloading
const TEST_AUDIO_URL = null;

const results = [];

function log(msg) {
	console.log(msg);
}

function logResult(test, status, details = '') {
	const emoji = status === 'PASS' ? '✓' : status === 'SKIP' ? '○' : '✗';
	results.push({ test, status, details });
	console.log(`  ${emoji} ${test}${details ? `: ${details}` : ''}`);
}

// =============================================================================
// CRC32 + ZIP helpers for captioning
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

function createSingleImageZip(imageData, filename) {
	const encoder = new TextEncoder();
	const filenameBytes = encoder.encode(filename);
	const now = new Date();
	const dosTime = ((now.getSeconds() >> 1) | (now.getMinutes() << 5) | (now.getHours() << 11)) & 0xFFFF;
	const dosDate = (now.getDate() | ((now.getMonth() + 1) << 5) | ((now.getFullYear() - 1980) << 9)) & 0xFFFF;
	const crcVal = crc32(imageData);

	const localHeader = new Uint8Array(30 + filenameBytes.length);
	const localView = new DataView(localHeader.buffer);
	localView.setUint32(0, 0x04034b50, true);
	localView.setUint16(4, 20, true);
	localView.setUint16(6, 0, true);
	localView.setUint16(8, 0, true);
	localView.setUint16(10, dosTime, true);
	localView.setUint16(12, dosDate, true);
	localView.setUint32(14, crcVal, true);
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
	centralView.setUint32(16, crcVal, true);
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

	return zipData;
}

// =============================================================================
// CAPTIONING TESTS
// =============================================================================

async function testCaptioning() {
	log('\n=== CAPTIONING ===\n');

	if (!REPLICATE_API_KEY) {
		logResult('JoyCaption (Replicate)', 'SKIP', 'REPLICATE_API_KEY not set');
		return;
	}

	try {
		// Fetch test image
		const imageResponse = await fetch(TEST_IMAGE_URL);
		const imageData = new Uint8Array(await imageResponse.arrayBuffer());

		// Create ZIP
		const zipData = createSingleImageZip(imageData, 'test.png');

		// Upload to Replicate
		const blob = new Blob([zipData], { type: 'application/zip' });
		const formData = new FormData();
		formData.append('content', blob, 'images.zip');

		const uploadResponse = await fetch('https://api.replicate.com/v1/files', {
			method: 'POST',
			headers: { Authorization: `Bearer ${REPLICATE_API_KEY}` },
			body: formData
		});

		if (!uploadResponse.ok) throw new Error(`Upload failed: ${uploadResponse.status}`);
		const uploadResult = await uploadResponse.json();
		const zipUrl = uploadResult.urls.get;

		// Create prediction
		const VERSION_ID = 'e5319aeb7b6bac4960678496413582ecf5fbdb1995dbfb26944324a4b7d45d12';
		const startTime = Date.now();
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
					prompt: 'Write a descriptive caption for this image.',
					max_new_tokens: 256,
					temperature: 0.6
				}
			})
		});

		if (!createResponse.ok) throw new Error(`Prediction failed: ${createResponse.status}`);
		let prediction = await createResponse.json();

		// Poll for completion
		while (prediction.status === 'starting' || prediction.status === 'processing') {
			await new Promise(r => setTimeout(r, 500));
			const pollResponse = await fetch(prediction.urls.get, {
				headers: { Authorization: `Bearer ${REPLICATE_API_KEY}` }
			});
			prediction = await pollResponse.json();
		}

		const elapsed = Date.now() - startTime;
		if (prediction.status === 'succeeded' && prediction.output) {
			logResult('JoyCaption (Replicate)', 'PASS', `${elapsed}ms - "${prediction.output.substring(0, 50)}..."`);
		} else {
			logResult('JoyCaption (Replicate)', 'FAIL', prediction.error || 'No output');
		}
	} catch (err) {
		logResult('JoyCaption (Replicate)', 'FAIL', err.message);
	}
}

// =============================================================================
// AUDIO TRANSCRIPTION TESTS
// =============================================================================

async function testTranscription() {
	log('\n=== AUDIO TRANSCRIPTION ===\n');

	// Generate test audio using TTS (requires OpenAI key)
	let audioData;
	if (!OPENAI_API_KEY) {
		log('  Skipping transcription tests - need OPENAI_API_KEY to generate test audio\n');
		logResult('Whisper (OpenAI)', 'SKIP', 'No test audio');
		logResult('Whisper Large V3 (Groq)', 'SKIP', 'No test audio');
		logResult('Parakeet RNNT 1.1B (Replicate)', 'SKIP', 'No test audio');
		return;
	}

	try {
		log('  Generating test audio via TTS...');
		const ttsResponse = await fetch('https://api.openai.com/v1/audio/speech', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${OPENAI_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: 'tts-1',
				input: 'The quick brown fox jumps over the lazy dog. This is a test of the audio transcription system.',
				voice: 'alloy',
				response_format: 'mp3'
			})
		});

		if (!ttsResponse.ok) throw new Error(`TTS failed: ${ttsResponse.status}`);
		audioData = new Uint8Array(await ttsResponse.arrayBuffer());
		log(`  Test audio: ${audioData.length} bytes\n`);
	} catch (err) {
		log(`  Failed to generate test audio: ${err.message}\n`);
		return;
	}

	// OpenAI Whisper
	if (!OPENAI_API_KEY) {
		logResult('Whisper (OpenAI)', 'SKIP', 'OPENAI_API_KEY not set');
	} else {
		try {
			const startTime = Date.now();
			const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
			const formData = new FormData();
			formData.append('file', audioBlob, 'audio.mp3');
			formData.append('model', 'whisper-1');
			formData.append('response_format', 'json');

			const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
				method: 'POST',
				headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
				body: formData
			});

			if (!response.ok) throw new Error(`API error: ${response.status}`);
			const data = await response.json();
			const elapsed = Date.now() - startTime;
			logResult('Whisper (OpenAI)', 'PASS', `${elapsed}ms - "${data.text.substring(0, 40)}..."`);
		} catch (err) {
			logResult('Whisper (OpenAI)', 'FAIL', err.message);
		}
	}

	// Groq Whisper
	if (!GROQ_API_KEY) {
		logResult('Whisper Large V3 (Groq)', 'SKIP', 'GROQ_API_KEY not set');
	} else {
		try {
			const startTime = Date.now();
			const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
			const formData = new FormData();
			formData.append('file', audioBlob, 'audio.mp3');
			formData.append('model', 'whisper-large-v3');
			formData.append('response_format', 'json');

			const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
				method: 'POST',
				headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
				body: formData
			});

			if (!response.ok) throw new Error(`API error: ${response.status}`);
			const data = await response.json();
			const elapsed = Date.now() - startTime;
			logResult('Whisper Large V3 (Groq)', 'PASS', `${elapsed}ms - "${data.text.substring(0, 40)}..."`);
		} catch (err) {
			logResult('Whisper Large V3 (Groq)', 'FAIL', err.message);
		}
	}

	// Replicate Parakeet
	if (!REPLICATE_API_KEY) {
		logResult('Parakeet RNNT 1.1B (Replicate)', 'SKIP', 'REPLICATE_API_KEY not set');
	} else {
		try {
			const startTime = Date.now();

			// Upload audio to Replicate
			const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
			const formData = new FormData();
			formData.append('content', audioBlob, 'audio.mp3');

			const uploadResponse = await fetch('https://api.replicate.com/v1/files', {
				method: 'POST',
				headers: { Authorization: `Bearer ${REPLICATE_API_KEY}` },
				body: formData
			});

			if (!uploadResponse.ok) throw new Error(`Upload failed: ${uploadResponse.status}`);
			const uploadResult = await uploadResponse.json();
			const audioUrl = uploadResult.urls.get;

			// Create prediction using version ID
			const VERSION_ID = '73ddbebaef172a47c8dfdd79381f110bfdc7691bcc7a4edde82f0a39e380ce50';
			const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${REPLICATE_API_KEY}`
				},
				body: JSON.stringify({
					version: VERSION_ID,
					input: { audio_file: audioUrl }  // Note: 'audio_file' not 'audio'
				})
			});

			if (!createResponse.ok) {
				const errorText = await createResponse.text();
				throw new Error(`Prediction failed: ${createResponse.status} - ${errorText}`);
			}
			let prediction = await createResponse.json();

			// Poll for completion
			while (prediction.status === 'starting' || prediction.status === 'processing') {
				await new Promise(r => setTimeout(r, 500));
				const pollResponse = await fetch(prediction.urls.get, {
					headers: { Authorization: `Bearer ${REPLICATE_API_KEY}` }
				});
				prediction = await pollResponse.json();
			}

			const elapsed = Date.now() - startTime;
			// Output is a string, not an object
			if (prediction.status === 'succeeded' && prediction.output) {
				const text = typeof prediction.output === 'string' ? prediction.output : prediction.output.text || '';
				logResult('Parakeet RNNT 1.1B (Replicate)', 'PASS', `${elapsed}ms - "${text.substring(0, 40)}..."`);
			} else {
				logResult('Parakeet RNNT 1.1B (Replicate)', 'FAIL', prediction.error || 'No output');
			}
		} catch (err) {
			logResult('Parakeet RNNT 1.1B (Replicate)', 'FAIL', err.message);
		}
	}
}

// =============================================================================
// AUDIO GENERATION (TTS) TESTS
// =============================================================================

async function testTTS() {
	log('\n=== AUDIO GENERATION (TTS) ===\n');

	if (!OPENAI_API_KEY) {
		logResult('TTS-1 (OpenAI)', 'SKIP', 'OPENAI_API_KEY not set');
		logResult('TTS-1 HD (OpenAI)', 'SKIP', 'OPENAI_API_KEY not set');
		return;
	}

	const testText = 'Hello, this is a test of the text to speech system.';

	// TTS-1
	try {
		const startTime = Date.now();
		const response = await fetch('https://api.openai.com/v1/audio/speech', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${OPENAI_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: 'tts-1',
				input: testText,
				voice: 'alloy',
				response_format: 'mp3'
			})
		});

		if (!response.ok) throw new Error(`API error: ${response.status}`);
		const audioBuffer = await response.arrayBuffer();
		const elapsed = Date.now() - startTime;
		logResult('TTS-1 (OpenAI)', 'PASS', `${elapsed}ms - ${audioBuffer.byteLength} bytes`);
	} catch (err) {
		logResult('TTS-1 (OpenAI)', 'FAIL', err.message);
	}

	// TTS-1 HD
	try {
		const startTime = Date.now();
		const response = await fetch('https://api.openai.com/v1/audio/speech', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${OPENAI_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: 'tts-1-hd',
				input: testText,
				voice: 'nova',
				response_format: 'mp3'
			})
		});

		if (!response.ok) throw new Error(`API error: ${response.status}`);
		const audioBuffer = await response.arrayBuffer();
		const elapsed = Date.now() - startTime;
		logResult('TTS-1 HD (OpenAI)', 'PASS', `${elapsed}ms - ${audioBuffer.byteLength} bytes`);
	} catch (err) {
		logResult('TTS-1 HD (OpenAI)', 'FAIL', err.message);
	}
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
	const module = process.argv[2] || 'all';

	log('╔════════════════════════════════════════╗');
	log('║     MODEL TYPES INFRASTRUCTURE TEST    ║');
	log('╚════════════════════════════════════════╝');

	log('\nAPI Keys:');
	log(`  OPENAI_API_KEY:    ${OPENAI_API_KEY ? '✓' : '✗'}`);
	log(`  GROQ_API_KEY:      ${GROQ_API_KEY ? '✓' : '✗'}`);
	log(`  REPLICATE_API_KEY: ${REPLICATE_API_KEY ? '✓' : '✗'}`);

	if (module === 'all' || module === 'caption') {
		await testCaptioning();
	}

	if (module === 'all' || module === 'transcribe') {
		await testTranscription();
	}

	if (module === 'all' || module === 'tts') {
		await testTTS();
	}

	// Summary
	log('\n═══════════════════════════════════════════');
	log('SUMMARY');
	log('═══════════════════════════════════════════\n');

	const passed = results.filter(r => r.status === 'PASS').length;
	const failed = results.filter(r => r.status === 'FAIL').length;
	const skipped = results.filter(r => r.status === 'SKIP').length;

	log(`  PASS: ${passed}  FAIL: ${failed}  SKIP: ${skipped}\n`);

	if (failed > 0) {
		log('Failed tests:');
		results.filter(r => r.status === 'FAIL').forEach(r => {
			log(`  ✗ ${r.test}: ${r.details}`);
		});
		log('');
	}

	process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
	console.error('Test failed:', err);
	process.exit(1);
});
