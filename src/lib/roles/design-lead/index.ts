/**
 * Role: Design Lead (Eva)
 *
 * Responsibilities:
 * - Canvas management (CRUD, elements)
 * - Character planning (character sheets, scenes)
 * - Image generation (standalone, editing)
 *
 * Channels:
 * - Image models (character planner, image gen, image edit, video)
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { PlannerApiKeys } from '$lib/channels/image-models';

// Re-export canvas tools
export {
	CANVAS_TOOLS,
	isCanvasTool,
	executeCanvasTool,
	createEmptyCanvasMutations,
	type CanvasState,
	type CanvasMutations,
	type CanvasToolResult,
	type RenderElement,
	type DesignerCanvas
} from './canvas';

// Re-export character tools
export {
	CHARACTER_TOOLS,
	isCharacterTool,
	executeCharacterTool,
	type CharacterToolContext,
	type CharacterToolResult
} from './character';

// Re-export generation tools
export {
	GENERATION_TOOLS,
	isGenerationTool,
	executeGenerationTool,
	resolveElementCode,
	storeImageToCanvas,
	syncCanvasElementCodes,
	type GenerationToolContext,
	type GenerationToolResult
} from './generation';

export const ROLE_NAME = 'design-lead';

// ============================================================================
// Unified Interface
// ============================================================================

/**
 * All design lead tools combined
 */
import { CANVAS_TOOLS } from './canvas';
import { CHARACTER_TOOLS } from './character';
import { GENERATION_TOOLS } from './generation';

export const DESIGN_TOOLS: Anthropic.Tool[] = [
	...CANVAS_TOOLS,
	...CHARACTER_TOOLS,
	...GENERATION_TOOLS
];

/**
 * Context for design tool execution
 */
export interface DesignToolContext {
	userId: string;
	// Character planning
	characterPlanningModel?: string;
	characterPlanningProvider?: string;
	// Image generation
	imageGenModel?: string;
	imageEditModel?: string;
	// API keys
	apiKeys?: PlannerApiKeys;
}

/**
 * Unified result type
 */
export interface DesignToolResult {
	success: boolean;
	message: string;
	data?: unknown;
	mutations?: import('./canvas').CanvasMutations;
}

/**
 * Check if a tool name is a design lead tool
 */
import { isCanvasTool } from './canvas';
import { isCharacterTool } from './character';
import { isGenerationTool } from './generation';

export function isDesignTool(toolName: string): boolean {
	return isCanvasTool(toolName) || isCharacterTool(toolName) || isGenerationTool(toolName);
}

/**
 * Execute any design lead tool
 */
import { executeCanvasTool } from './canvas';
import { executeCharacterTool } from './character';
import { executeGenerationTool } from './generation';

export async function executeDesignTool(
	toolName: string,
	input: Record<string, unknown>,
	context: DesignToolContext
): Promise<DesignToolResult> {
	const { userId, characterPlanningModel, characterPlanningProvider, imageGenModel, imageEditModel, apiKeys } = context;

	// Canvas tools - only need userId
	if (isCanvasTool(toolName)) {
		return executeCanvasTool(toolName, input, userId);
	}

	// Character tools - need planning + image gen context
	if (isCharacterTool(toolName)) {
		if (!characterPlanningModel) {
			return { success: false, message: 'Character planning model not configured' };
		}
		return executeCharacterTool(toolName, input, {
			userId,
			characterPlanningModel,
			characterPlanningProvider: characterPlanningProvider || 'openrouter',
			imageGenModel: imageGenModel || '',
			apiKeys: apiKeys || {}
		});
	}

	// Generation tools - need image gen context
	if (isGenerationTool(toolName)) {
		return executeGenerationTool(toolName, input, {
			userId,
			imageGenModel: imageGenModel || '',
			imageEditModel
		});
	}

	return { success: false, message: `Unknown design tool: ${toolName}` };
}
