/**
 * Channel: Image Generation
 *
 * Re-exports the provider-agnostic image generation from $lib/calls/image.
 * Supports FAL, Fireworks, Venice, OpenRouter, ModelsLab.
 */

export {
	generateImage,
	type ImageGenParams,
	type ImageGenResult,
	// Individual providers for direct use
	generateWithFal,
	generateWithModelsLab,
	generateWithFireworks,
	generateWithOpenRouter,
	generateWithVenice
} from '$lib/calls/image';
