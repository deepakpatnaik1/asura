export type RenderMode = 'chat' | 'reader';

/**
 * EXPERIMENT: Raw output - no processing
 * Just show the raw markdown as plain text
 */
export async function renderMarkdown(markdown: string, mode: RenderMode = 'chat'): Promise<string> {
	// Em dash (—) → en dash (–) with single space each side
	const processed = markdown.replace(/\s*—\s*/g, ' – ');

	// Escape HTML and convert newlines to <br> for display
	const escaped = processed
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/\n/g, '<br>');
	return `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${escaped}</pre>`;
}
