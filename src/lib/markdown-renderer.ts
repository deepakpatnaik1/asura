import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

// Accent colors for different modes
const ACCENT_COLORS = {
	chat: 'rgb(217, 133, 107)',     // Orange/salmon for chat mode
	reader: 'rgb(52, 211, 153)'     // Emerald green for reader mode
};
const DIVIDER_COLOR = 'rgb(156, 163, 175)'; // Grey for horizontal rules (matches Gunnar border)

export type RenderMode = 'chat' | 'reader';

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
 * Custom markdown renderer with accent color styling.
 *
 * Transformations:
 * 1. Headings (# ## ###) → Accent bold (hashes stripped)
 * 2. Horizontal rules (---) → Thin grey divider
 * 3. Bold (**text**) → Accent color (bold stripped, NOT bold)
 * 4. Italic (*text*) → Accent italic
 * 5. Bullet lists → Indented accent bullets
 * 6. Numbered lists → Indented accent numbers
 *
 * Spacing Rules:
 * - One line space after paragraphs
 * - One line space before section headers
 * - Maximum one line space between any two elements
 */
export function renderMarkdown(markdown: string, mode: RenderMode = 'chat'): string {
	const ACCENT_COLOR = ACCENT_COLORS[mode];

	// Normalize em dashes to en dashes with spaces
	const normalizedMarkdown = normalizeEmDashes(markdown);
	// Configure marked with custom renderer
	const renderer = new marked.Renderer();

	// Track list context for proper numbering
	let isOrderedList = false;
	let listItemIndex = 0;

	// 1. Headings → Accent Bold (all levels identical)
	// One line space before section header (margin-top), no bottom margin
	renderer.heading = ({ text }) => {
		return `<div style="font-weight: bold; color: ${ACCENT_COLOR}; margin: 1.6em 0 0 0;">${text}</div>`;
	};

	// 2. Horizontal Rules → Thin grey divider (matches Gunnar border)
	// Rule 3: One line space before and after horizontal rule
	renderer.hr = () => {
		return `<hr style="border: none; border-top: 0.5px solid ${DIVIDER_COLOR}; margin: 1.6em 0;" />`;
	};

	// 3. Bold → Strip asterisks, render as plain text
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

	// 5. Bullet lists → Indented accent bullets
	// 6. Numbered lists → Indented accent numbers
	// One line space after lists (margin-bottom only)
	const originalList = renderer.list.bind(renderer);
	renderer.list = (token) => {
		isOrderedList = token.ordered;
		listItemIndex = 0;
		const listHtml = originalList(token);
		// Add custom styling to the list - one line space after
		return listHtml.replace(
			/<(ul|ol)>/,
			'<$1 style="margin: 0 0 1.6em 0; padding: 0 0 0 24px; list-style: none; display: block;">'
		);
	};

	// List items with accent color markers (bullet or number)
	renderer.listitem = (token) => {
		const text = token.text;
		if (isOrderedList) {
			// Numbered list: number in accent color
			listItemIndex++;
			return `<li style="margin: 0; display: flex;"><span style="color: ${ACCENT_COLOR}; margin-right: 8px; flex-shrink: 0;">${listItemIndex}.</span><span>${text}</span></li>`;
		} else {
			// Bullet list: bullet in accent color
			return `<li style="margin: 0; display: flex;"><span style="color: ${ACCENT_COLOR}; margin-right: 8px; flex-shrink: 0;">\u2022</span><span>${text}</span></li>`;
		}
	};

	// Configure marked options
	marked.setOptions({
		renderer,
		breaks: false, // Don't convert line breaks to <br>
		gfm: true, // GitHub Flavored Markdown
	});

	// Parse markdown to HTML
	const rawHtml = marked.parse(normalizedMarkdown) as string;

	// Sanitize HTML to prevent XSS
	const cleanHtml = DOMPurify.sanitize(rawHtml, {
		ALLOWED_TAGS: [
			'p',
			'br',
			'span',
			'div',
			'ul',
			'ol',
			'li',
			'hr',
			'strong',
			'em',
			'code',
			'pre',
		],
		ALLOWED_ATTR: ['style'],
	});

	// Strip any remaining asterisks from the final HTML
	const finalHtml = cleanHtml.replace(/\*/g, '');

	return finalHtml;
}
