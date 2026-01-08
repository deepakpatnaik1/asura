/**
 * Image Generation Tournament
 *
 * 1. Generate a character with MythoMax 13B
 * 2. Generate 3 images per model using the character's first scene
 * 3. Save to folder structure
 * 4. Generate HTML gallery for judging
 *
 * Run: npx tsx scripts/image-tournament.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
const FAL_API_KEY = process.env.FAL_API_KEY;
const VENICE_API_KEY = process.env.VENICE_API_KEY;
const MODELSLAB_API_KEY = process.env.MODELSLAB_API_KEY;

const OUTPUT_DIR = '/tmp/image-tournament';

// Architecture types for prompt selection
type Architecture = 'flux' | 'flux2' | 'sdxl' | 'sd15' | 'sd35';

// Image models to test (14 total: 4 Flux, 5 SDXL, 3 SD1.5, 2 SD3.5)
// Note: Removed Venice flux-dev and flux-dev-uncensored (deprecated Oct 2025)
// Note: Replaced SDXL Turbo with SDXL Lightning (deprecated)
const IMAGE_MODELS: Array<{ name: string; id: string; provider: string; arch: Architecture }> = [
	// Flux models (4)
	{ name: 'FLUX Pro 1.1', id: 'fal-ai/flux-pro/v1.1', provider: 'fal', arch: 'flux' },
	{ name: 'FLUX.1 Dev', id: 'fal-ai/flux/dev', provider: 'fal', arch: 'flux' },
	{ name: 'FLUX.1 Schnell', id: 'fal-ai/flux/schnell', provider: 'fal', arch: 'flux' },
	{ name: 'FLUX.2 Turbo', id: 'fal-ai/flux-2/turbo', provider: 'fal', arch: 'flux2' },
	// SDXL models (5)
	{ name: 'Stable Diffusion XL', id: 'fal-ai/fast-sdxl', provider: 'fal', arch: 'sdxl' },
	{ name: 'SDXL Lightning', id: 'fal-ai/fast-lightning-sdxl', provider: 'fal', arch: 'sdxl' },
	{ name: 'Lustify SDXL', id: 'lustify-sdxl', provider: 'venice', arch: 'sdxl' },
	{ name: 'Juggernaut XL', id: 'juggernaut-xl', provider: 'modelslab', arch: 'sdxl' },
	{ name: 'EpicRealism XL', id: 'epicrealism-xl', provider: 'modelslab', arch: 'sdxl' },
	// SD1.5 models (3)
	{ name: 'Realistic Vision V6', id: 'fal-ai/realistic-vision', provider: 'fal', arch: 'sd15' },
	{ name: 'Realistic Vision v5.1', id: 'realistic-vision-v51', provider: 'modelslab', arch: 'sd15' },
	{ name: 'Deliberate v3', id: 'deliberate-v3', provider: 'modelslab', arch: 'sd15' },
	// SD3.5 models (2)
	{ name: 'SD3.5 Large', id: 'fal-ai/stable-diffusion-v35-large', provider: 'fal', arch: 'sd35' },
	{ name: 'SD3.5 Medium', id: 'fal-ai/stable-diffusion-v35-medium', provider: 'fal', arch: 'sd35' },
];

// Architecture-specific prompts (from Blue's research)
const PROMPTS: Record<Architecture, { positive: string; negative: string }> = {
	flux: {
		positive: `IMG_1025.HEIC, candid medium shot of a 25-year-old woman with warm brown eyes and honey-blonde hair loosely tied back. Natural, imperfect skin texture with visible pores and light freckles across her nose. Soft grey cotton sweater, relaxed posture. Warm diffused lighting from window on left, soft shadows on jawline. Shot on 35mm film, f/1.8, shallow depth of field, slight film grain. Cinematic, intimate mood.`,
		negative: 'bad hands, deformed, blurry, watermark, text'
	},
	flux2: {
		positive: `IMG_1025.HEIC, candid medium shot of a 25-year-old woman with warm brown eyes and honey-blonde hair loosely tied back. Natural, imperfect skin texture with visible pores and light freckles across her nose. Soft grey cotton sweater, relaxed posture. Warm diffused lighting from window on left, soft shadows on jawline. Shot on 35mm film, f/1.8, shallow depth of field, slight film grain. Cinematic, intimate mood.`,
		negative: 'bad hands, deformed, blurry, watermark, text'
	},
	sdxl: {
		positive: `Photo of a beautiful 25 year old woman, warm brown eyes, honey-blonde hair in messy bun, natural look, no heavy makeup. Detailed skin, subsurface scattering, natural pores. Soft grey sweater, cozy morning vibe. Shot on Sony A7R IV, 85mm lens, f/2.8, soft window lighting, shallow depth of field. (masterpiece:1.2), (best quality), raw photo, hyperrealistic, 8k uhd.`,
		negative: '(worst quality:1.2), (bad quality:1.2), cartoon, anime, 3d, painting, illustration, cgi, plastic skin, smooth skin, bad anatomy, bad hands, extra fingers, text, watermark'
	},
	sd15: {
		positive: `RAW photo, close up portrait of a 25 year old woman, warm brown eyes, honey-blonde hair, natural look, no makeup, soft grey sweater, window lighting, soft shadows, film grain, dslr, 8k, extremely detailed, highly detailed skin, skin pores, sharp focus, (intricate details:1.2), (fujifilm:1.1)`,
		negative: '(deformed iris, deformed pupils, semi-realistic, cgi, 3d, render, sketch, cartoon, drawing, anime:1.4), text, cropped, out of frame, worst quality, low quality, jpeg artifacts, ugly, duplicate, morbid, mutilated, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, blurry, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, long neck'
	},
	sd35: {
		positive: `IMG_1025.HEIC, candid medium shot of a 25-year-old woman with warm brown eyes and honey-blonde hair loosely tied back. Natural, imperfect skin texture with visible pores and light freckles across her nose. Soft grey cotton sweater, relaxed posture. Warm diffused lighting from window on left, soft shadows on jawline. Shot on 35mm film, f/1.8, shallow depth of field, slight film grain. Cinematic, intimate mood.`,
		negative: 'bad hands, deformed, blurry, watermark, text, ugly, low quality'
	}
};

async function generateWithFal(prompt: string, negativePrompt: string, modelId: string): Promise<Buffer> {
	const isSchnell = modelId.includes('schnell');
	const isTurbo = modelId.includes('turbo');
	const isLightning = modelId.includes('lightning');
	const steps = isSchnell ? 4 : isLightning ? 4 : isTurbo ? 8 : 28;

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
			num_inference_steps: steps,
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

async function generateWithVenice(prompt: string, negativePrompt: string, modelId: string): Promise<Buffer> {
	const response = await fetch('https://api.venice.ai/api/v1/image/generate', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${VENICE_API_KEY}`
		},
		body: JSON.stringify({
			model: modelId,
			prompt,
			negative_prompt: negativePrompt,
			width: 768,
			height: 1024,
			steps: 25,
			seed: Math.floor(Math.random() * 999999999),
			cfg_scale: 7.5,
			safe_mode: false
		})
	});

	if (!response.ok) {
		throw new Error(`Venice error: ${response.status} - ${await response.text()}`);
	}

	const data = await response.json();
	const imageData = data.images?.[0];

	if (typeof imageData === 'string') {
		return Buffer.from(imageData, 'base64');
	}
	if (imageData?.base64) {
		return Buffer.from(imageData.base64, 'base64');
	}
	if (imageData?.url) {
		const imageResponse = await fetch(imageData.url);
		return Buffer.from(await imageResponse.arrayBuffer());
	}

	throw new Error('No image data in Venice response');
}

async function generateWithModelsLab(prompt: string, negativePrompt: string, modelId: string): Promise<Buffer> {
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

async function generateImage(model: typeof IMAGE_MODELS[0]): Promise<{ buffer: Buffer; latencyMs: number }> {
	const prompts = PROMPTS[model.arch];
	const startTime = Date.now();

	let buffer: Buffer;
	switch (model.provider) {
		case 'fal':
			buffer = await generateWithFal(prompts.positive, prompts.negative, model.id);
			break;
		case 'venice':
			buffer = await generateWithVenice(prompts.positive, prompts.negative, model.id);
			break;
		case 'modelslab':
			buffer = await generateWithModelsLab(prompts.positive, prompts.negative, model.id);
			break;
		default:
			throw new Error(`Unknown provider: ${model.provider}`);
	}

	return { buffer, latencyMs: Date.now() - startTime };
}

function generateHTML(results: Array<{ model: string; arch: string; avgLatencyMs: number; successCount: number }>): string {
	const modelDirs = fs.readdirSync(OUTPUT_DIR).filter(d =>
		fs.statSync(path.join(OUTPUT_DIR, d)).isDirectory()
	).sort();

	// Create a lookup from dir name to model info
	const modelLookup = new Map<string, typeof IMAGE_MODELS[0]>();
	for (const m of IMAGE_MODELS) {
		const dirName = m.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
		modelLookup.set(dirName, m);
	}

	let modelsHtml = '';
	for (const dir of modelDirs) {
		const model = modelLookup.get(dir);
		const result = results.find(r => r.model.toLowerCase().replace(/[^a-z0-9]+/g, '-') === dir);
		const latencyStr = result && result.successCount > 0 ? `${(result.avgLatencyMs / 1000).toFixed(1)}s avg` : 'FAILED';

		const images = fs.readdirSync(path.join(OUTPUT_DIR, dir))
			.filter(f => f.endsWith('.png'))
			.sort();

		const imagesHtml = images.map(img =>
			`<img src="${dir}/${img}" alt="${dir} ${img}" onclick="openModal(this.src)">`
		).join('\n        ');

		modelsHtml += `
    <div class="model-row">
      <h2>${model?.name || dir} <span class="arch">${model?.arch || '?'}</span> <span class="latency">${latencyStr}</span></h2>
      <div class="images">
        ${imagesHtml}
      </div>
    </div>`;
	}

	return `<!DOCTYPE html>
<html>
<head>
  <title>Image Tournament - Round 1</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      background: #1a1a1a;
      color: #fff;
      margin: 0;
      padding: 20px;
    }
    h1 { text-align: center; margin-bottom: 10px; }
    .info {
      background: #2a2a2a;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 30px;
      max-width: 900px;
      margin-left: auto;
      margin-right: auto;
    }
    .info h3 { margin: 0 0 10px 0; color: #888; }
    .info p { margin: 0 0 10px 0; line-height: 1.5; font-size: 14px; }
    .model-row { margin-bottom: 40px; }
    .model-row h2 {
      margin: 0 0 15px 0;
      padding-bottom: 10px;
      border-bottom: 1px solid #333;
    }
    .arch {
      font-size: 14px;
      color: #888;
      font-weight: normal;
      background: #333;
      padding: 2px 8px;
      border-radius: 4px;
      margin-left: 10px;
    }
    .latency {
      font-size: 14px;
      color: #4ade80;
      font-weight: normal;
      margin-left: 10px;
    }
    .images {
      display: flex;
      gap: 15px;
      flex-wrap: wrap;
    }
    .images img {
      height: 400px;
      border-radius: 8px;
      cursor: pointer;
      transition: transform 0.2s;
    }
    .images img:hover { transform: scale(1.02); }
    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.9);
      justify-content: center;
      align-items: center;
      z-index: 1000;
    }
    .modal img {
      max-height: 95vh;
      max-width: 95vw;
    }
    .modal.active { display: flex; }
  </style>
</head>
<body>
  <h1>Image Tournament: Round 1</h1>

  <div class="info">
    <h3>Tournament Setup</h3>
    <p><strong>Models:</strong> ${IMAGE_MODELS.length} total (4 Flux, 5 SDXL, 3 SD1.5, 2 SD3.5)</p>
    <p><strong>Prompts:</strong> Architecture-specific (natural language for Flux/SD3.5, keyword-style for SDXL/SD1.5)</p>
    <p><strong>Judge on:</strong> Photorealism, attractiveness, speed</p>
  </div>

  ${modelsHtml}

  <div class="modal" onclick="closeModal()">
    <img id="modal-img" src="">
  </div>

  <script>
    function openModal(src) {
      document.getElementById('modal-img').src = src;
      document.querySelector('.modal').classList.add('active');
    }
    function closeModal() {
      document.querySelector('.modal').classList.remove('active');
    }
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
    });
  </script>
</body>
</html>`;
}

async function main() {
	// Check API keys
	if (!FAL_API_KEY) throw new Error('FAL_API_KEY not set');
	if (!VENICE_API_KEY) throw new Error('VENICE_API_KEY not set');
	if (!MODELSLAB_API_KEY) throw new Error('MODELSLAB_API_KEY not set');

	// Create output directory
	if (fs.existsSync(OUTPUT_DIR)) {
		fs.rmSync(OUTPUT_DIR, { recursive: true });
	}
	fs.mkdirSync(OUTPUT_DIR, { recursive: true });

	// Step 1: Log tournament info
	console.log('Model Tournament - Architecture-Specific Prompts');
	console.log('='.repeat(60));
	console.log(`\nModels: ${IMAGE_MODELS.length}`);
	console.log('Architectures: flux, flux2, sdxl, sd15, sd35');
	console.log('\n' + '='.repeat(60) + '\n');

	// Save prompts JSON for reference
	fs.writeFileSync(
		path.join(OUTPUT_DIR, 'prompts.json'),
		JSON.stringify(PROMPTS, null, 2)
	);

	// Track results with latency
	const results: Array<{ model: string; arch: string; avgLatencyMs: number; successCount: number }> = [];

	// Step 2: Generate images for each model
	for (const model of IMAGE_MODELS) {
		const dirName = model.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
		const modelDir = path.join(OUTPUT_DIR, dirName);
		fs.mkdirSync(modelDir, { recursive: true });

		console.log(`\n${model.name} (${model.provider}, ${model.arch})`);

		const latencies: number[] = [];
		let successCount = 0;

		for (let i = 1; i <= 3; i++) {
			process.stdout.write(`  Image ${i}/3... `);
			try {
				const { buffer, latencyMs } = await generateImage(model);
				const imagePath = path.join(modelDir, `${i}.png`);
				fs.writeFileSync(imagePath, buffer);
				latencies.push(latencyMs);
				successCount++;
				console.log(`✓ ${(latencyMs / 1000).toFixed(1)}s`);
			} catch (error) {
				console.log(`✗ ${error instanceof Error ? error.message : error}`);
			}
		}

		const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
		results.push({ model: model.name, arch: model.arch, avgLatencyMs: avgLatency, successCount });
	}

	// Save results JSON
	fs.writeFileSync(path.join(OUTPUT_DIR, 'results.json'), JSON.stringify(results, null, 2));

	// Print summary table
	console.log('\n' + '='.repeat(60));
	console.log('\nLatency Summary:');
	console.log('-'.repeat(60));
	results.sort((a, b) => a.avgLatencyMs - b.avgLatencyMs);
	for (const r of results) {
		if (r.successCount > 0) {
			console.log(`  ${r.model.padEnd(25)} ${r.arch.padEnd(6)} ${(r.avgLatencyMs / 1000).toFixed(1)}s avg`);
		} else {
			console.log(`  ${r.model.padEnd(25)} ${r.arch.padEnd(6)} FAILED`);
		}
	}

	// Step 3: Generate HTML gallery
	console.log('\n' + '='.repeat(60));
	console.log('\nGenerating HTML gallery...');
	const html = generateHTML(results);
	fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), html);

	console.log(`\nDone! Open: file://${OUTPUT_DIR}/index.html`);
}

main().catch(console.error);
