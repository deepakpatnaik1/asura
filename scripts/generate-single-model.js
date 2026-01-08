/**
 * Generate tournament images for a single model
 *
 * Usage: node --env-file=.env scripts/generate-single-model.js <model-key>
 *
 * Model keys: juggernaut-xl, epicrealism-xl, realistic-vision-v51, deliberate-v3,
 *             sd35-large, sd35-medium
 */

import fs from 'fs';
import path from 'path';

const MODELSLAB_API_KEY = process.env.MODELSLAB_API_KEY;
const FAL_API_KEY = process.env.FAL_API_KEY;

const OUTPUT_BASE = '/Users/d.patnaik/obsidian/📦 sprint-5/007-tournament-images';

// Model configs
const MODELS = {
	'juggernaut-xl': { id: 'juggernaut-xl', provider: 'modelslab', arch: 'sdxl', name: 'Juggernaut XL' },
	'epicrealism-xl': { id: 'epicrealism-xl', provider: 'modelslab', arch: 'sdxl', name: 'EpicRealism XL' },
	'realistic-vision-v51': { id: 'realistic-vision-v51', provider: 'modelslab', arch: 'sd15', name: 'Realistic Vision v5.1' },
	'deliberate-v3': { id: 'deliberate-v3', provider: 'modelslab', arch: 'sd15', name: 'Deliberate v3' },
	'sd35-large': { id: 'fal-ai/stable-diffusion-v35-large', provider: 'fal', arch: 'sd35', name: 'SD3.5 Large' },
	'sd35-medium': { id: 'fal-ai/stable-diffusion-v35-medium', provider: 'fal', arch: 'sd35', name: 'SD3.5 Medium' }
};

