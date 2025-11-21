import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

// Accent color from send button border (--boss-accent in app.css)
const ACCENT_COLOR = 'rgb(217, 133, 107)';
const DIVIDER_COLOR = 'rgb(156, 163, 175)'; // Grey for horizontal rules (matches Gunnar border)

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
 */
export function renderMarkdown(markdown: string): string {
	// Configure marked with custom renderer
	const renderer = new marked.Renderer();

	// Track list context for proper numbering
	let isOrderedList = false;
	let listItemIndex = 0;

	// 1. Headings → Accent Bold (all levels identical)
	renderer.heading = ({ text }) => {
		return `<div style="font-weight: bold; color: ${ACCENT_COLOR}; margin: 0;">${text}</div>`;
	};

	// 2. Horizontal Rules → Thin grey divider (matches Gunnar border)
	renderer.hr = () => {
		return `<hr style="border: none; border-top: 0.5px solid ${DIVIDER_COLOR}; margin: 0;" />`;
	};

	// 3. Bold → Strip asterisks, render as plain text
	renderer.strong = ({ text }) => {
		return text;
	};

	// 4. Italic → Strip asterisks, render as plain text
	renderer.em = ({ text }) => {
		return text;
	};

	// Paragraph → No spacing
	renderer.paragraph = ({ text }) => {
		return `<p style="margin: 0; display: block;">${text}</p>`;
	};

	// 5. Bullet lists → Indented accent bullets
	// 6. Numbered lists → Indented accent numbers
	const originalList = renderer.list.bind(renderer);
	renderer.list = (token) => {
		isOrderedList = token.ordered;
		listItemIndex = 0;
		const listHtml = originalList(token);
		// Add custom styling to the list - no margins, display block
		return listHtml.replace(
			/<(ul|ol)>/,
			'<$1 style="margin: 0; padding: 0 0 0 24px; list-style: none; display: block;">'
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
	const rawHtml = marked.parse(markdown) as string;

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
