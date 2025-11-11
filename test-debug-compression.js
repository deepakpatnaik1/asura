/**
 * Debug test to see what Fireworks API actually returns
 */

import OpenAI from 'openai';

async function testRawResponse() {
	const apiKey = process.env.FIREWORKS_API_KEY;
	if (!apiKey) {
		console.error('FIREWORKS_API_KEY not set');
		process.exit(1);
	}

	const fireworks = new OpenAI({
		baseURL: 'https://api.fireworks.ai/inference/v1',
		apiKey: apiKey
	});

	const PROMPT = `You will receive a file. Apply Artisan Cut compression.

KEEP: numbers, dates, entities, decisions
REMOVE: verbose prose, noise, qualifiers

Return a JSON object with this EXACT structure:
{
  "filename": "[exact filename including extension]",
  "file_type": "[image|pdf|text|code|spreadsheet|other]",
  "description": "[compressed description]"
}

Output ONLY the JSON object. No additional text.`;

	try {
		console.log('Calling Fireworks API...');
		const response = await fireworks.chat.completions.create({
			model: 'accounts/fireworks/models/qwen3-235b-a22b',
			messages: [
				{
					role: 'system',
					content: PROMPT
				},
				{
					role: 'user',
					content: `File: test.pdf\nFile Type: pdf\n\nQ3 2025 Financial Results: Revenue $5.2M, Operating margin 15%`
				}
			],
			temperature: 0.7,
			max_tokens: 2000
		});

		console.log('\nRaw response:');
		console.log(JSON.stringify(response, null, 2));

		const content = response.choices[0]?.message?.content;
		console.log('\nExtracted content:');
		console.log(content);

		// Try to parse
		try {
			const parsed = JSON.parse(content);
			console.log('\nParsed successfully:');
			console.log(JSON.stringify(parsed, null, 2));
		} catch (e) {
			console.log('\nFailed to parse directly. Trying regex extraction...');

			// Try markdown code block
			const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
			if (jsonMatch) {
				console.log('Found markdown code block');
				try {
					const parsed = JSON.parse(jsonMatch[1]);
					console.log('Parsed from markdown block:');
					console.log(JSON.stringify(parsed, null, 2));
				} catch (e2) {
					console.log('Failed to parse from markdown block:', e2.message);
				}
			}
		}
	} catch (error) {
		console.error('API Error:', error.message);
		console.error('Details:', error);
	}
}

testRawResponse();
