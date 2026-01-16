/**
 * Model Parameters Configuration
 *
 * Provides helper functions to fetch model-specific parameters from the database.
 * Parameters vary by use case (conversation vs artisan_cut).
 */

import { supabaseAdmin } from '$lib/supabase-admin';

/**
 * Model parameters returned from database
 */
export interface ModelParams {
	temperature: number;
	max_tokens: number;
	thinking_enabled: boolean;
	max_tokens_thinking: number | null;
}

/**
 * Use case for model parameters
 */
export type ModelUseCase = 'conversation' | 'artisan_cut';

/**
 * Fetch model parameters from database for specific use case
 *
 * @param modelIdentifier - Model identifier (e.g., 'claude-sonnet-4-5-20250929')
 * @param useCase - Use case ('conversation' for Call 1A/1B, 'artisan_cut' for Call 2A/2B/3A/3B)
 * @returns Model parameters (temperature, max_tokens, thinking_enabled, max_tokens_thinking)
 * @throws Error if parameters not found
 */
export async function getModelParams(
	modelIdentifier: string,
	useCase: ModelUseCase
): Promise<ModelParams> {
	const { data, error } = await supabaseAdmin
		.from('model_parameters')
		.select('temperature, max_tokens, thinking_enabled, max_tokens_thinking')
		.eq('model_identifier', modelIdentifier)
		.eq('use_case', useCase)
		.single();

	if (error) {
		throw new Error(
			`Failed to fetch model parameters for ${modelIdentifier} (${useCase}): ${error.message}`
		);
	}

	if (!data) {
		throw new Error(
			`No model parameters found for ${modelIdentifier} (${useCase}). Please add parameters to model_parameters table.`
		);
	}

	return data;
}

/**
 * Get max_tokens value based on thinking_enabled flag
 *
 * Helper to select between standard max_tokens and max_tokens_thinking.
 *
 * @param params - Model parameters from getModelParams()
 * @returns Appropriate max_tokens value
 */
export function getMaxTokens(params: ModelParams): number {
	return params.thinking_enabled && params.max_tokens_thinking
		? params.max_tokens_thinking
		: params.max_tokens;
}
