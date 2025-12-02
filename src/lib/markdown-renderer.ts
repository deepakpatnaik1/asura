import { CHAT_ACCENT, READER_ACCENT } from '$lib/config/colors';

export type RenderMode = 'chat' | 'reader';

/**
 * EXPERIMENT: Raw output with selective formatting
 */
export async function renderMarkdown(markdown: string, mode: RenderMode = 'chat'): Promise<string> {
	const ACCENT = mode === 'chat' ? CHAT_ACCENT : READER_ACCENT;

	// Em dash (—) → en dash (–) with single space each side
	let processed = markdown.replace(/\s*—\s*/g, ' – ');

	// Track indentation for continuation lines
	let listIndent = 0;

	// Process line by line with state tracking
	const lines = processed.split('\n');
	const results: string[] = [];

	for (const line of lines) {
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
			listIndent = 0; // Reset - not a list item
			results.push(`<strong style="color: ${ACCENT};">${content}</strong>`);
			continue;
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
			listIndent = num.length + 2; // "1. " = number + ". "
			results.push(`<span style="display: flex; margin-left: 1.5em;"><span style="color: ${ACCENT}; font-weight: bold; flex-shrink: 0; margin-right: 0.5em;">${num}.</span><span><strong style="color: ${ACCENT};">${boldText}</strong>${rest}</span></span>`);
			continue;
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
			listIndent = 2; // "- " = 2 chars
			results.push(`<span style="display: flex; margin-left: 1.5em;"><span style="color: ${ACCENT}; flex-shrink: 0; margin-right: 0.5em;">◦</span><span><strong style="color: ${ACCENT};">${boldText}</strong>${rest}</span></span>`);
			continue;
		}

		// Standalone italic line (action beats) → accent colored italic
		const italicMatch = line.match(/^\*([^*]+)\*$/);
		if (italicMatch) {
			const content = italicMatch[1]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			listIndent = 0; // Reset - not a list item
			results.push(`<em style="color: ${ACCENT};">${content}</em>`);
			continue;
		}

		// Sub-bullet (indented) → accent only, no bold
		const subBulletMatch = line.match(/^(\s+)-\s(.*)$/);
		if (subBulletMatch) {
			const indent = subBulletMatch[1];
			let rest = subBulletMatch[2]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			rest = rest.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
			rest = rest.replace(/\*([^*]+)\*/g, '<em>$1</em>');
			listIndent = indent.length + 2; // existing indent + "- "
			results.push(`<span style="display: flex; margin-left: 3em;"><span style="color: ${ACCENT}; flex-shrink: 0; margin-right: 0.5em;">◦</span><span>${rest}</span></span>`);
			continue;
		}

		// Sub-numbered (indented) → accent only, no bold
		const subNumberMatch = line.match(/^(\s+)(\d+)\.\s(.*)$/);
		if (subNumberMatch) {
			const indent = subNumberMatch[1];
			const num = subNumberMatch[2];
			let rest = subNumberMatch[3]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			rest = rest.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
			rest = rest.replace(/\*([^*]+)\*/g, '<em>$1</em>');
			listIndent = indent.length + num.length + 2; // existing indent + number + ". "
			results.push(`<span style="display: flex; margin-left: 3em;"><span style="color: ${ACCENT}; flex-shrink: 0; margin-right: 0.5em;">${num}.</span><span>${rest}</span></span>`);
			continue;
		}

		// Top-level bullet → bold + accent
		const bulletMatch = line.match(/^-\s(.*)$/);
		if (bulletMatch) {
			let rest = bulletMatch[1]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			rest = rest.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
			rest = rest.replace(/\*([^*]+)\*/g, '<em>$1</em>');
			listIndent = 2; // "- " = 2 chars
			results.push(`<span style="display: flex; margin-left: 1.5em;"><span style="color: ${ACCENT}; font-weight: bold; flex-shrink: 0; margin-right: 0.5em;">◦</span><span>${rest}</span></span>`);
			continue;
		}

		// Top-level numbered list → bold + accent
		const numberMatch = line.match(/^(\d+)\.\s(.*)$/);
		if (numberMatch) {
			const num = numberMatch[1];
			let rest = numberMatch[2]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			// Inline bold → just bold
			rest = rest.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
			listIndent = num.length + 2; // number + ". "
			results.push(`<span style="display: flex; margin-left: 1.5em;"><span style="color: ${ACCENT}; font-weight: bold; flex-shrink: 0; margin-right: 0.5em;">${num}.</span><span>${rest}</span></span>`);
			continue;
		}

		// Regular line - escape HTML, then handle inline formatting
		let escaped = line
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
		// Inline bold → just bold (must come before italic)
		escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
		// Inline italic → just italic
		escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');

		// If this is a continuation line (non-empty, after a list item), indent it
		if (listIndent > 0 && escaped.trim() !== '') {
			escaped = ' '.repeat(listIndent) + escaped;
		} else if (escaped.trim() === '') {
			// Empty line resets list context
			listIndent = 0;
		}

		results.push(escaped);
	}

	// Wrap each line in a div for consistent line spacing
	processed = results.map(r => `<div style="min-height: 1.6em;">${r}</div>`).join('');

	return `<div style="white-space: pre-wrap; font-family: inherit; margin: 0;">${processed}</div>`;
}
