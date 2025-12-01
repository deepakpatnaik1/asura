/**
 * Modes Index
 *
 * Central export for mode system.
 */

// Types
export type { ModeConfig, ModeCapabilities } from './types';

// Mode configurations
export { CHAT_MODE } from './chat';

// Registry
export {
	MODES,
	MODE_BY_ID,
	MODE_BY_ROUTE,
	getModeById,
	getModeByRoute,
	modeSupportsPersona,
	modeHasCapability,
	getModeIds,
	getModeRoutes
} from './registry';
