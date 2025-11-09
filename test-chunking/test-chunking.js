#!/usr/bin/env node

/**
 * Sliding Window Chunking Test with 1A/1B Refinement
 *
 * Processes long documents in overlapping windows to avoid "lost in the middle" problem.
 * Then merges boundaries and applies 1A/1B refinement to the full chunk map.
 */

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY;

if (!FIREWORKS_API_KEY) {
	console.error('❌ FIREWORKS_API_KEY not found');
	process.exit(1);
}

const fireworks = new OpenAI({
	baseURL: 'https://api.fireworks.ai/inference/v1',
	apiKey: FIREWORKS_API_KEY
});

// Configuration
const WINDOW_SIZE = 20000; // characters per window (larger = fewer, bigger chunks)
const OVERLAP = 3000; // character overlap between windows

function createWindows(fileContent) {
	const windows = [];
	let start = 0;

	while (start < fileContent.length) {
		const end = Math.min(start + WINDOW_SIZE, fileContent.length);
		windows.push({
			start,
			end,
			content: fileContent.substring(start, end)
		});

		// Move to next window with overlap
		if (end === fileContent.length) break;
		start = end - OVERLAP;
	}

	return windows;
}

function buildWindowChunkingPrompt(windowContent, windowStart) {
	const charCount = windowContent.length;
	return `Break this ${charCount}-character document section into logical chunks based on natural topic boundaries.

CRITICAL RULES:
1. The LAST chunk's "end" value MUST equal ${charCount}
2. If you see speaker labels (BOSS, EXPERT 1, EXPERT 2, etc.), consider them as potential chunk boundaries
3. Include speaker labels in titles where present (e.g., "EXPERT 2: Market Analysis")
4. Chunk by complete ideas and natural topics, NOT by arbitrary character counts
5. Aim for 6-10 substantial chunks (let content determine size)
6. Chunks should be 1000-4000 characters each (variable based on topic completeness)
7. Every character must be in exactly one chunk
8. No gaps, no overlaps

Return JSON with character offsets starting from 0:
{
  "chunks": [
    {
      "title": "Brief descriptive title",
      "summary": "What this chunk covers",
      "start": 0,
      "end": 2450
    }
  ]
}

Document section:

${windowContent}`;
}

function buildWindowRefinementPrompt(windowContent, windowChunks) {
	const charCount = windowContent.length;
	return `I chunked this ${charCount}-character document section and produced these chunks:

${JSON.stringify(windowChunks, null, 2)}

Review and refine the chunking. You may:
- Adjust boundaries for better topic alignment
- Improve titles and summaries
- Merge or split chunks if needed
- Fix any gaps or overlaps

CRITICAL RULES:
1. The LAST chunk's "end" value MUST equal ${charCount}
2. Every character must be in exactly one chunk
3. No gaps, no overlaps
4. Return the same JSON structure

Return refined JSON:
{
  "chunks": [
    {
      "title": "Descriptive title",
      "summary": "What this covers",
      "start": 0,
      "end": 2450
    }
  ]
}

Original document section:

${windowContent}`;
}

async function makeCall(prompt, model, callName) {
	console.log(`📤 ${callName}...`);

	const startTime = Date.now();

	const stream = await fireworks.chat.completions.create({
		model,
		messages: [{ role: 'user', content: prompt }],
		temperature: 0,
		max_tokens: 100000,
		stop: null, // Remove default stop sequences
		stream: true
	});

	let responseText = '';
	for await (const chunk of stream) {
		const content = chunk.choices[0]?.delta?.content;
		if (content) responseText += content;
	}

	const duration = ((Date.now() - startTime) / 1000).toFixed(2);
	console.log(`✅ ${callName} complete (${duration}s)\n`);

	// Clean response
	responseText = responseText.trim();
	responseText = responseText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

	const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
	if (jsonMatch) responseText = jsonMatch[1];

	try {
		return JSON.parse(responseText);
	} catch (error) {
		console.error(`⚠️  ${callName} JSON parse failed`);
		console.error('Response preview:', responseText.substring(0, 500));
		throw error;
	}
}

