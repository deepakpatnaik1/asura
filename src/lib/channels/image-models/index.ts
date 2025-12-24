/**
 * Channel: Image Models
 *
 * Used by: Design Lead (Eva)
 *
 * Provides access to:
 * - Character planner models (OpenRouter, Venice)
 * - Image generation models (FAL, Fireworks, Venice, OpenRouter, ModelsLab)
 * - Image editing models (FAL)
 * - Video generation models (pending)
 */

export const CHANNEL_NAME = 'image-models';

// Character planning
export {
	generateCharacterSheet,
	type CharacterSheet,
	type PhysicalAnchors,
	type PlannerApiKeys
} from './planner';

// Image generation
export {
	generateImage,
	type ImageGenParams,
	type ImageGenResult,
	generateWithFal,
	generateWithModelsLab,
	generateWithFireworks,
	generateWithOpenRouter,
	generateWithVenice
} from './generation';

// Image editing
export {
	editImage,
	editWithFal,
	type ImageEditParams,
	type ImageEditResult
} from './editing';

// Video generation (pending)
// export * from './video';
