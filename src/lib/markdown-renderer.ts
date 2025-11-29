import { marked } from 'marked';
import { CHAT_ACCENT, READER_ACCENT } from '$lib/config/colors';

export type RenderMode = 'chat' | 'reader';

/**
 * Strip all emoji characters from text.
 * Uses Unicode Extended_Pictographic property to match emoji.
 */
function stripEmoji(text: string): string {
	return text.replace(/\p{Extended_Pictographic}/gu, '');
}

/**
 * Replace em dashes with en dashes, ensuring single space on each side.
 * Em dash: — (U+2014)
 * En dash: – (U+2013)
 */
function normalizeEmDashes(text: string): string {
	// Replace em dash with en dash, handling spaces carefully
	// \s* matches zero or more spaces on each side, then we add exactly one space
	return text.replace(/\s*—\s*/g, ' – ');
}

/**
 * Remove horizontal rules (---) and collapse the extra blank line.
 * Horizontal rules cause flickering during auto-scroll due to sub-pixel rendering.
 * Pattern: blank line + --- + newline → single newline
 */
function removeHorizontalRules(text: string): string {
	return text.replace(/\n\n---\n/g, '\n');
}

/**
 * Strip markdown pipe tables from text.
 * Tables are extracted and rendered to canvas separately.
 * Matches: | Header | Header |
 *          |--------|--------|
 *          | Cell   | Cell   |
 */
function stripMarkdownTables(text: string): string {
	const tableRegex = /^(\|[^\n]+\|)\s*\n(\|[-:\s|]+\|)\s*\n((?:\|[^\n]+\|\s*\n?)+)/gm;
	return text.replace(tableRegex, '').trim();
}

/**
 * Custom markdown renderer with accent color styling.
 *
 * Pre-processing:
 * - Emoji stripped (all Extended_Pictographic characters removed)
 * - Markdown tables stripped (rendered to canvas separately)
 * - Horizontal rules (---) removed (cause flickering during auto-scroll)
 * - Em dashes (—) normalized to en dashes (–) with spaces
 *
 * Transformations:
 * 1. Headings (# ## ###) → Accent bold (all levels identical)
 * 2. Bold (**text**) → Plain text (styling stripped)
 * 3. Italic (*text*) → Plain text (styling stripped)
 * 4. All lists → Solid circle (●) in accent color (numbered lists become bullets)
 *
 * Spacing Rules:
 * - One line space after paragraphs (1.6em)
 * - One line space before section headers
 * - breaks: true preserves single newlines as <br>
 */
export function renderMarkdown(markdown: string, mode: RenderMode = 'chat'): string {
	const ACCENT_COLOR = mode === 'chat' ? CHAT_ACCENT : READER_ACCENT;

	// Pre-process: strip emoji, tables, horizontal rules, normalize em dashes
	const withoutEmoji = stripEmoji(markdown);
	const withoutTables = stripMarkdownTables(withoutEmoji);
	const withoutHr = removeHorizontalRules(withoutTables);
	const normalizedMarkdown = normalizeEmDashes(withoutHr);
	// Configure marked with custom renderer
	const renderer = new marked.Renderer();

	// 1. Headings → Accent Bold (all levels identical)
	// One line space before section header (margin-top), no bottom margin
	renderer.heading = ({ text }) => {
		return `<div style="font-weight: bold; color: ${ACCENT_COLOR}; margin: 1.6em 0 0 0;">${text}</div>`;
	};

	// 2. Horizontal Rules → Removed in pre-processing (cause flickering during auto-scroll)

	// 3. Bold → Strip to plain text
	renderer.strong = ({ text }) => {
		return text;
	};

	// 4. Italic → Strip asterisks, render as plain text
	renderer.em = ({ text }) => {
		return text;
	};

	// Paragraph → One line space after all paragraphs (margin-bottom only)
	renderer.paragraph = ({ text }) => {
		return `<p style="margin: 0 0 1.6em 0; display: block;">${text}</p>`;
	};

	// 5. All lists → Indented accent bullets
	// One line space after lists (margin-bottom only)
	const originalList = renderer.list.bind(renderer);
	renderer.list = (token) => {
		const listHtml = originalList(token);
		// Add custom styling to the list - one line space after
		return listHtml.replace(
			/<(ul|ol)>/,
			'<$1 style="margin: 0 0 1.6em 0; padding: 0 0 0 24px; list-style: none; display: block;">'
		);
	};

	// List items with accent color bullets (all lists become bullet lists)
	// Use parseInline to render bold/italic within list items
	renderer.listitem = (token) => {
		const content = marked.parseInline(token.text);
		// All lists use bullets in accent color (scaled up, vertically centered)
		return `<li style="margin: 0; display: flex; align-items: baseline;"><span style="color: ${ACCENT_COLOR}; margin-right: 8px; flex-shrink: 0; font-size: 1.2em;">\u2022</span><span>${content}</span></li>`;
	};

	// Configure marked options
	marked.setOptions({
		renderer,
		breaks: true, // Convert single line breaks to <br> (preserves Claude's formatting)
		gfm: true, // GitHub Flavored Markdown
	});

	// Parse markdown to HTML
	const rawHtml = marked.parse(normalizedMarkdown) as string;

	// Strip any remaining asterisks that weren't parsed as bold/italic
	const html = rawHtml.replace(/\*/g, '');

	return html;
}