function mergeWindowChunks(windowChunks, windows) {
	const allChunks = [];

	windowChunks.forEach((result, windowIndex) => {
		const window = windows[windowIndex];

		if (!result.chunks || !Array.isArray(result.chunks)) {
			console.warn(`⚠️  Window ${windowIndex + 1} has invalid chunks, skipping`);
			return;
		}

		result.chunks.forEach((chunk) => {
			// Convert relative offsets to absolute offsets
			const absoluteChunk = {
				title: chunk.title,
				summary: chunk.summary,
				start: window.start + chunk.start,
				end: window.start + chunk.end,
				windowIndex
			};

			// Only add if not in overlap region with next window
			// (we'll get better boundaries from the window that starts there)
			const nextWindow = windows[windowIndex + 1];
			if (!nextWindow || absoluteChunk.end <= nextWindow.start + OVERLAP / 2) {
				allChunks.push(absoluteChunk);
			}
		});
	});

	// Sort by start position and deduplicate overlaps
	allChunks.sort((a, b) => a.start - b.start);

	// Remove duplicates/overlaps (keep first occurrence)
	const deduplicated = [];
	let lastEnd = 0;

	allChunks.forEach((chunk) => {
		if (chunk.start >= lastEnd) {
			deduplicated.push(chunk);
			lastEnd = chunk.end;
		}
	});

	return deduplicated;
}

function validateChunks(chunks, fileLength) {
	console.log('🔍 Validation\n');

	if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
		console.error('❌ Invalid chunk structure');
		return false;
	}

	const sorted = [...chunks].sort((a, b) => a.start - b.start);

	let totalCovered = 0;
	let gapCount = 0;
	let overlapCount = 0;

	for (let i = 0; i < sorted.length; i++) {
		const chunk = sorted[i];
		const chunkSize = chunk.end - chunk.start;
		totalCovered += chunkSize;

		if (i > 0) {
			const prevEnd = sorted[i - 1].end;
			if (chunk.start > prevEnd + 1) {
				gapCount++;
			} else if (chunk.start < prevEnd) {
				overlapCount++;
			}
		}
	}

	const coverage = ((totalCovered / fileLength) * 100).toFixed(1);
	console.log(`Total chunks: ${chunks.length}`);
	console.log(`Coverage: ${coverage}%`);
	console.log(`First chunk starts at: ${sorted[0].start}`);
	console.log(`Last chunk ends at: ${sorted[sorted.length - 1].end}`);
	console.log(`File length: ${fileLength}`);

	if (gapCount > 0) console.warn(`⚠️  ${gapCount} gaps detected`);
	if (overlapCount > 0) console.warn(`⚠️  ${overlapCount} overlaps detected`);

	console.log('');
	return true;
}

function analyzeChunks(chunks, fileContent) {
	console.log('📊 Chunk Details\n');

	const sorted = [...chunks].sort((a, b) => a.start - b.start);

	sorted.forEach((chunk, i) => {
		const size = chunk.end - chunk.start;
		const preview = fileContent.substring(chunk.start, Math.min(chunk.start + 60, chunk.end));
		const words = Math.round(size / 5);

		console.log(`${i + 1}. ${chunk.title}`);
		console.log(`   ${chunk.summary}`);
		console.log(`   Range: ${chunk.start}-${chunk.end} (~${words} words)`);
		console.log(`   Preview: ${preview.replace(/\n/g, ' ')}...`);
		console.log('');
	});
}

