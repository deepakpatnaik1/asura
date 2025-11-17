/**
 * Test script for semantic chunking functionality
 *
 * Run with: npx tsx test-semantic-chunking.ts
 */

import { chunkTextBySemantic } from './src/lib/file-chunker';

// Test text with clear topic shifts
const testText = `
Dr. Sarah Chen is a CISO with 15 years experience. She specializes in compliance automation. Her background is in cybersecurity and regulatory frameworks.

The regulatory landscape is complex and constantly evolving. GDPR and HIPAA have different requirements. Companies struggle to keep up with changing regulations.

AI can help automate policy parsing and analysis. Machine learning models can extract requirements from regulatory documents. This reduces manual effort significantly.

Technical controls must map to regulations accurately. This is a manual process today. It takes weeks to complete initial mapping.

Our solution provides automated compliance mapping. We use natural language processing to understand regulations. Then we map them to technical controls automatically.

The pricing strategy is usage-based with a monthly subscription. Companies pay per policy analyzed. Volume discounts are available for enterprise customers.

Our technical architecture uses microservices and cloud infrastructure. We deploy on AWS with Kubernetes orchestration. The system scales horizontally to handle large document volumes.
`.trim();

async function runTest() {
	console.log('='.repeat(80));
	console.log('SEMANTIC CHUNKING TEST');
	console.log('='.repeat(80));
	console.log('');

	console.log('Input text length:', testText.length, 'characters');
	console.log('Input word count:', testText.split(/\s+/).length, 'words');
	console.log('');

	try {
		console.log('Chunking text with default parameters...');
		console.log('- Target tokens: 768');
		console.log('- Similarity threshold: 0.5');
		console.log('');

		const startTime = Date.now();
		const result = await chunkTextBySemantic({
			text: testText,
			targetChunkTokens: 768,
			similarityThreshold: 0.5
		});
		const endTime = Date.now();

		console.log('✓ Chunking completed in', (endTime - startTime) / 1000, 'seconds');
		console.log('');

		console.log('Results:');
		console.log('-'.repeat(80));
		console.log('Total chunks:', result.chunks.length);
		console.log('Chunk boundaries:', result.boundaries);
		console.log('');

		result.chunks.forEach((chunk, i) => {
			console.log(`Chunk ${i + 1}:`);
			console.log(`  Words: ${result.chunkWordCounts[i]}`);
			console.log(`  Tokens (est): ${result.chunkTokenCounts[i]}`);
			console.log(`  Boundary: char ${result.boundaries[i]}`);
			console.log(`  Text preview: "${chunk.substring(0, 100)}..."`);
			console.log('');
		});

		console.log('='.repeat(80));
		console.log('TEST PASSED');
		console.log('='.repeat(80));

	} catch (error) {
		console.error('='.repeat(80));
		console.error('TEST FAILED');
		console.error('='.repeat(80));
		console.error('');
		console.error('Error:', error);
		process.exit(1);
	}
}

// Run the test
runTest();
