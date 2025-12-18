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
 *
 * Handles multiple formats:
 * 1. ```tool_intent {...} ``` (canonical)
 * 2. ```json {"tool": ...} ``` (common LLM fallback)
 * 3. ```Tool_Intent {...} ``` (case variations)
 * 4. Inline JSON with "tool" key after tool_intent mention
 */
export function parseToolIntents(response: string): ToolIntent[] {
	const intents: ToolIntent[] = [];

	// Pattern 1: Canonical ```tool_intent ... ``` blocks (case-insensitive)
	const canonicalRegex = /```\s*tool_intent\s*([\s\S]*?)```/gi;
	let match;

	while ((match = canonicalRegex.exec(response)) !== null) {
		const parsed = tryParseIntent(match[1]);
		if (parsed) intents.push(parsed);
	}

	// Pattern 2: ```json blocks containing tool intents
	// Only if we didn't find canonical blocks (avoid double-parsing)
	if (intents.length === 0) {
		const jsonBlockRegex = /```(?:json)?\s*(\{[\s\S]*?"tool"\s*:\s*"[^"]+[\s\S]*?\})\s*```/gi;
		while ((match = jsonBlockRegex.exec(response)) !== null) {
			const parsed = tryParseIntent(match[1]);
			if (parsed) intents.push(parsed);
		}
	}

	return intents;
}

/**
 * Try to parse a JSON string as a tool intent
 */
function tryParseIntent(jsonStr: string): ToolIntent | null {
	try {
		const trimmed = jsonStr.trim();
		const parsed = JSON.parse(trimmed);

		if (parsed.tool && typeof parsed.tool === 'string') {
			return {
				tool: parsed.tool,
				params: parsed.params || {}
			};
		}
	} catch (e) {
		console.warn('[ToolIntentParser] Failed to parse tool_intent block:', e);
	}
	return null;
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
