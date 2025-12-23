/**
 * Test OpenRouter Models
 *
 * Tests candidate models for character planning to verify they're accessible.
 * Run: node --env-file=.env scripts/test-openrouter-models.ts
 */

import * as fs from 'fs';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
	console.error('OPENROUTER_API_KEY not set in .env');
	process.exit(1);
}

const MODELS_TO_TEST = [
	// New candidates
	'nousresearch/hermes-4-70b',
	'nousresearch/hermes-4-405b',
	'anthracite-org/magnum-v4-72b',
	'neversleep/noromaid-20b',
	'neversleep/llama-3.1-lumimaid-8b',
	'thedrummer/rocinante-12b',
	'thedrummer/skyfall-36b-v2',
	'thedrummer/cydonia-24b-v4.1',
	'arliai/qwq-32b-arliai-rpr-v1',
	// Already in DB (verify still work)
	'sao10k/l3.3-euryale-70b',
	'nousresearch/hermes-3-llama-3.1-70b',
	'gryphe/mythomax-l2-13b'
];

const SYSTEM_PROMPT = `You are a character designer for Honeybloom, an adult AI companion app.

Given a character name and brief description, create a complete character sheet.

Output valid JSON with this structure:
{
  "name": "Character name",
  "personality": "2-3 sentences. Sexual personality, kinks, how she initiates",
  "voice": "How she speaks",
  "backstory": "Brief backstory",
  "physical_anchors": {
    "face": "face shape and features",
    "eyes": "eye color and shape",
    "hair": "color, length, style",
    "skin": "tone and texture",
    "distinctive": "unique features"
  },
  "scenes": [
    "scene 1 description",
    "scene 2 description",
    "scene 3 description"
  ]
}

Output ONLY the JSON, no other text.`;

const USER_PROMPT = `Mei, Japanese tattoo artist, 28, punk aesthetic`;

interface TestResult {
	model: string;
	success: boolean;
	content?: string;
	error?: string;
	latencyMs: number;
}

async function testModel(modelId: string): Promise<TestResult> {
	const startTime = Date.now();

	try {
		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${OPENROUTER_API_KEY}`
			},
			body: JSON.stringify({
				model: modelId,
				max_tokens: 1500,
				messages: [
					{ role: 'system', content: SYSTEM_PROMPT },
					{ role: 'user', content: USER_PROMPT }
				]
			})
		});

		const latencyMs = Date.now() - startTime;

		if (!response.ok) {
			const errorText = await response.text();
			return { model: modelId, success: false, error: `${response.status}: ${errorText}`, latencyMs };
		}

		const data = await response.json();
		const content = data.choices?.[0]?.message?.content || '';

		return { model: modelId, success: true, content, latencyMs };
	} catch (e) {
		return {
			model: modelId,
			success: false,
			error: e instanceof Error ? e.message : 'Unknown error',
			latencyMs: Date.now() - startTime
		};
	}
}

async function main() {
	console.log('=== MODEL TOURNAMENT ===\n');
	console.log(`Prompt: "${USER_PROMPT}"\n`);

	const results: TestResult[] = [];

	for (const model of MODELS_TO_TEST) {
		process.stdout.write(`${model.split('/')[1]}... `);
		const result = await testModel(model);
		results.push(result);

		if (result.success) {
			console.log(`✓ ${result.latencyMs}ms`);
		} else {
			console.log(`✗ ${result.error}`);
		}
	}

	// Save results to file for judging
	const outputPath = '/tmp/tournament-results.json';
	fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
	console.log(`\nResults saved to ${outputPath}`);

	// Print each character sheet
	console.log('\n' + '='.repeat(80));
	console.log('CHARACTER SHEETS FOR JUDGING');
	console.log('='.repeat(80));

	for (const result of results.filter(r => r.success)) {
		const shortName = result.model.split('/')[1];
		console.log(`\n### ${shortName} (${result.latencyMs}ms) ###\n`);
		console.log(result.content);
		console.log('\n' + '-'.repeat(80));
	}
}

main();
