/**
 * Model Provider Detection
 *
 * Utilities for detecting the provider type from a model identifier.
 */

export type ProviderType = 'anthropic' | 'openai' | 'fireworks';

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
 */
export function getProviderType(modelIdentifier: string): ProviderType {
	if (modelIdentifier.startsWith('claude-')) {
		return 'anthropic';
	}
	if (modelIdentifier.startsWith('gpt-') || modelIdentifier.startsWith('o1-')) {
		return 'openai';
	}
	if (modelIdentifier.startsWith('accounts/fireworks/')) {
		return 'fireworks';
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
	return provider === 'anthropic' || provider === 'fireworks';
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
