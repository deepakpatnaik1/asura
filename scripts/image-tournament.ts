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
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const FAL_API_KEY = process.env.FAL_API_KEY;
const VENICE_API_KEY = process.env.VENICE_API_KEY;
const MODELSLAB_API_KEY = process.env.MODELSLAB_API_KEY;

const OUTPUT_DIR = '/tmp/image-tournament';

// Image models to test
const IMAGE_MODELS = [
	{ name: 'FLUX Pro 1.1', id: 'fal-ai/flux-pro/v1.1', provider: 'fal' },
	{ name: 'FLUX.1 Dev', id: 'fal-ai/flux/dev', provider: 'fal' },
	{ name: 'FLUX.1 Schnell', id: 'fal-ai/flux/schnell', provider: 'fal' },
	{ name: 'Realistic Vision V6', id: 'fal-ai/realistic-vision', provider: 'fal' },
	{ name: 'Stable Diffusion XL', id: 'fal-ai/fast-sdxl', provider: 'fal' },
	{ name: 'Lustify SDXL', id: 'lustify-sdxl', provider: 'venice' },
	{ name: 'FLUX Dev Uncensored', id: 'flux-dev-uncensored', provider: 'venice' },
	{ name: 'Deliberate v3', id: 'deliberate-v3', provider: 'modelslab' },
	{ name: 'EpicRealism Natural Sin', id: 'epicrealism-natural-sin', provider: 'modelslab' },
	{ name: 'Juggernaut XL v9', id: 'juggernaut-xl-v9', provider: 'modelslab' },
	{ name: 'Realistic Vision v5.1', id: 'realistic-vision-v51', provider: 'modelslab' },
];

// Character planning prompt
const CHARACTER_SYSTEM_PROMPT = `You are a character designer for an adult AI companion app.

Given a character description, create a complete character sheet.

Output valid JSON with this structure:
{
  "name": "Character name",
  "personality": "2-3 sentences about personality and kinks",
  "physical_anchors": {
    "face": "face shape and features",
    "eyes": "eye color and shape",
    "hair": "color, length, style",
    "skin": "tone and texture",
    "body": "body type, breasts, ass",
    "distinctive": "unique features like tattoos, piercings"
  },
  "image_prompt": "A detailed prompt for generating an image of this character. Include: physical description, clothing/state of dress, pose, setting, lighting. Make it detailed enough for an image generator."
}

Output ONLY the JSON, no other text.`;

const CHARACTER_USER_PROMPT = `Mei, 22, Japanese-American, fitness influencer, cute face, big natural breasts, toned body with visible abs, round firm ass`;

interface CharacterSheet {
	name: string;
	personality: string;
	physical_anchors: {
		face: string;
		eyes: string;
		hair: string;
		skin: string;
		body: string;
		distinctive: string;
	};
	image_prompt: string;
}

function getTestCharacter(): CharacterSheet {
	// Hardcoded test character for image tournament
	// Focus is on testing image models, not character generation
	return {
		name: 'Mei',
		personality: 'Energetic fitness influencer with a playful streak. Enjoys teasing and showing off her physique.',
		physical_anchors: {
			face: 'Cute face with high cheekbones, large expressive eyes, full lips',
			eyes: 'Almond-shaped bright brown eyes',
			hair: 'Long wavy dark brown hair, often in a high ponytail',
			skin: 'Fair skin with a healthy glow, smooth and flawless',
			body: 'Toned athletic body with visible abs, big natural breasts, round firm ass',
			distinctive: 'Small cherry blossom tattoo on left hip, belly button piercing'
		},
		image_prompt: 'Beautiful 22 year old Japanese-American fitness influencer named Mei, cute face with high cheekbones and full lips, big expressive brown eyes, long wavy dark brown hair in a high ponytail, toned athletic body with visible abs, big natural breasts, round firm ass, wearing a tight black sports bra and matching yoga shorts, standing in a modern gym with natural lighting from large windows, confident playful smile, photorealistic, grainy film texture, 8k detail'
	};
}

