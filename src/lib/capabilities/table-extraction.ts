/**
 * Table Extraction & Rendering
 *
 * Shared utilities for extracting markdown tables and rendering to SVG.
 * Used by both reader (article tables) and chat (LLM tables) flows.
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'fs';
import { join } from 'path';

// Table styling colors (neutral - works with any persona)
export const TABLE_COLORS = {
	accent: 'rgb(163, 163, 163)',
	accentBg: 'rgba(163, 163, 163, 0.08)',
	background: '#141414',
	foreground: '#e5e5e5',
	border: 'rgba(255, 255, 255, 0.1)'
};

// Load font once at module level
let fontData: ArrayBuffer | null = null;

function loadFont(): ArrayBuffer {
	if (fontData) return fontData;
	const fontPath = join(
		process.cwd(),
		'node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf'
	);
	fontData = readFileSync(fontPath).buffer;
	return fontData;
}

/**
 * Strip emoji characters from text
 */
function stripEmoji(text: string): string {
	return text.replace(/\p{Extended_Pictographic}/gu, '');
}

/**
 * Strip markdown formatting asterisks (bold/italic) but preserve multiplication
 */
function stripFormattingAsterisks(text: string): string {
	let result = text.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
	result = result.replace(/\*\*([^*]+)\*\*/g, '$1');
	result = result.replace(/\*([^*\s][^*]*[^*\s])\*/g, '$1');
	result = result.replace(/\*([^*\s])\*/g, '$1');
	return result;
}

/**
 * Clean cell text: strip emoji and formatting asterisks
 */
function cleanCellText(text: string): string {
	return stripEmoji(stripFormattingAsterisks(text));
}

export interface ParsedTable {
	index: number;
	headers: string[];
	rows: string[][];
	caption?: string;
}

/**
 * Extract caption from text preceding a table match
 * Looks for: markdown heading (##) or the last non-empty line before the table
 */
function extractCaption(text: string, matchIndex: number): string | undefined {
	// Get text before the table
	const textBefore = text.slice(0, matchIndex);
	const lines = textBefore.split('\n');

	let caption: string | undefined;

	// Work backwards to find a caption
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i].trim();

		// Skip empty lines
		if (!line) continue;

		// Found a heading (## Heading or ### Heading)
		const headingMatch = line.match(/^#{1,4}\s+(.+)$/);
		if (headingMatch) {
			caption = headingMatch[1].trim();
			break;
		}

		// Found a line that ends with a colon (likely a caption)
		if (line.endsWith(':')) {
			caption = line.slice(0, -1).trim();
			break;
		}

		// Found a regular non-empty line - use it if it's short enough to be a caption
		if (line.length < 150 && !line.startsWith('|') && !line.startsWith('-')) {
			caption = line;
			break;
		}

		// Stop searching after first meaningful content
		break;
	}

	// Strip markdown formatting from caption
	return caption ? stripFormattingAsterisks(caption) : undefined;
}

/**
 * Extract markdown pipe tables from text
 *
 * Matches:
 * | Header | Header |
 * |--------|--------|
 * | Cell   | Cell   |
 *
 * Also handles tables inside blockquotes by stripping > prefixes first.
 */
export function extractMarkdownTables(text: string, startIndex: number = 0): ParsedTable[] {
	const tables: ParsedTable[] = [];
	const tableRegex = /^(\|[^\n]+\|)\s*\n(\|[-:\s|]+\|)\s*\n((?:\|[^\n]+\|\s*\n?)+)/gm;

	// Pre-process: strip blockquote prefixes so tables inside blockquotes are found
	// This converts "> | Header |" to "| Header |"
	const processedText = text.replace(/^>\s*/gm, '');

	let match;
	let tableIndex = 0;

	while ((match = tableRegex.exec(processedText)) !== null) {
		const headerLine = match[1];
		const dataLines = match[3].trim().split('\n');

		const headers = headerLine
			.split('|')
			.slice(1, -1)
			.map((cell) => cell.trim());

		if (headers.length === 0) continue;

		const rows: string[][] = [];
		for (const line of dataLines) {
			const cells = line
				.split('|')
				.slice(1, -1)
				.map((cell) => cell.trim());
			if (cells.length > 0) {
				rows.push(cells);
			}
		}

		if (rows.length === 0) continue;

		// Extract caption from preceding text (use processed text for consistent indexing)
		const caption = extractCaption(processedText, match.index);

		tables.push({
			index: startIndex + tableIndex + 1,
			headers,
			rows,
			caption
		});
		tableIndex++;
	}

	return tables;
}

/**
 * Strip markdown tables from text, returning cleaned text
 */
export function stripMarkdownTables(text: string): string {
	const tableRegex = /^(\|[^\n]+\|)\s*\n(\|[-:\s|]+\|)\s*\n((?:\|[^\n]+\|\s*\n?)+)/gm;
	return text.replace(tableRegex, '').trim();
}

