/**
 * Prompt Templates
 *
 * Reusable prompt fragments for constructing user messages.
 * These templates accept dynamic values and return formatted strings.
 */

// ============================================================================
// DESCRIBE (Reader: Article Summary)
// ============================================================================

export function describeUserPrompt(articleTitle: string, articleHtml: string): string {
	return `Here is an article titled "${articleTitle}". Please provide an educational summary. Use the web search tool as needed to understand recent context.

<article>
${articleHtml}
</article>`;
}

// ============================================================================
// FOLLOWUP (Reader: Q&A)
// ============================================================================

export function followupArticleContext(
	articleTitle: string,
	articleHtml: string,
	previousSummary: string | null
): string {
	let context = `Here is an article titled "${articleTitle}":\n\n<article>\n${articleHtml}\n</article>`;
	if (previousSummary) {
		context += `\n\nHere is my previous summary of this article:\n\n${previousSummary}`;
	}
	return context;
}

export function followupChartPrefix(chartIndex: number, message: string): string {
	return `[Referring to chart ${chartIndex + 1}] ${message}`;
}

// ============================================================================
// COMPRESS (Chat: Artisan Cut)
// ============================================================================

export function compressUserFormat(userMessage: string, personaName: string, aiResponse: string): string {
	return `User message: ${userMessage}\n\nPersona (${personaName}) response: ${aiResponse}`;
}

// ============================================================================
// CONVERSE (Chat: Main Conversation)
// ============================================================================

export const CONVERSE_CONTEXT_SEPARATOR = '--- CURRENT QUERY ---';

export function converseUserPrompt(context: string, message: string): string {
	return context.length > 0 ? `${context}${CONVERSE_CONTEXT_SEPARATOR}\n${message}` : message;
}