async function main() {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		console.error('Usage: node test-chunking.js <file> [model]');
		console.error('');
		console.error('Examples:');
		console.error('  node test-chunking.js input/doc.md');
		console.error('  node test-chunking.js input/doc.md accounts/fireworks/models/qwen3-235b-a22b');
		process.exit(1);
	}

	const inputPath = args[0];
	const model = args[1] || 'accounts/fireworks/models/qwen3-235b-a22b';

	const fullPath = path.isAbsolute(inputPath)
		? inputPath
		: path.join(process.cwd(), inputPath);

	if (!fs.existsSync(fullPath)) {
		console.error(`❌ File not found: ${inputPath}`);
		process.exit(1);
	}

	console.log(`📄 ${path.basename(inputPath)}`);
	console.log(`🤖 ${model}\n`);

	const fileContent = fs.readFileSync(fullPath, 'utf-8');
	const wordCount = fileContent.split(/\s+/).length;

	console.log(`Words: ${wordCount.toLocaleString()}`);
	console.log(`Characters: ${fileContent.length.toLocaleString()}\n`);

	// Create windows
	const windows = createWindows(fileContent);
	console.log(`📊 Created ${windows.length} windows (${WINDOW_SIZE} chars each, ${OVERLAP} char overlap)\n`);

	// Process each window with 1A/1B pattern
	const windowChunks = [];
	for (let i = 0; i < windows.length; i++) {
		const window = windows[i];

		// Call 1A: Initial chunking
		const call1A = await makeCall(
			buildWindowChunkingPrompt(window.content, window.start),
			model,
			`Window ${i + 1}/${windows.length} - Call 1A`
		);

		// Log 1A coverage
		if (call1A.chunks && call1A.chunks.length > 0) {
			const maxEnd = Math.max(...call1A.chunks.map((c) => c.end));
			const windowSize = window.end - window.start;
			const coverage = ((maxEnd / windowSize) * 100).toFixed(1);
			console.log(`   Call 1A coverage: ${coverage}%`);
		}

		// Call 1B: Refinement
		const call1B = await makeCall(
			buildWindowRefinementPrompt(window.content, call1A.chunks),
			model,
			`Window ${i + 1}/${windows.length} - Call 1B`
		);

		// Log 1B coverage
		if (call1B.chunks && call1B.chunks.length > 0) {
			const maxEnd = Math.max(...call1B.chunks.map((c) => c.end));
			const windowSize = window.end - window.start;
			const coverage = ((maxEnd / windowSize) * 100).toFixed(1);
			console.log(`   Call 1B coverage: ${coverage}%\n`);
		}

		windowChunks.push(call1B);

		// Save individual window results for debugging
		fs.writeFileSync(
			path.join(__dirname, 'output', `debug-window-${i + 1}-1A.json`),
			JSON.stringify({ window: { start: window.start, end: window.end }, result: call1A }, null, 2)
		);
		fs.writeFileSync(
			path.join(__dirname, 'output', `debug-window-${i + 1}-1B.json`),
			JSON.stringify({ window: { start: window.start, end: window.end }, result: call1B }, null, 2)
		);
	}

	// Merge chunks from all windows
	console.log('🔗 Merging chunks from all windows...\n');
	const mergedChunks = mergeWindowChunks(windowChunks, windows);

	console.log(`Merged to ${mergedChunks.length} chunks\n`);

	// Save merged chunks immediately
	const basename = path.basename(inputPath, path.extname(inputPath));
	const modelName = model.split('/').pop();
	const outputDir = path.join(__dirname, 'output');

	fs.writeFileSync(
		path.join(outputDir, `${basename}-${modelName}-merged.json`),
		JSON.stringify({ chunks: mergedChunks }, null, 2)
	);

	console.log(`💾 output/${basename}-${modelName}-merged.json\n`);

	// Validate and analyze final merged chunks
	console.log('Final Chunks Analysis:\n');
	validateChunks(mergedChunks, fileContent.length);
	analyzeChunks(mergedChunks, fileContent);

	// Save final output
	fs.writeFileSync(
		path.join(outputDir, `${basename}-${modelName}-final.json`),
		JSON.stringify({ chunks: mergedChunks }, null, 2)
	);

	console.log(`💾 output/${basename}-${modelName}-final.json\n`);
}

main().catch((error) => {
	console.error('❌', error.message);
	process.exit(1);
});