// Variety prompts - three different contexts
const VARIETY_PROMPTS = {
	sdxl: [
		{
			name: 'farmers-market',
			positive: `Photo of a beautiful 25 year old woman at a farmers market, warm brown eyes, honey-blonde hair loosely down, wearing light summer dress, natural freckles, holding fresh produce, golden hour sunlight, candid moment. Shot on Sony A7R IV, 85mm lens, f/2.8, shallow depth of field. (masterpiece:1.2), (best quality), raw photo, hyperrealistic, 8k uhd.`,
			negative: '(worst quality:1.2), (bad quality:1.2), cartoon, anime, 3d, painting, illustration, cgi, plastic skin, smooth skin, bad anatomy, bad hands, extra fingers, text, watermark'
		},
		{
			name: 'potters-wheel',
			positive: `Photo of a beautiful 25 year old woman at a potter's wheel in art studio, warm brown eyes, honey-blonde hair in messy bun, wearing tied denim shirt and shorts, clay on hands, focused expression, natural skin texture with freckles, soft studio lighting from side. Shot on Sony A7R IV, 85mm lens, f/2.8. (masterpiece:1.2), (best quality), raw photo, hyperrealistic, 8k uhd.`,
			negative: '(worst quality:1.2), (bad quality:1.2), cartoon, anime, 3d, painting, illustration, cgi, plastic skin, smooth skin, bad anatomy, bad hands, extra fingers, text, watermark'
		},
		{
			name: 'bedroom',
			positive: `Photo of a beautiful 25 year old woman nude in bedroom, warm brown eyes, honey-blonde hair loosely over bare shoulders, lying in bed, full body visible, explicit nudity, breasts exposed, natural skin with freckles, soft morning light through sheer curtains, intimate mood. Shot on Sony A7R IV, 85mm lens, f/2.8. (masterpiece:1.2), (best quality), raw photo, hyperrealistic, 8k uhd.`,
			negative: '(worst quality:1.2), (bad quality:1.2), cartoon, anime, 3d, painting, illustration, cgi, plastic skin, smooth skin, bad anatomy, bad hands, extra fingers, text, watermark'
		}
	],
	sd15: [
		{
			name: 'farmers-market',
			positive: `RAW photo, portrait of a 25 year old woman at farmers market, warm brown eyes, honey-blonde hair, light summer dress, natural freckles, golden hour, candid, dslr, 8k, extremely detailed, highly detailed skin, skin pores, sharp focus, (intricate details:1.2), (fujifilm:1.1)`,
			negative: '(deformed iris, deformed pupils, semi-realistic, cgi, 3d, render, sketch, cartoon, drawing, anime:1.4), text, cropped, out of frame, worst quality, low quality, jpeg artifacts, ugly, duplicate, morbid, mutilated, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, blurry, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, long neck'
		},
		{
			name: 'potters-wheel',
			positive: `RAW photo, portrait of a 25 year old woman at potter's wheel, warm brown eyes, honey-blonde hair messy bun, denim shirt tied, clay on hands, art studio, soft side lighting, dslr, 8k, extremely detailed, highly detailed skin, skin pores, sharp focus, (intricate details:1.2), (fujifilm:1.1)`,
			negative: '(deformed iris, deformed pupils, semi-realistic, cgi, 3d, render, sketch, cartoon, drawing, anime:1.4), text, cropped, out of frame, worst quality, low quality, jpeg artifacts, ugly, duplicate, morbid, mutilated, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, blurry, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, long neck'
		},
		{
			name: 'bedroom',
			positive: `RAW photo, nude woman 25 years old in bedroom, warm brown eyes, honey-blonde hair, lying in bed, full body, explicit nudity, breasts exposed, natural skin, freckles, soft morning light, intimate, dslr, 8k, extremely detailed, highly detailed skin, skin pores, sharp focus, (intricate details:1.2), (fujifilm:1.1)`,
			negative: '(deformed iris, deformed pupils, semi-realistic, cgi, 3d, render, sketch, cartoon, drawing, anime:1.4), text, cropped, out of frame, worst quality, low quality, jpeg artifacts, ugly, duplicate, morbid, mutilated, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, blurry, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, long neck'
		}
	],
	sd35: [
		{
			name: 'farmers-market',
			positive: `IMG_1025.HEIC, candid shot of a 25-year-old woman at a farmers market with warm brown eyes and honey-blonde hair loosely down. Light summer dress, holding fresh produce. Natural freckles across her nose. Golden hour sunlight, soft shadows. Shot on 35mm film, f/1.8, shallow depth of field.`,
			negative: 'bad hands, deformed, blurry, watermark, text, ugly, low quality'
		},
		{
			name: 'potters-wheel',
			positive: `IMG_1025.HEIC, candid shot of a 25-year-old woman at a potter's wheel in art studio with warm brown eyes and honey-blonde hair in messy bun. Tied denim shirt and shorts, clay on hands. Natural skin with freckles, focused expression. Soft studio lighting from side. Shot on 35mm film, f/1.8.`,
			negative: 'bad hands, deformed, blurry, watermark, text, ugly, low quality'
		},
		{
			name: 'bedroom',
			positive: `IMG_1025.HEIC, intimate portrait of a 25-year-old nude woman with warm brown eyes and honey-blonde hair loosely over bare shoulders. Lying in bed, full body visible, explicit nudity. Natural skin with freckles. Soft morning light through sheer curtains. Shot on 35mm film, f/1.8. Intimate, sensual mood.`,
			negative: 'bad hands, deformed, blurry, watermark, text, ugly, low quality'
		}
	]
};

async function generateWithModelsLab(prompt, negativePrompt, modelId) {
	console.log(`  Calling ModelsLab API...`);

	const response = await fetch('https://modelslab.com/api/v6/images/text2img', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			key: MODELSLAB_API_KEY,
			model_id: modelId,
			prompt,
			negative_prompt: negativePrompt,
			width: '768',
			height: '1024',
			samples: '1',
			num_inference_steps: '30',
			seed: Math.floor(Math.random() * 2147483647),
			guidance_scale: 7.5,
			safety_checker: 'no',
			enhance_prompt: 'no'
		})
	});

	if (!response.ok) {
		throw new Error(`ModelsLab error: ${response.status} - ${await response.text()}`);
	}

	const data = await response.json();

	if (data.status === 'error') {
		throw new Error(`ModelsLab error: ${data.message}`);
	}

	// Handle async processing
	if (data.status === 'processing') {
		const fetchUrl = data.fetch_result;
		console.log(`  Processing... (polling)`);
		for (let i = 0; i < 60; i++) {
			await new Promise((r) => setTimeout(r, 2000));
			const pollResponse = await fetch(fetchUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ key: MODELSLAB_API_KEY })
			});
			const pollData = await pollResponse.json();
			if (pollData.status === 'success' && pollData.output?.[0]) {
				const imageResponse = await fetch(pollData.output[0]);
				return Buffer.from(await imageResponse.arrayBuffer());
			}
			if (pollData.status === 'error') {
				throw new Error(`ModelsLab generation failed: ${pollData.message}`);
			}
			process.stdout.write('.');
		}
		throw new Error('ModelsLab timeout');
	}

	// Immediate success
	if (!data.output?.[0]) {
		throw new Error('No output URL in ModelsLab response');
	}

	const imageResponse = await fetch(data.output[0]);
	return Buffer.from(await imageResponse.arrayBuffer());
}

