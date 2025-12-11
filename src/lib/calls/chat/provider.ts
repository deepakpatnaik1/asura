/**
 * Model Provider Detection & Tool Conversion
 *
 * Utilities for detecting the provider type from a model identifier,
 * and converting tool schemas between Anthropic and OpenAI formats.
 */

import type Anthropic from '@anthropic-ai/sdk';

export type ProviderType = 'anthropic' | 'openai' | 'fireworks' | 'openrouter';

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
 * Detect the provider type from a model identifier.
 *
 * @param modelIdentifier - The model identifier string
 * @returns The provider type
 * @throws Error if the provider cannot be determined
 *
 * @example
 * getProviderType('claude-3-opus-20240229') // 'anthropic'
 * getProviderType('gpt-4-turbo') // 'openai'
 * getProviderType('accounts/fireworks/models/hermes-2-pro-mistral-7b') // 'fireworks'
 * getProviderType('accounts/sentientfoundation-serverless/models/dobby-mini-unhinged-plus-llama-3-1-8b') // 'fireworks'
 * getProviderType('gryphe/mythomax-l2-13b') // 'openrouter'
 */
export function getProviderType(modelIdentifier: string): ProviderType {
	if (modelIdentifier.startsWith('claude-')) {
		return 'anthropic';
	}
	if (modelIdentifier.startsWith('gpt-') || modelIdentifier.startsWith('o1-')) {
		return 'openai';
	}
	// Fireworks uses accounts/xxx/models/yyy format (various account prefixes)
	if (modelIdentifier.startsWith('accounts/')) {
		return 'fireworks';
	}
	// OpenRouter uses format: provider/model-name (contains / but not accounts/)
	if (modelIdentifier.includes('/')) {
		return 'openrouter';
	}
	throw new Error(`Unknown model provider for identifier: ${modelIdentifier}`);
}

/**
 * Check if a provider is currently supported.
 *
 * @param provider - The provider type to check
 * @returns True if the provider is supported
 */
export function isProviderSupported(provider: ProviderType): boolean {
	return provider === 'anthropic' || provider === 'fireworks' || provider === 'openrouter';
}

/**
 * Assert that a provider is supported, throwing if not.
 *
 * @param provider - The provider type to check
 * @throws Error if the provider is not supported
 */
export function assertProviderSupported(provider: ProviderType): void {
	if (!isProviderSupported(provider)) {
		throw new Error(`Provider '${provider}' not implemented. Only 'anthropic' is currently supported.`);
	}
}
