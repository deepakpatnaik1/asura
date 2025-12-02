import { CHAT_ACCENT, READER_ACCENT } from '$lib/config/colors';

export type RenderMode = 'chat' | 'reader';

/**
 * EXPERIMENT: Raw output with selective formatting
 */
export async function renderMarkdown(markdown: string, mode: RenderMode = 'chat'): Promise<string> {
	const ACCENT = mode === 'chat' ? CHAT_ACCENT : READER_ACCENT;

	// Em dash (—) → en dash (–) with single space each side
	let processed = markdown.replace(/\s*—\s*/g, ' – ');

	// Process line by line
	processed = processed.split('\n').map(line => {
		// Standalone bold line → bold + accent
		// Use .+ to allow asterisks inside (for inline italics like *this*)
		const boldLineMatch = line.match(/^\*\*(.+)\*\*$/);
		if (boldLineMatch) {
			let content = boldLineMatch[1]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			// Handle inline italics within bold heading
			content = content.replace(/\*([^*]+)\*/g, '<em>$1</em>');
			return `<strong style="color: ${ACCENT};">${content}</strong>`;
		}

		// Numbered list with bold first → number + bold in accent
		const numBoldMatch = line.match(/^(\d+)\.\s\*\*([^*]+)\*\*(.*)$/);
		if (numBoldMatch) {
			const num = numBoldMatch[1];
			const boldText = numBoldMatch[2]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			const rest = numBoldMatch[3]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			return `<span style="color: ${ACCENT}; font-weight: bold;">${num}.</span> <strong style="color: ${ACCENT};">${boldText}</strong>${rest}`;
		}

		// Bullet list with bold first → bullet + bold in accent
		const bulletBoldMatch = line.match(/^-\s\*\*([^*]+)\*\*(.*)$/);
		if (bulletBoldMatch) {
			const boldText = bulletBoldMatch[1]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			const rest = bulletBoldMatch[2]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			return `<span style="color: ${ACCENT};">-</span> <strong style="color: ${ACCENT};">${boldText}</strong>${rest}`;
		}

		// Standalone italic line (action beats) → accent colored italic
		const italicMatch = line.match(/^\*([^*]+)\*$/);
		if (italicMatch) {
			const content = italicMatch[1]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			return `<em style="color: ${ACCENT};">${content}</em>`;
		}

		// Numbered list → number in accent color
		const numberMatch = line.match(/^(\d+)\.\s(.*)$/);
		if (numberMatch) {
			const num = numberMatch[1];
			let rest = numberMatch[2]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			// Inline bold → just bold
			rest = rest.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
			return `<span style="color: ${ACCENT}; font-weight: bold;">${num}.</span> ${rest}`;
		}

		// Regular line - escape HTML, then handle inline bold
		let escaped = line
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
		// Inline bold → just bold, no accent
		escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
		return escaped;
	}).join('<br>');

	return `<pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${processed}</pre>`;
}
