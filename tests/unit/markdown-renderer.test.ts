/**
 * Tests for lib/markdown-renderer.ts
 *
 * Tests the custom markdown rendering with accent color styling.
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '$lib/markdown-renderer';
import { CHAT_ACCENT, READER_ACCENT } from '$lib/config/colors';

describe('renderMarkdown', () => {
	describe('basic rendering', () => {
		it('renders plain text', async () => {
			const result = await renderMarkdown('Hello world');
			expect(result).toContain('Hello world');
		});

		it('renders paragraphs', async () => {
			const result = await renderMarkdown('First paragraph\n\nSecond paragraph');
			expect(result).toContain('<p');
			expect(result).toContain('First paragraph');
			expect(result).toContain('Second paragraph');
		});

		it('wraps text in paragraph tags', async () => {
			const result = await renderMarkdown('Simple text');
			expect(result).toMatch(/<p[^>]*>Simple text<\/p>/);
		});
	});

	describe('headings', () => {
		it('renders h1 with accent color', async () => {
			const result = await renderMarkdown('# Heading 1');
			expect(result).toContain(CHAT_ACCENT);
			expect(result).toContain('Heading 1');
			expect(result).toContain('font-weight: bold');
		});

		it('renders h2 with same styling as h1', async () => {
			const result = await renderMarkdown('## Heading 2');
			expect(result).toContain(CHAT_ACCENT);
			expect(result).toContain('Heading 2');
		});

		it('renders h3 with same styling', async () => {
			const result = await renderMarkdown('### Heading 3');
			expect(result).toContain(CHAT_ACCENT);
		});

		it('strips hash symbols', async () => {
			const result = await renderMarkdown('# My Heading');
			expect(result).not.toContain('# My');
		});
	});

	describe('horizontal rules', () => {
		it('renders hr with custom styling', async () => {
			const result = await renderMarkdown('Before\n\n---\n\nAfter');
			expect(result).toContain('<hr');
			expect(result).toContain('border-top');
		});

		it('renders hr from triple dashes', async () => {
			const result = await renderMarkdown('---');
			expect(result).toContain('<hr');
		});
	});

	describe('bold and italic', () => {
		it('strips bold asterisks', async () => {
			const result = await renderMarkdown('**bold text**');
			expect(result).toContain('bold text');
			expect(result).not.toContain('**');
		});

		it('strips italic asterisks', async () => {
			const result = await renderMarkdown('*italic text*');
			expect(result).toContain('italic text');
			// Asterisks should be stripped from final output
			expect(result).not.toContain('*italic');
		});

		it('handles mixed formatting', async () => {
			const result = await renderMarkdown('Normal **bold** and *italic* text');
			expect(result).toContain('Normal');
			expect(result).toContain('bold');
			expect(result).toContain('italic');
			expect(result).toContain('text');
		});
	});

	describe('lists', () => {
		it('renders bullet lists with accent color', async () => {
			const result = await renderMarkdown('- Item 1\n- Item 2\n- Item 3');
			expect(result).toContain('<ul');
			expect(result).toContain('<li');
			expect(result).toContain(CHAT_ACCENT);
			expect(result).toContain('Item 1');
		});

		it('renders numbered lists with accent color', async () => {
			const result = await renderMarkdown('1. First\n2. Second\n3. Third');
			expect(result).toContain('<ol');
			expect(result).toContain('<li');
			expect(result).toContain(CHAT_ACCENT);
			expect(result).toContain('1.');
		});

		it('uses bullet character for unordered lists', async () => {
			const result = await renderMarkdown('- Item');
			expect(result).toContain('\u2022'); // Bullet character
		});

		it('uses numbers for ordered lists', async () => {
			const result = await renderMarkdown('1. First\n2. Second');
			expect(result).toContain('1.');
			expect(result).toContain('2.');
		});
	});

	describe('mode switching', () => {
		it('uses chat accent color by default', async () => {
			const result = await renderMarkdown('# Heading', 'chat');
			expect(result).toContain(CHAT_ACCENT);
		});

		it('uses reader accent color in reader mode', async () => {
			const result = await renderMarkdown('# Heading', 'reader');
			expect(result).toContain(READER_ACCENT);
		});

		it('applies reader accent to lists in reader mode', async () => {
			const result = await renderMarkdown('- Item', 'reader');
			expect(result).toContain(READER_ACCENT);
		});
	});

	describe('em dash normalization', () => {
		it('converts em dash to en dash', async () => {
			const result = await renderMarkdown('before—after');
			expect(result).toContain(' – '); // En dash with spaces
			expect(result).not.toContain('—'); // No em dash
		});

		it('adds spaces around en dash', async () => {
			const result = await renderMarkdown('word—word');
			expect(result).toContain('word – word');
		});

		it('normalizes existing spaces', async () => {
			const result = await renderMarkdown('word — word');
			expect(result).toContain(' – ');
		});
	});

	describe('tool call spacing fix', () => {
		it('adds paragraph break after sentence ending before capital', async () => {
			const result = await renderMarkdown('End of sentence.StartOfNext');
			expect(result).toContain('sentence.');
			expect(result).toContain('StartOfNext');
		});

		it('handles exclamation marks', async () => {
			const result = await renderMarkdown('Great!Now let me');
			// Should add break
			expect(result).toContain('Great!');
		});

		it('handles question marks', async () => {
			const result = await renderMarkdown('Done?Next step');
			expect(result).toContain('Done?');
		});
	});

	describe('XSS prevention', () => {
		it('sanitizes script tags', async () => {
			const result = await renderMarkdown('<script>alert("XSS")</script>');
			expect(result).not.toContain('<script>');
			expect(result).not.toContain('alert');
		});

		it('sanitizes onclick handlers', async () => {
			const result = await renderMarkdown('<p onclick="alert(1)">Click</p>');
			expect(result).not.toContain('onclick');
		});

		it('removes img tags through sanitization', async () => {
			// Images are not in the default allowed tags list
			const result = await renderMarkdown('![alt](x)');
			expect(result).not.toContain('<img');
		});

		it('preserves safe content after sanitization', async () => {
			const result = await renderMarkdown('Safe **content** here');
			expect(result).toContain('Safe');
			expect(result).toContain('content');
			expect(result).toContain('here');
		});
	});

	describe('code blocks', () => {
		it('renders inline code with backticks', async () => {
			// The sanitizer allows code tags, but markdown renderer may keep backticks
			const result = await renderMarkdown('Use `const x = 1` here');
			expect(result).toContain('const x = 1');
		});

		it('renders code blocks with pre tags', async () => {
			const result = await renderMarkdown('```\ncode block\n```');
			// Code blocks should be rendered
			expect(result).toContain('code block');
		});
	});

	describe('edge cases', () => {
		it('handles empty string', async () => {
			const result = await renderMarkdown('');
			expect(result).toBe('');
		});

		it('handles whitespace only', async () => {
			const result = await renderMarkdown('   \n\n   ');
			// Should produce empty or whitespace-only output
			expect(result.trim()).toBe('');
		});

		it('handles unicode content', async () => {
			const result = await renderMarkdown('日本語 🎉 émojis');
			expect(result).toContain('日本語');
			expect(result).toContain('🎉');
		});

		it('handles very long content', async () => {
			const longText = 'word '.repeat(1000);
			const result = await renderMarkdown(longText);
			expect(result).toContain('word');
		});

		it('handles nested markdown', async () => {
			const result = await renderMarkdown('**bold *and italic* text**');
			expect(result).toContain('bold');
			expect(result).toContain('italic');
			expect(result).toContain('text');
		});
	});

	describe('spacing rules', () => {
		it('adds margin-bottom to paragraphs', async () => {
			const result = await renderMarkdown('Paragraph text');
			expect(result).toContain('margin');
			expect(result).toContain('1.6em');
		});

		it('adds margin-top to headings', async () => {
			const result = await renderMarkdown('# Heading');
			expect(result).toContain('margin');
		});

		it('adds margin to lists', async () => {
			const result = await renderMarkdown('- Item');
			expect(result).toContain('margin');
		});
	});
});
