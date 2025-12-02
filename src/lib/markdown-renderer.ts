import { CHAT_ACCENT, READER_ACCENT } from '$lib/config/colors';

export type RenderMode = 'chat' | 'reader';

/**
 * EXPERIMENT: Raw output with selective formatting
 */
export async function renderMarkdown(markdown: string, mode: RenderMode = 'chat'): Promise<string> {
	const ACCENT = mode === 'chat' ? CHAT_ACCENT : READER_ACCENT;

	// Em dash (—) → en dash (–) with single space each side
	let processed = markdown.replace(/\s*—\s*/g, ' – ');

	// Process line by line for standalone italic lines (action beats)
	// Pattern: entire line is *text* → italic in accent color
	processed = processed.split('\n').map(line => {
		const match = line.match(/^\*([^*]+)\*$/);
		if (match) {
			// Standalone italic line → accent colored italic
			const content = match[1]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			return `<em style="color: ${ACCENT};">${content}</em>`;
		}
		// Regular line - escape HTML
		return line
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}).join('<br>');

	return `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${processed}</pre>`;
}