/**
 * Strip figure_captions block from text (internal metadata, not for display)
 */
export function stripFigureCaptions(text: string): string {
	return text.replace(/<figure_captions>[\s\S]*?<\/figure_captions>/g, '').trim();
}

/**
 * Calculate column widths based on content
 */
function calculateColumnWidths(headers: string[], rows: string[][]): number[] {
	const allRows = [headers, ...rows];
	return headers.map((_, colIdx) => {
		const maxLen = Math.max(...allRows.map((row) => (row[colIdx] || '').length));
		const naturalWidth = maxLen * 8 + 24;
		return Math.max(60, maxLen > 50 ? Math.min(400, naturalWidth) : naturalWidth);
	});
}

/**
 * Build JSX-like structure for satori
 */
function buildTableJsx(headers: string[], rows: string[][]): Record<string, unknown> {
	const colWidths = calculateColumnWidths(headers, rows);
	const totalWidth = colWidths.reduce((sum, w) => sum + w, 0) + 2;

	const headerCells = headers.map((header, idx) => ({
		type: 'div',
		props: {
			style: {
				width: colWidths[idx],
				padding: '8px 12px',
				fontWeight: 600,
				color: TABLE_COLORS.accent,
				backgroundColor: TABLE_COLORS.accentBg,
				borderRight: idx < headers.length - 1 ? `1px solid ${TABLE_COLORS.accent}` : 'none',
				borderBottom: `1px solid ${TABLE_COLORS.accent}`,
				display: 'flex',
				alignItems: 'center'
			},
			children: cleanCellText(header)
		}
	}));

	const dataRows = rows.map((row, rowIdx) => ({
		type: 'div',
		props: {
			style: {
				display: 'flex',
				backgroundColor: rowIdx % 2 === 1 ? 'rgba(255, 255, 255, 0.02)' : 'transparent'
			},
			children: row.map((cell, cellIdx) => ({
				type: 'div',
				props: {
					style: {
						width: colWidths[cellIdx] || 100,
						padding: '8px 12px',
						color: TABLE_COLORS.foreground,
						borderRight:
							cellIdx < headers.length - 1 ? `1px solid ${TABLE_COLORS.border}` : 'none',
						borderBottom:
							rowIdx < rows.length - 1 ? `1px solid ${TABLE_COLORS.border}` : 'none',
						display: 'flex',
						alignItems: 'center'
					},
					children: cleanCellText(cell)
				}
			}))
		}
	}));

	return {
		type: 'div',
		props: {
			style: {
				display: 'flex',
				flexDirection: 'column',
				backgroundColor: TABLE_COLORS.background,
				border: `1px solid ${TABLE_COLORS.accent}`,
				fontFamily: 'Liberation Sans',
				fontSize: 14,
				width: totalWidth
			},
			children: [
				{
					type: 'div',
					props: {
						style: { display: 'flex' },
						children: headerCells
					}
				},
				...dataRows
			]
		}
	};
}

export interface RenderedTable {
	svg: string;
	width: number;
	height: number;
}

/**
 * Render table data to SVG string
 */
export async function renderTableToSvg(
	headers: string[],
	rows: string[][]
): Promise<RenderedTable> {
	const tableJsx = buildTableJsx(headers, rows);
	const colWidths = calculateColumnWidths(headers, rows);
	const width = colWidths.reduce((sum, w) => sum + w, 0) + 4;

	// Calculate height accounting for text wrapping
	// Each character is roughly 8px wide at 14px font size
	const CHAR_WIDTH = 8;
	const LINE_HEIGHT = 20;
	const CELL_PADDING = 16; // 8px top + 8px bottom

	const calculateRowHeight = (row: string[]) => {
		let maxLines = 1;
		row.forEach((cell, idx) => {
			const cellWidth = colWidths[idx] - 24; // subtract horizontal padding
			const textWidth = cell.length * CHAR_WIDTH;
			const lines = Math.ceil(textWidth / cellWidth);
			maxLines = Math.max(maxLines, lines);
		});
		return maxLines * LINE_HEIGHT + CELL_PADDING;
	};

	const headerHeight = calculateRowHeight(headers);
	const rowHeights = rows.map(calculateRowHeight);
	const height = headerHeight + rowHeights.reduce((sum, h) => sum + h, 0) + 4;

	const font = loadFont();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const svg = await satori(tableJsx as any, {
		width,
		height,
		fonts: [
			{
				name: 'Liberation Sans',
				data: font,
				weight: 400,
				style: 'normal'
			}
		]
	});

	return { svg, width, height };
}

/**
 * Convert SVG to PNG buffer (for thumbnails)
 */
export function svgToPng(svg: string, width: number): Buffer {
	const resvg = new Resvg(svg, {
		background: TABLE_COLORS.background,
		fitTo: { mode: 'width', value: width }
	});
	const pngData = resvg.render();
	return Buffer.from(pngData.asPng());
}