async function generateWithFal(prompt, negativePrompt, modelId) {
	console.log(`  Calling fal.ai API...`);

	const response = await fetch(`https://fal.run/${modelId}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Key ${FAL_API_KEY}`
		},
		body: JSON.stringify({
			prompt,
			negative_prompt: negativePrompt,
			image_size: { width: 768, height: 1024 },
			num_inference_steps: 28,
			seed: Math.floor(Math.random() * 2147483647),
			guidance_scale: 3.5,
			num_images: 1,
			enable_safety_checker: false,
			safety_tolerance: 6
		})
	});

	if (!response.ok) {
		throw new Error(`Fal error: ${response.status} - ${await response.text()}`);
	}

	const data = await response.json();
	const imageUrl = data.images?.[0]?.url;
	if (!imageUrl) {
		throw new Error('No image URL in Fal response');
	}

	const imageResponse = await fetch(imageUrl);
	return Buffer.from(await imageResponse.arrayBuffer());
}

async function main() {
	const modelKey = process.argv[2];

	if (!modelKey || !MODELS[modelKey]) {
		console.log('Usage: node --env-file=.env scripts/generate-single-model.js <model-key>');
		console.log('\nAvailable models:');
		for (const [key, model] of Object.entries(MODELS)) {
			console.log(`  ${key.padEnd(25)} ${model.name}`);
		}
		process.exit(1);
	}

	const model = MODELS[modelKey];
	const prompts = VARIETY_PROMPTS[model.arch];

	if (!prompts) {
		console.error(`No prompts defined for architecture: ${model.arch}`);
		process.exit(1);
	}

	// Check API keys
	if (model.provider === 'modelslab' && !MODELSLAB_API_KEY) {
		console.error('MODELSLAB_API_KEY not set');
		process.exit(1);
	}
	if (model.provider === 'fal' && !FAL_API_KEY) {
		console.error('FAL_API_KEY not set');
		process.exit(1);
	}

	// Create output directory
	const dirName = `00${Object.keys(MODELS).indexOf(modelKey) + 80}-${modelKey}`;
	const outputDir = path.join(OUTPUT_BASE, dirName);

	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	console.log(`\n🎨 Generating images for ${model.name}`);
	console.log(`   Architecture: ${model.arch}`);
	console.log(`   Provider: ${model.provider}`);
	console.log(`   Output: ${outputDir}\n`);

	const latencies = [];

	for (let i = 0; i < prompts.length; i++) {
		const prompt = prompts[i];
		console.log(`[${i + 1}/3] ${prompt.name}`);

		const startTime = Date.now();
		try {
			let buffer;
			if (model.provider === 'modelslab') {
				buffer = await generateWithModelsLab(prompt.positive, prompt.negative, model.id);
			} else if (model.provider === 'fal') {
				buffer = await generateWithFal(prompt.positive, prompt.negative, model.id);
			}

			const latencyMs = Date.now() - startTime;
			latencies.push(latencyMs);

			const filename = `${i + 1}.png`;
			fs.writeFileSync(path.join(outputDir, filename), buffer);
			console.log(`  ✓ Saved ${filename} (${(latencyMs / 1000).toFixed(1)}s)\n`);
		} catch (error) {
			console.log(`  ✗ Error: ${error.message}\n`);
		}
	}

	const avgLatency = latencies.length > 0
		? (latencies.reduce((a, b) => a + b, 0) / latencies.length / 1000).toFixed(1)
		: 'N/A';

	console.log(`\n✅ Done! Average latency: ${avgLatency}s`);
	console.log(`   Images saved to: ${outputDir}`);
}

main().catch(console.error);
