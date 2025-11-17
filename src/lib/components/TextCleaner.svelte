<script lang="ts">
	let { content = '' } = $props();

	let renderedHtml = $state('');

	function processText(text: string): string {
		let cleaned = text;

		// Step 1: Convert number emojis to actual numbers with dots (for numbered lists)
		const numberEmojiMap: { [key: string]: string } = {
			'0️⃣': '0.',
			'1️⃣': '1.',
			'2️⃣': '2.',
			'3️⃣': '3.',
			'4️⃣': '4.',
			'5️⃣': '5.',
			'6️⃣': '6.',
			'7️⃣': '7.',
			'8️⃣': '8.',
			'9️⃣': '9.',
			'🔟': '10.'
		};
		Object.keys(numberEmojiMap).forEach(emoji => {
			cleaned = cleaned.replace(new RegExp(emoji, 'g'), numberEmojiMap[emoji]);
		});

		// Step 2: Remove all other emojis
		cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}\u{1F191}-\u{1F251}\u{1F004}\u{1F0CF}\u{1F170}-\u{1F171}\u{1F17E}-\u{1F17F}\u{1F18E}\u{3030}\u{2B50}\u{2B55}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2B1B}-\u{2B1C}\u{3297}\u{3299}\u{303D}\u{00A9}\u{00AE}\u{2122}\u{23F0}-\u{23F3}\u{23E9}-\u{23EF}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{2702}\u{2705}\u{2708}-\u{270D}\u{270F}\u{2712}\u{2714}\u{2716}\u{271D}\u{2721}\u{2728}\u{2733}-\u{2734}\u{2744}\u{2747}\u{274C}\u{274E}\u{2753}-\u{2755}\u{2757}\u{2763}-\u{2764}\u{2795}-\u{2797}\u{27A1}\u{27B0}\u{27BF}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2B1B}-\u{2B1C}\u{2B50}\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}]/gu, '');

		// Step 2: Convert em dash to en dash with spaces
		cleaned = cleaned.replace(/—/g, ' – ');

		// Step 3: Remove horizontal rules (standalone --- lines)
		cleaned = cleaned.replace(/^\s*---\s*$/gm, '');

		// Step 4: Remove markdown hard line breaks (two spaces at end of line)
		cleaned = cleaned.replace(/  \n/g, '\n');

		// Step 5: Protect bullet lines before stripping asterisks
		const bulletPattern = /^\s*[\*\-]\s+(.+)$/gm;
		const bullets: string[] = [];
		cleaned = cleaned.replace(bulletPattern, (match, content) => {
			const cleanContent = content.replace(/\*/g, '');
			bullets.push(match.replace(content, cleanContent));
			return `__BULLET_${bullets.length - 1}__`;
		});

		// Step 6: Strip all asterisks
		cleaned = cleaned.replace(/\*/g, '');

		// Step 7: Restore bullets
		bullets.forEach((bullet, index) => {
			cleaned = cleaned.replace(`__BULLET_${index}__`, bullet);
		});

		// Step 8: Convert markdown bullets and numbered lists to HTML
		const lines = cleaned.split('\n');
		let html = '';
		let inBulletList = false;
		let inNumberedList = false;

		// Helper function to determine if a line should be treated as a bullet
		function isBullet(line: string, lineIndex: number): boolean {
			const bulletMatch = line.match(/^(\s*)([\*\-])\s+(.+)$/);
			if (!bulletMatch) return false;

			const content = bulletMatch[3].trim();

			// Don't treat as bullet if line ends with a colon (section header)
			if (content.endsWith(':')) return false;

			// Don't treat as bullet if line ends with a question mark (section header)
			if (content.endsWith('?')) return false;

			// Don't treat as bullet if line ends with an exclamation mark (section header)
			if (content.endsWith('!')) return false;

			// Don't treat as bullet if line has no punctuation at all (section header)
			const hasPunctuation = /[.,;:!?]/.test(content);
			if (!hasPunctuation) return false;

			// Don't treat as bullet if it's the first line after a section header
			// (these are sub-headers, not bullets)
			if (lineIndex > 0) {
				const prevLine = lines[lineIndex - 1].trim();
				// Check if previous line was a section header (ends with colon, not a bullet)
				if (prevLine.endsWith(':') && !prevLine.match(/^(\s*)([\*\-])\s+/)) {
					return false;
				}
			}

			return true;
		}

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const bulletMatch = line.match(/^(\s*)([\*\-])\s+(.+)$/);
			const numberMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);

			if (bulletMatch && isBullet(line, i)) {
				const content = bulletMatch[3];
				if (inNumberedList) {
					html += '</ol>';
					inNumberedList = false;
				}
				if (!inBulletList) {
					html += '<ul>';
					inBulletList = true;
				}
				html += `<li>${content}</li>`;
			} else if (numberMatch) {
				const content = numberMatch[3];
				if (inBulletList) {
					html += '</ul>';
					inBulletList = false;
				}
				if (!inNumberedList) {
					html += '<ol>';
					inNumberedList = true;
				}
				html += `<li>${content}</li>`;
			} else {
				if (inBulletList) {
					html += '</ul>';
					inBulletList = false;
				}
				if (inNumberedList) {
					html += '</ol>';
					inNumberedList = false;
				}

				// Strip bullet markers from section headers (lines starting with - or * but not bullets)
				let outputLine = line;
				if (bulletMatch && !isBullet(line, i)) {
					// This is a section header with a bullet marker - strip it
					outputLine = bulletMatch[3];
				}

				// Strip markdown heading markers (###, ##, #)
				outputLine = outputLine.replace(/^#{1,6}\s+/, '');

				html += outputLine + '\n';
			}
		}

		if (inBulletList) {
			html += '</ul>';
		}
		if (inNumberedList) {
			html += '</ol>';
		}

		return html;
	}

	$effect(() => {
		renderedHtml = processText(content);
	});
</script>

<div class="cleaned-text">
	{@html renderedHtml}
</div>

<style>
	.cleaned-text {
		white-space: pre-wrap;
		line-height: 1.6;
	}

	.cleaned-text :global(ul) {
		list-style-type: disc;
		margin-left: 1.5em;
		margin-top: 0;
		margin-bottom: 0;
		padding-left: 0;
	}

	.cleaned-text :global(ol) {
		list-style-type: decimal;
		margin-left: 1.5em;
		margin-top: 0;
		margin-bottom: 0;
		padding-left: 0;
	}

	.cleaned-text :global(li::marker) {
		color: var(--boss-accent);
	}

	.cleaned-text :global(li) {
		color: inherit;
		padding-left: 0.5em;
		margin-top: 0;
		margin-bottom: 0;
	}
</style>