async function generateWithFal(prompt: string, modelId: string): Promise<Buffer> {
	const isSchnell = modelId.includes('schnell');
	const steps = isSchnell ? 4 : 28;

	const response = await fetch(`https://fal.run/${modelId}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Key ${FAL_API_KEY}`
		},
		body: JSON.stringify({
			prompt,
			negative_prompt: 'bad hands, deformed, blurry, watermark, text, ugly, old',
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

async function generateWithVenice(prompt: string, modelId: string): Promise<Buffer> {
	const response = await fetch('https://api.venice.ai/api/v1/image/generate', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${VENICE_API_KEY}`
		},
		body: JSON.stringify({
			model: modelId,
			prompt,
			negative_prompt: 'bad hands, deformed, blurry, watermark, text, ugly, old',
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

async function generateWithModelsLab(prompt: string, modelId: string): Promise<Buffer> {
	const response = await fetch('https://modelslab.com/api/v6/images/text2img', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			key: MODELSLAB_API_KEY,
			model_id: modelId,
			prompt,
			negative_prompt: 'bad hands, deformed, blurry, watermark, text, ugly, old',
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

async function generateImage(prompt: string, model: typeof IMAGE_MODELS[0]): Promise<Buffer> {
	switch (model.provider) {
		case 'fal':
			return generateWithFal(prompt, model.id);
		case 'venice':
			return generateWithVenice(prompt, model.id);
		case 'modelslab':
			return generateWithModelsLab(prompt, model.id);
		default:
			throw new Error(`Unknown provider: ${model.provider}`);
	}
}

function generateHTML(character: CharacterSheet): string {
	const modelDirs = fs.readdirSync(OUTPUT_DIR).filter(d =>
		fs.statSync(path.join(OUTPUT_DIR, d)).isDirectory()
	).sort();

	let modelsHtml = '';
	for (const dir of modelDirs) {
		const images = fs.readdirSync(path.join(OUTPUT_DIR, dir))
			.filter(f => f.endsWith('.png'))
			.sort();

		const imagesHtml = images.map(img =>
			`<img src="${dir}/${img}" alt="${dir} ${img}" onclick="openModal(this.src)">`
		).join('\n        ');

		modelsHtml += `
    <div class="model-row">
      <h2>${dir}</h2>
      <div class="images">
        ${imagesHtml}
      </div>
    </div>`;
	}

	return `<!DOCTYPE html>
<html>
<head>
  <title>Image Tournament - ${character.name}</title>
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
    .prompt {
      background: #2a2a2a;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 30px;
      max-width: 800px;
      margin-left: auto;
      margin-right: auto;
    }
    .prompt h3 { margin: 0 0 10px 0; color: #888; }
    .prompt p { margin: 0; line-height: 1.5; }
    .model-row { margin-bottom: 40px; }
    .model-row h2 {
      margin: 0 0 15px 0;
      padding-bottom: 10px;
      border-bottom: 1px solid #333;
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
  <h1>Image Tournament: ${character.name}</h1>

  <div class="prompt">
    <h3>Image Prompt</h3>
    <p>${character.image_prompt}</p>
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
	if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not set');
	if (!FAL_API_KEY) throw new Error('FAL_API_KEY not set');
	if (!VENICE_API_KEY) throw new Error('VENICE_API_KEY not set');
	if (!MODELSLAB_API_KEY) throw new Error('MODELSLAB_API_KEY not set');

	// Create output directory
	if (fs.existsSync(OUTPUT_DIR)) {
		fs.rmSync(OUTPUT_DIR, { recursive: true });
	}
	fs.mkdirSync(OUTPUT_DIR, { recursive: true });

	// Step 1: Get test character
	const character = getTestCharacter();
	console.log('Character:', character.name);
	console.log('Image prompt:', character.image_prompt);
	console.log('\n' + '='.repeat(80) + '\n');

	// Save character JSON
	fs.writeFileSync(
		path.join(OUTPUT_DIR, 'character.json'),
		JSON.stringify(character, null, 2)
	);

	// Step 2: Generate images for each model
	for (const model of IMAGE_MODELS) {
		const dirName = model.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
		const modelDir = path.join(OUTPUT_DIR, dirName);
		fs.mkdirSync(modelDir, { recursive: true });

		console.log(`\n${model.name} (${model.provider})`);

		for (let i = 1; i <= 3; i++) {
			process.stdout.write(`  Image ${i}/3... `);
			try {
				const imageBuffer = await generateImage(character.image_prompt, model);
				const imagePath = path.join(modelDir, `${i}.png`);
				fs.writeFileSync(imagePath, imageBuffer);
				console.log('✓');
			} catch (error) {
				console.log(`✗ ${error instanceof Error ? error.message : error}`);
			}
		}
	}

	// Step 3: Generate HTML gallery
	console.log('\n' + '='.repeat(80));
	console.log('\nGenerating HTML gallery...');
	const html = generateHTML(character);
	fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), html);

	console.log(`\nDone! Open: file://${OUTPUT_DIR}/index.html`);
}

main().catch(console.error);
