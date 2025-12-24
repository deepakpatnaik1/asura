/**
 * Channel: Character Planner
 *
 * Calls uncensored LLM providers (OpenRouter, Venice) to generate
 * character sheets. Pure API wrapper - no business logic.
 */

import { CHARACTER_PLANNER_PROMPT } from '$lib/prompts/workers/character-planner';

/**
 * Physical anchors - consistent visual identifiers across all images
 */
export interface PhysicalAnchors {
	face: string;
	eyes: string;
	hair: string;
	skin: string;
	distinctive: string;
}

/**
 * Character sheet structure returned by planner
 */
export interface CharacterSheet {
	name: string;
	personality: string;
	voice: string;
	backstory: string;
	physical_anchors: PhysicalAnchors;
	scenes: string[];
}

/**
 * API keys for character planning providers
 */
export interface PlannerApiKeys {
	openrouter?: string;
	venice?: string;
}

/**
 * Call OpenRouter API for character planning
 */
async function callOpenRouter(
	model: string,
	name: string,
	description: string,
	apiKey: string
): Promise<string> {
	const userPrompt = `Create a character sheet for: ${name} - ${description}`;

	const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
			'HTTP-Referer': 'https://aether.local',
			'X-Title': 'Aether Character Planner'
		},
		body: JSON.stringify({
			model,
			messages: [
				{ role: 'system', content: CHARACTER_PLANNER_PROMPT },
				{ role: 'user', content: userPrompt }
			],
			max_tokens: 4096,
			temperature: 0.7
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
	}

	const data = await response.json();
	return data.choices?.[0]?.message?.content || '';
}

/**
 * Call Venice API for character planning
 */
async function callVenice(
	model: string,
	name: string,
	description: string,
	apiKey: string
): Promise<string> {
	const userPrompt = `Create a character sheet for: ${name} - ${description}`;

	const response = await fetch('https://api.venice.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model,
			messages: [
				{ role: 'system', content: CHARACTER_PLANNER_PROMPT },
				{ role: 'user', content: userPrompt }
			],
			max_tokens: 4096,
			temperature: 0.7
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Venice API error: ${response.status} - ${error}`);
	}

	const data = await response.json();
	return data.choices?.[0]?.message?.content || '';
}

/**
 * Generate a character sheet using the appropriate provider.
 *
 * @param model - Model identifier
 * @param provider - Provider name ('venice' or 'openrouter')
 * @param name - Character name
 * @param description - Character description
 * @param apiKeys - API keys for providers
 * @returns Parsed CharacterSheet
 */
export async function generateCharacterSheet(
	model: string,
	provider: string,
	name: string,
	description: string,
	apiKeys: PlannerApiKeys
): Promise<CharacterSheet> {
	let rawOutput: string;

	if (provider === 'venice') {
		if (!apiKeys.venice) {
			throw new Error('Venice API key not configured');
		}
		rawOutput = await callVenice(model, name, description, apiKeys.venice);
	} else {
		// Default to OpenRouter for all other providers
		if (!apiKeys.openrouter) {
			throw new Error('OpenRouter API key not configured');
		}
		rawOutput = await callOpenRouter(model, name, description, apiKeys.openrouter);
	}

	// Parse JSON from response (may have markdown code blocks)
	const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
	if (!jsonMatch) {
		throw new Error('No JSON found in character planner response');
	}

	const sheet = JSON.parse(jsonMatch[0]) as CharacterSheet;

	// Validate required fields
	if (!sheet.name || !sheet.physical_anchors || !sheet.scenes) {
		throw new Error('Character sheet missing required fields');
	}

	return sheet;
}
