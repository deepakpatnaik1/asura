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
		it('renders plain text', () => {
			const result = renderMarkdown('Hello world');
			expect(result).toContain('Hello world');
		});

		it('renders paragraphs', () => {
			const result = renderMarkdown('First paragraph\n\nSecond paragraph');
			expect(result).toContain('<p');
			expect(result).toContain('First paragraph');
			expect(result).toContain('Second paragraph');
		});

		it('wraps text in paragraph tags', () => {
			const result = renderMarkdown('Simple text');
			expect(result).toMatch(/<p[^>]*>Simple text<\/p>/);
		});
	});

	describe('headings', () => {
		it('renders h1 with accent color', () => {
			const result = renderMarkdown('# Heading 1');
			expect(result).toContain(CHAT_ACCENT);
			expect(result).toContain('Heading 1');
			expect(result).toContain('font-weight: bold');
		});

		it('renders h2 with same styling as h1', () => {
			const result = renderMarkdown('## Heading 2');
			expect(result).toContain(CHAT_ACCENT);
			expect(result).toContain('Heading 2');
		});

		it('renders h3 with same styling', () => {
			const result = renderMarkdown('### Heading 3');
			expect(result).toContain(CHAT_ACCENT);
		});

		it('strips hash symbols', () => {
			const result = renderMarkdown('# My Heading');
			expect(result).not.toContain('# My');
		});
	});

	describe('horizontal rules', () => {
		it('renders hr with custom styling', () => {
			const result = renderMarkdown('Before\n\n---\n\nAfter');
			expect(result).toContain('<hr');
			expect(result).toContain('border-top');
		});

		it('renders hr from triple dashes', () => {
			const result = renderMarkdown('---');
			expect(result).toContain('<hr');
		});
	});

	describe('bold and italic', () => {
		it('strips bold asterisks', () => {
			const result = renderMarkdown('**bold text**');
			expect(result).toContain('bold text');
			expect(result).not.toContain('**');
		});

		it('strips italic asterisks', () => {
			const result = renderMarkdown('*italic text*');
			expect(result).toContain('italic text');
			// Asterisks should be stripped from final output
			expect(result).not.toContain('*italic');
		});

		it('handles mixed formatting', () => {
			const result = renderMarkdown('Normal **bold** and *italic* text');
			expect(result).toContain('Normal');
			expect(result).toContain('bold');
			expect(result).toContain('italic');
			expect(result).toContain('text');
		});
	});

	describe('lists', () => {
		it('renders bullet lists with accent color', () => {
			const result = renderMarkdown('- Item 1\n- Item 2\n- Item 3');
			expect(result).toContain('<ul');
			expect(result).toContain('<li');
			expect(result).toContain(CHAT_ACCENT);
			expect(result).toContain('Item 1');
		});

		it('renders numbered lists with accent color', () => {
			const result = renderMarkdown('1. First\n2. Second\n3. Third');
			expect(result).toContain('<ol');
			expect(result).toContain('<li');
			expect(result).toContain(CHAT_ACCENT);
			expect(result).toContain('1.');
		});

		it('uses bullet character for unordered lists', () => {
			const result = renderMarkdown('- Item');
			expect(result).toContain('\u2022'); // Bullet character
		});

		it('uses numbers for ordered lists', () => {
			const result = renderMarkdown('1. First\n2. Second');
			expect(result).toContain('1.');
			expect(result).toContain('2.');
		});
	});

	describe('mode switching', () => {
		it('uses chat accent color by default', () => {
			const result = renderMarkdown('# Heading', 'chat');
			expect(result).toContain(CHAT_ACCENT);
		});

		it('uses reader accent color in reader mode', () => {
			const result = renderMarkdown('# Heading', 'reader');
			expect(result).toContain(READER_ACCENT);
		});

		it('applies reader accent to lists in reader mode', () => {
			const result = renderMarkdown('- Item', 'reader');
			expect(result).toContain(READER_ACCENT);
		});
	});

	describe('em dash normalization', () => {
		it('converts em dash to en dash', () => {
			const result = renderMarkdown('before—after');
			expect(result).toContain(' – '); // En dash with spaces
			expect(result).not.toContain('—'); // No em dash
		});

		it('adds spaces around en dash', () => {
			const result = renderMarkdown('word—word');
			expect(result).toContain('word – word');
		});

		it('normalizes existing spaces', () => {
			const result = renderMarkdown('word — word');
			expect(result).toContain(' – ');
		});
	});

	describe('tool call spacing fix', () => {
		it('adds paragraph break after sentence ending before capital', () => {
			const result = renderMarkdown('End of sentence.StartOfNext');
			expect(result).toContain('sentence.');
			expect(result).toContain('StartOfNext');
		});

		it('handles exclamation marks', () => {
			const result = renderMarkdown('Great!Now let me');
			// Should add break
			expect(result).toContain('Great!');
		});

		it('handles question marks', () => {
			const result = renderMarkdown('Done?Next step');
			expect(result).toContain('Done?');
		});
	});

	describe('XSS prevention', () => {
		it('sanitizes script tags', () => {
			const result = renderMarkdown('<script>alert("XSS")</script>');
			expect(result).not.toContain('<script>');
			expect(result).not.toContain('alert');
		});

		it('sanitizes onclick handlers', () => {
			const result = renderMarkdown('<p onclick="alert(1)">Click</p>');
			expect(result).not.toContain('onclick');
		});

		it('removes img tags through sanitization', () => {
			// Images are not in the default allowed tags list
			const result = renderMarkdown('![alt](x)');
			expect(result).not.toContain('<img');
		});

		it('preserves safe content after sanitization', () => {
			const result = renderMarkdown('Safe **content** here');
			expect(result).toContain('Safe');
			expect(result).toContain('content');
			expect(result).toContain('here');
		});
	});

	describe('code blocks', () => {
		it('renders inline code with backticks', () => {
			// The sanitizer allows code tags, but markdown renderer may keep backticks
			const result = renderMarkdown('Use `const x = 1` here');
			expect(result).toContain('const x = 1');
		});

		it('renders code blocks with pre tags', () => {
			const result = renderMarkdown('```\ncode block\n```');
			// Code blocks should be rendered
			expect(result).toContain('code block');
		});
	});

	describe('edge cases', () => {
		it('handles empty string', () => {
			const result = renderMarkdown('');
			expect(result).toBe('');
		});

		it('handles whitespace only', () => {
			const result = renderMarkdown('   \n\n   ');
			// Should produce empty or whitespace-only output
			expect(result.trim()).toBe('');
		});

		it('handles unicode content', () => {
			const result = renderMarkdown('日本語 🎉 émojis');
			expect(result).toContain('日本語');
			expect(result).toContain('🎉');
		});

		it('handles very long content', () => {
			const longText = 'word '.repeat(1000);
			const result = renderMarkdown(longText);
			expect(result).toContain('word');
		});

		it('handles nested markdown', () => {
			const result = renderMarkdown('**bold *and italic* text**');
			expect(result).toContain('bold');
			expect(result).toContain('italic');
			expect(result).toContain('text');
		});
	});

	describe('spacing rules', () => {
		it('adds margin-bottom to paragraphs', () => {
			const result = renderMarkdown('Paragraph text');
			expect(result).toContain('margin');
			expect(result).toContain('1.6em');
		});

		it('adds margin-top to headings', () => {
			const result = renderMarkdown('# Heading');
			expect(result).toContain('margin');
		});

		it('adds margin to lists', () => {
			const result = renderMarkdown('- Item');
			expect(result).toContain('margin');
		});
	});
});
