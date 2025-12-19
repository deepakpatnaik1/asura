/**
 * Model Provider Detection & Tool Conversion
 *
 * Utilities for looking up provider from database and converting
 * tool schemas between Anthropic and OpenAI formats.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ProviderType = 'anthropic' | 'openai' | 'google' | 'fireworks' | 'openrouter' | 'together' | 'groq' | 'replicate' | 'fal' | 'voyage' | 'modelslab' | 'venice';

/**
 * OpenAI-compatible tool format (used by Fireworks, OpenRouter)
 */
export interface OpenAITool {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: {
			type: string;
			properties: Record<string, unknown>;
			required?: string[];
		};
	};
}

/**
 * OpenAI-compatible tool call in response
 */
export interface OpenAIToolCall {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string; // JSON string
	};
}

/**
 * Convert Anthropic tool schema to OpenAI format.
 *
 * Anthropic: { name, description, input_schema: { type, properties, required } }
 * OpenAI: { type: 'function', function: { name, description, parameters: { type, properties, required } } }
 */
export function convertToolToOpenAI(anthropicTool: Anthropic.Tool): OpenAITool {
	return {
		type: 'function',
		function: {
			name: anthropicTool.name,
			description: anthropicTool.description || '',
			parameters: {
				type: anthropicTool.input_schema.type as string,
				properties: (anthropicTool.input_schema.properties || {}) as Record<string, unknown>,
				required: anthropicTool.input_schema.required as string[] | undefined
			}
		}
	};
}

/**
 * Convert array of Anthropic tools to OpenAI format.
 */
export function convertToolsToOpenAI(anthropicTools: Anthropic.Tool[]): OpenAITool[] {
	return anthropicTools.map(convertToolToOpenAI);
}

/**
 * Look up the provider for a model from the database.
 *
 * @param supabase - Supabase client
 * @param modelIdentifier - The model identifier string
 * @returns The provider type from the models table
 * @throws Error if the model is not found in the database
 */
export async function getModelProvider(
	supabase: SupabaseClient,
	modelIdentifier: string
): Promise<ProviderType> {
	const { data, error } = await supabase
		.from('models')
		.select('provider')
		.eq('model_identifier', modelIdentifier)
		.single();

	if (error || !data) {
		throw new Error(`Model not found in database: ${modelIdentifier}`);
	}

	return data.provider as ProviderType;
}

/**
 * Check if a provider is currently supported.
 *
 * @param provider - The provider type to check
 * @returns True if the provider is supported
 */
export function isProviderSupported(provider: ProviderType): boolean {
	return (
		provider === 'anthropic' ||
		provider === 'openai' ||
		provider === 'google' ||
		provider === 'fireworks' ||
		provider === 'openrouter' ||
		provider === 'together' ||
		provider === 'groq' ||
		provider === 'replicate' ||
		provider === 'venice'
	);
}

/**
 * Assert that a provider is supported, throwing if not.
 *
 * @param provider - The provider type to check
 * @throws Error if the provider is not supported
 */
export function assertProviderSupported(provider: ProviderType): void {
	if (!isProviderSupported(provider)) {
		throw new Error(`Provider '${provider}' not implemented.`);
	}
}

