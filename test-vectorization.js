import { generateEmbedding, VectorizationError } from './src/lib/vectorization.ts';

const TEST_CASES = {
	success: 0,
	failure: 0,
	skipped: 0
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function log(label, message) {
	console.log(`[${label}] ${message}`);
}

function assert(condition, message) {
	if (!condition) {
		console.error(`  ✗ ASSERTION FAILED: ${message}`);
		throw new Error(message);
	}
	console.log(`  ✓ ${message}`);
}

function cosineSimilarity(a, b) {
	const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
	const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
	const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
	return dot / (magA * magB);
}

// ============================================================================
// TEST CASES
// ============================================================================

async function testSuccessfulEmbedding() {
	log('TEST', 'Test 1: Successful embedding generation');
	try {
		const text = 'User decided to pivot from B2B to B2C based on market research';
		const embedding = await generateEmbedding(text);

		assert(
			Array.isArray(embedding),
			'Result is an array'
		);
		assert(
			embedding.length === 1024,
			`Embedding has 1024 dimensions (got ${embedding.length})`
		);
		assert(
			embedding.every(val => typeof val === 'number'),
			'All values are numbers'
		);
		assert(
			embedding.every(val => Math.abs(val) < 100),
			'Values are in reasonable range (< 100 absolute)'
		);

		TEST_CASES.success++;
		log('TEST', 'PASSED: Successful embedding generation');
	} catch (error) {
		TEST_CASES.failure++;
		log('ERROR', `FAILED: ${error.message}`);
		throw error;
	}
}

async function testEmptyTextError() {
	log('TEST', 'Test 2: Empty text should throw EMPTY_TEXT error');
	try {
		await generateEmbedding('');
		TEST_CASES.failure++;
		log('ERROR', 'FAILED: Should have thrown error for empty text');
		throw new Error('Empty text did not throw error');
	} catch (error) {
		if (error instanceof VectorizationError && error.code === 'EMPTY_TEXT') {
			assert(
				error.message.includes('empty'),
				'Error message mentions empty text'
			);
			TEST_CASES.success++;
			log('TEST', 'PASSED: Empty text error');
		} else {
			TEST_CASES.failure++;
			log('ERROR', `FAILED: Wrong error type - ${error.message}`);
			throw error;
		}
	}
}

async function testWhitespaceOnlyError() {
	log('TEST', 'Test 3: Whitespace-only text should throw EMPTY_TEXT error');
	try {
		await generateEmbedding('   \n\t  ');
		TEST_CASES.failure++;
		log('ERROR', 'FAILED: Should have thrown error for whitespace-only text');
		throw new Error('Whitespace-only text did not throw error');
	} catch (error) {
		if (error instanceof VectorizationError && error.code === 'EMPTY_TEXT') {
			TEST_CASES.success++;
			log('TEST', 'PASSED: Whitespace-only text error');
		} else {
			TEST_CASES.failure++;
			log('ERROR', `FAILED: Wrong error type - ${error.message}`);
			throw error;
		}
	}
}

async function testSemanticSimilarity() {
	log('TEST', 'Test 4: Semantic similarity - related texts should have higher similarity');
	try {
		// Related texts (should have high similarity)
		const emb1 = await generateEmbedding('pricing strategy for SaaS');
		const emb2 = await generateEmbedding('cost model for subscription service');

		// Unrelated text
		const emb3 = await generateEmbedding('weather forecast for tomorrow');

		const sim_related = cosineSimilarity(emb1, emb2);
		const sim_unrelated_1 = cosineSimilarity(emb1, emb3);
		const sim_unrelated_2 = cosineSimilarity(emb2, emb3);

		log('SIMILARITY', `Related texts: ${sim_related.toFixed(4)}`);
		log('SIMILARITY', `Unrelated pair 1: ${sim_unrelated_1.toFixed(4)}`);
		log('SIMILARITY', `Unrelated pair 2: ${sim_unrelated_2.toFixed(4)}`);

		assert(
			sim_related > sim_unrelated_1,
			'Related texts have higher similarity than unrelated'
		);
		assert(
			sim_related > sim_unrelated_2,
			'Related texts have higher similarity than unrelated'
		);

		TEST_CASES.success++;
		log('TEST', 'PASSED: Semantic similarity test');
	} catch (error) {
		TEST_CASES.failure++;
		log('ERROR', `FAILED: ${error.message}`);
		throw error;
	}
}

async function testConsistentEmbeddings() {
	log('TEST', 'Test 5: Same input should produce identical embeddings');
	try {
		const text = 'Founder pivoted strategy after user interviews';
		const emb1 = await generateEmbedding(text);
		const emb2 = await generateEmbedding(text);

		// Arrays should be identical
		assert(
			emb1.every((val, i) => val === emb2[i]),
			'Identical inputs produce identical embeddings'
		);

		TEST_CASES.success++;
		log('TEST', 'PASSED: Consistent embeddings test');
	} catch (error) {
		TEST_CASES.failure++;
		log('ERROR', `FAILED: ${error.message}`);
		throw error;
	}
}

async function testSpecialCharactersAndUnicode() {
	log('TEST', 'Test 6: Special characters and Unicode should work');
	try {
		const texts = [
			'Decision: implement feature A & B',
			'Cost: $1,000 per month',
			'Timeline: Q1-Q2 2025',
			'Émojis and special: café, naïve, 🎯',
			'Code: const x = 42;'
		];

		for (const text of texts) {
			const embedding = await generateEmbedding(text);
			assert(
				embedding.length === 1024,
				`Embedding for "${text.substring(0, 20)}..." has 1024 dimensions`
			);
		}

		TEST_CASES.success++;
		log('TEST', 'PASSED: Special characters test');
	} catch (error) {
		TEST_CASES.failure++;
		log('ERROR', `FAILED: ${error.message}`);
		throw error;
	}
}

async function testLongText() {
	log('TEST', 'Test 7: Long but valid text should work');
	try {
		// Generate text that's long but under 32K token limit
		const longText = 'Decision: ' + 'The team decided to implement a new feature that would revolutionize our product offering. '.repeat(50);
		log('INFO', `Text length: ${longText.length} chars (~${Math.ceil(longText.length / 4)} tokens)`);

		const embedding = await generateEmbedding(longText);
		assert(
			embedding.length === 1024,
			'Long text produces 1024-dim embedding'
		);

		TEST_CASES.success++;
		log('TEST', 'PASSED: Long text test');
	} catch (error) {
		TEST_CASES.failure++;
		log('ERROR', `FAILED: ${error.message}`);
		throw error;
	}
}

// ============================================================================
// TEST RUNNER
// ============================================================================

async function runAllTests() {
	console.log('\n' + '='.repeat(70));
	console.log('VECTORIZATION TEST SUITE');
	console.log('='.repeat(70));
	console.log('Running comprehensive tests for Voyage AI integration...\n');

	try {
		await testSuccessfulEmbedding();
		console.log();

		await testEmptyTextError();
		console.log();

		await testWhitespaceOnlyError();
		console.log();

		await testSemanticSimilarity();
		console.log();

		await testConsistentEmbeddings();
		console.log();

		await testSpecialCharactersAndUnicode();
		console.log();

		await testLongText();
		console.log();

	} catch (error) {
		console.error('\nTest suite encountered critical error:', error);
		process.exit(1);
	}

	// Print summary
	console.log('='.repeat(70));
	console.log('TEST SUMMARY');
	console.log('='.repeat(70));
	console.log(`Passed:  ${TEST_CASES.success}`);
	console.log(`Failed:  ${TEST_CASES.failure}`);
	console.log(`Skipped: ${TEST_CASES.skipped}`);

	if (TEST_CASES.failure > 0) {
		console.error('\nSome tests failed!');
		process.exit(1);
	} else {
		console.log('\n✓ All tests passed!');
		process.exit(0);
	}
}

// Run tests
runAllTests().catch((error) => {
	console.error('Fatal error:', error);
	process.exit(1);
});
