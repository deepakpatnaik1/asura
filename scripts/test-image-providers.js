/**
 * Test script for image generation providers
 * Run: node --env-file=.env scripts/test-image-providers.js
 */

const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const FAL_API_KEY = process.env.FAL_API_KEY;
const MODELSLAB_API_KEY = process.env.MODELSLAB_API_KEY;
const VENICE_API_KEY = process.env.VENICE_API_KEY;

// Simple SFW test prompt
const TEST_PROMPT = 'A beautiful sunset over mountains, photorealistic, high quality';

// Results tracking
const results = [];

async function testFireworks() {
	console.log('\n🔥 Testing Fireworks (flux-schnell)...');
	const start = Date.now();

	try {
		const url = 'https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-1-schnell-fp8/text_to_image';
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${FIREWORKS_API_KEY}`,
				'Accept': 'image/png'
			},
			body: JSON.stringify({
				prompt: TEST_PROMPT,
				guidance_scale: 3.5,
				num_inference_steps: 4,
				seed: 12345,
				height: 256,
				width: 256
			})
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`${response.status} - ${error}`);
		}

		const buffer = await response.arrayBuffer();
		const elapsed = Date.now() - start;
		console.log(`   ✅ PASS - ${buffer.byteLength} bytes in ${elapsed}ms`);
		results.push({ provider: 'Fireworks', model: 'flux-schnell', status: 'PASS', time: elapsed, size: buffer.byteLength });
	} catch (err) {
		const elapsed = Date.now() - start;
		console.log(`   ❌ FAIL - ${err.message}`);
		results.push({ provider: 'Fireworks', model: 'flux-schnell', status: 'FAIL', error: err.message, time: elapsed });
	}
}

async function testOpenRouter() {
	console.log('\n🌐 Testing OpenRouter (flux-schnell)...');
	const start = Date.now();

	try {
		const response = await fetch('https://openrouter.ai/api/v1/images/generations', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
				'HTTP-Referer': 'https://asura.app',
				'X-Title': 'Asura'
			},
			body: JSON.stringify({
				model: 'black-forest-labs/flux-schnell',
				prompt: TEST_PROMPT,
				width: 256,
				height: 256,
				seed: 12345,
				n: 1
			})
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`${response.status} - ${error}`);
		}

		const data = await response.json();
		const elapsed = Date.now() - start;

		if (data.data && data.data[0]) {
			const hasImage = data.data[0].b64_json || data.data[0].url;
			console.log(`   ✅ PASS - Got ${hasImage ? 'image' : 'no image'} in ${elapsed}ms`);
			results.push({ provider: 'OpenRouter', model: 'flux-schnell', status: 'PASS', time: elapsed });
		} else {
			throw new Error('No image in response');
		}
	} catch (err) {
		const elapsed = Date.now() - start;
		console.log(`   ❌ FAIL - ${err.message}`);
		results.push({ provider: 'OpenRouter', model: 'flux-schnell', status: 'FAIL', error: err.message, time: elapsed });
	}
}

async function testFal() {
	console.log('\n🎨 Testing Fal.ai (flux-schnell, NSFW enabled)...');
	const start = Date.now();

	try {
		const response = await fetch('https://fal.run/fal-ai/flux/schnell', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Key ${FAL_API_KEY}`
			},
			body: JSON.stringify({
				prompt: TEST_PROMPT,
				image_size: { width: 256, height: 256 },
				num_inference_steps: 4,
				seed: 12345,
				guidance_scale: 3.5,
				num_images: 1,
				enable_safety_checker: false
			})
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`${response.status} - ${error}`);
		}

		const data = await response.json();
		const elapsed = Date.now() - start;

		if (data.images && data.images[0] && data.images[0].url) {
			console.log(`   ✅ PASS - Got image URL in ${elapsed}ms`);
			results.push({ provider: 'Fal.ai', model: 'flux-schnell', status: 'PASS', time: elapsed, nsfw: true });
		} else {
			throw new Error('No image URL in response');
		}
	} catch (err) {
		const elapsed = Date.now() - start;
		console.log(`   ❌ FAIL - ${err.message}`);
		results.push({ provider: 'Fal.ai', model: 'flux-schnell', status: 'FAIL', error: err.message, time: elapsed });
	}
}

