/**
 * Mode Registry
 *
 * Central registry for all application modes.
 * Provides lookup by ID or route, and validation utilities.
 */

import type { ModeConfig } from './types';
import { CHAT_MODE } from './chat';

/**
 * All registered modes
 */
export const MODES: ModeConfig[] = [CHAT_MODE];

/**
 * Mode lookup by ID
 */
export const MODE_BY_ID: Record<string, ModeConfig> = {
	chat: CHAT_MODE
};

/**
 * Mode lookup by route
 */
export const MODE_BY_ROUTE: Record<string, ModeConfig> = {
	'/chat': CHAT_MODE
};

/**
 * Get mode by ID
 *
 * @param id - Mode identifier
 * @returns Mode configuration or undefined
 */
export function getModeById(id: string): ModeConfig | undefined {
	return MODE_BY_ID[id];
}

/**
 * Get mode by route path
 *
 * @param route - Route path (e.g., '/chat')
 * @returns Mode configuration or undefined
 */
export function getModeByRoute(route: string): ModeConfig | undefined {
	return MODE_BY_ROUTE[route];
}

/**
 * Check if a mode supports a specific persona
 *
 * @param modeId - Mode identifier
 * @param personaId - Persona identifier
 * @returns true if the persona is available in this mode
 */
export function modeSupportsPersona(modeId: string, personaId: string): boolean {
	const mode = getModeById(modeId);
	return mode ? mode.personas.includes(personaId) : false;
}

/**
 * Check if a mode has a specific capability enabled
 *
 * @param modeId - Mode identifier
 * @param capability - Capability name
 * @returns true if capability is enabled
 */
export function modeHasCapability(
	modeId: string,
	capability: keyof ModeConfig['capabilities']
): boolean {
	const mode = getModeById(modeId);
	if (!mode) return false;

	const value = mode.capabilities[capability];
	// Handle boolean and string capabilities
	return typeof value === 'boolean' ? value : value !== 'none';
}

/**
 * Get all mode IDs
 */
export function getModeIds(): string[] {
	return MODES.map((m) => m.id);
}

/**
 * Get all mode routes
 */
export function getModeRoutes(): string[] {
	return MODES.map((m) => m.route);
}
