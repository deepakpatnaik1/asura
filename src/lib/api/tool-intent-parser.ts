/**
 * Tool Intent Parser
 *
 * Parses tool_intent JSON blocks from AI responses when the model
 * doesn't support native tool calling.
 *
 * Format expected:
 * ```tool_intent
 * {
 *   "tool": "tool_name",
 *   "params": { ... }
 * }
 * ```
 */

export interface ToolIntent {
	tool: string;
	params: Record<string, unknown>;
}

/**
 * Parse all tool_intent blocks from a response
 */
export function parseToolIntents(response: string): ToolIntent[] {
	const intents: ToolIntent[] = [];

	// Match ```tool_intent ... ``` blocks
	const regex = /```tool_intent\s*([\s\S]*?)```/g;
	let match;

	while ((match = regex.exec(response)) !== null) {
		try {
			const jsonStr = match[1].trim();
			const parsed = JSON.parse(jsonStr);

			if (parsed.tool && typeof parsed.tool === 'string') {
				intents.push({
					tool: parsed.tool,
					params: parsed.params || {}
				});
			}
		} catch (e) {
			// Skip malformed JSON blocks
			console.warn('[ToolIntentParser] Failed to parse tool_intent block:', e);
		}
	}

	return intents;
}

/**
 * Remove tool_intent blocks from response for clean display
 */
export function stripToolIntents(response: string): string {
	return response.replace(/```tool_intent\s*[\s\S]*?```/g, '').trim();
}

/**
 * Check if response contains any tool intents
 */
export function hasToolIntents(response: string): boolean {
	return /```tool_intent\s*[\s\S]*?```/.test(response);
}