async function testModelsLab() {
	console.log('\n🧪 Testing ModelsLab (realistic-vision, NSFW enabled)...');
	const start = Date.now();

	try {
		const response = await fetch('https://modelslab.com/api/v6/images/text2img', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				key: MODELSLAB_API_KEY,
				model_id: 'realistic-vision-v51',
				prompt: TEST_PROMPT,
				negative_prompt: 'bad hands, deformed, blurry',
				width: '256',
				height: '256',
				samples: '1',
				num_inference_steps: '20',
				seed: 12345,
				guidance_scale: 7.5,
				safety_checker: 'no',
				enhance_prompt: 'no'
			})
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`${response.status} - ${error}`);
		}

		const data = await response.json();
		const elapsed = Date.now() - start;

		if (data.status === 'error') {
			throw new Error(data.message || 'API returned error status');
		}

		if (data.status === 'processing') {
			console.log(`   ⏳ Processing... polling for result`);
			// Poll for up to 30 seconds
			let attempts = 0;
			while (attempts < 30) {
				await new Promise(r => setTimeout(r, 1000));
				const pollResponse = await fetch(data.fetch_result, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ key: MODELSLAB_API_KEY })
				});
				const pollData = await pollResponse.json();
				if (pollData.status === 'success' && pollData.output && pollData.output[0]) {
					const totalElapsed = Date.now() - start;
					console.log(`   ✅ PASS - Got image URL in ${totalElapsed}ms (async)`);
					results.push({ provider: 'ModelsLab', model: 'realistic-vision', status: 'PASS', time: totalElapsed, nsfw: true });
					return;
				}
				if (pollData.status === 'error') {
					throw new Error(pollData.message || 'Generation failed');
				}
				attempts++;
			}
			throw new Error('Timed out waiting for image');
		}

		if (data.output && data.output[0]) {
			console.log(`   ✅ PASS - Got image URL in ${elapsed}ms`);
			results.push({ provider: 'ModelsLab', model: 'realistic-vision', status: 'PASS', time: elapsed, nsfw: true });
		} else {
			throw new Error('No output URL in response');
		}
	} catch (err) {
		const elapsed = Date.now() - start;
		console.log(`   ❌ FAIL - ${err.message}`);
		results.push({ provider: 'ModelsLab', model: 'realistic-vision', status: 'FAIL', error: err.message, time: elapsed });
	}
}

async function testVenice() {
	console.log('\n🏛️ Testing Venice AI (flux-dev-uncensored, NSFW enabled)...');
	const start = Date.now();

	try {
		const response = await fetch('https://api.venice.ai/api/v1/image/generate', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${VENICE_API_KEY}`
			},
			body: JSON.stringify({
				model: 'flux-dev-uncensored',
				prompt: TEST_PROMPT,
				negative_prompt: 'bad hands, deformed, blurry',
				width: 256,
				height: 256,
				steps: 25,
				seed: 12345,
				cfg_scale: 7.5
			})
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`${response.status} - ${error}`);
		}

		const data = await response.json();
		const elapsed = Date.now() - start;

		if (data.images && data.images[0]) {
			const hasImage = data.images[0].base64 || data.images[0].url;
			console.log(`   ✅ PASS - Got ${hasImage ? 'image' : 'no image'} in ${elapsed}ms`);
			results.push({ provider: 'Venice', model: 'flux-dev-uncensored', status: 'PASS', time: elapsed, nsfw: true });
		} else {
			throw new Error('No images in response');
		}
	} catch (err) {
		const elapsed = Date.now() - start;
		console.log(`   ❌ FAIL - ${err.message}`);
		results.push({ provider: 'Venice', model: 'flux-dev-uncensored', status: 'FAIL', error: err.message, time: elapsed });
	}
}

async function main() {
	console.log('='.repeat(60));
	console.log('IMAGE PROVIDER TEST');
	console.log('='.repeat(60));
	console.log(`Test prompt: "${TEST_PROMPT}"`);
	console.log(`Image size: 256x256 (draft mode)`);

	// Check API keys
	console.log('\n📋 API Key Status:');
	console.log(`   Fireworks:  ${FIREWORKS_API_KEY ? '✅' : '❌'}`);
	console.log(`   OpenRouter: ${OPENROUTER_API_KEY ? '✅' : '❌'}`);
	console.log(`   Fal.ai:     ${FAL_API_KEY ? '✅' : '❌'}`);
	console.log(`   ModelsLab:  ${MODELSLAB_API_KEY ? '✅' : '❌'}`);
	console.log(`   Venice:     ${VENICE_API_KEY ? '✅' : '❌'}`);

	// Run tests sequentially to avoid rate limits
	await testFireworks();
	await testOpenRouter();
	await testFal();
	await testModelsLab();
	await testVenice();

	// Summary
	console.log('\n' + '='.repeat(60));
	console.log('SUMMARY');
	console.log('='.repeat(60));
	console.log('\n| Provider   | Model              | Status | Time    | NSFW   |');
	console.log('|------------|--------------------| -------|---------|--------|');
	for (const r of results) {
		const status = r.status === 'PASS' ? '✅ PASS' : '❌ FAIL';
		const time = r.time ? `${r.time}ms` : '-';
		const nsfw = r.nsfw ? 'Yes' : '-';
		console.log(`| ${r.provider.padEnd(10)} | ${r.model.padEnd(18)} | ${status} | ${time.padStart(7)} | ${nsfw.padStart(6)} |`);
	}

	const passed = results.filter(r => r.status === 'PASS').length;
	const failed = results.filter(r => r.status === 'FAIL').length;
	console.log(`\n✅ ${passed} passed, ❌ ${failed} failed`);

	// Show any errors
	const errors = results.filter(r => r.error);
	if (errors.length > 0) {
		console.log('\n⚠️ Errors:');
		for (const e of errors) {
			console.log(`   ${e.provider}: ${e.error}`);
		}
	}
}

main().catch(console.error);
