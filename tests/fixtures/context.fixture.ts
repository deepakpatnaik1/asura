/**
 * Context Test Fixtures
 *
 * Provides test data for context building and decision arc tests.
 */

/**
 * Sample decision arc data
 */
export const sampleDecisionArc = {
	id: 'decision-arc-123',
	userId: 'test-user-id',
	timestamp: '2024-01-01T00:00:00.000Z',
	decision: 'Decided to pivot from B2B to B2C market',
	context: 'Market research showed higher demand in consumer segment',
	relatedFiles: ['file-1', 'file-2'],
	embedding: Array.from({ length: 1024 }, (_, i) => Math.cos(i / 100))
};

/**
 * Sample factual chunks
 */
export const sampleFactualChunks = [
	{
		id: 'chunk-1',
		text: 'The company was founded in 2020 with a focus on enterprise software.',
		fileId: 'file-1',
		chunkIndex: 0,
		embedding: Array.from({ length: 1024 }, (_, i) => Math.sin(i / 100))
	},
	{
		id: 'chunk-2',
		text: 'Annual revenue reached $10M in 2023, with 80% from B2B customers.',
		fileId: 'file-1',
		chunkIndex: 1,
		embedding: Array.from({ length: 1024 }, (_, i) => Math.sin((i + 100) / 100))
	},
	{
		id: 'chunk-3',
		text: 'Consumer market analysis showed 3x higher demand for similar products.',
		fileId: 'file-2',
		chunkIndex: 0,
		embedding: Array.from({ length: 1024 }, (_, i) => Math.sin((i + 200) / 100))
	}
];

/**
 * Sample chat message
 */
export const sampleChatMessage = {
	id: 'message-123',
	role: 'user' as const,
	content: 'Why did we decide to pivot to B2C?',
	timestamp: '2024-01-01T12:00:00.000Z'
};

/**
 * Sample search results
 */
export const sampleSearchResults = {
	decisionArcs: [sampleDecisionArc],
	factualChunks: sampleFactualChunks,
	relevanceScores: {
		'decision-arc-123': 0.95,
		'chunk-1': 0.85,
		'chunk-2': 0.90,
		'chunk-3': 0.88
	}
};

/**
 * Sample built context
 */
export const sampleBuiltContext = {
	systemPrompt: `You are an AI assistant with access to the user's decision history and document library.

Recent Decisions:
- 2024-01-01: Decided to pivot from B2B to B2C market
  Context: Market research showed higher demand in consumer segment

Relevant Information:
- The company was founded in 2020 with a focus on enterprise software.
- Annual revenue reached $10M in 2023, with 80% from B2B customers.
- Consumer market analysis showed 3x higher demand for similar products.

Use this context to provide informed responses about the user's business and decisions.`,

	metadata: {
		decisionArcsIncluded: 1,
		factualChunksIncluded: 3,
		totalTokens: 150,
		buildTime: 45
	}
};

/**
 * Sample conversation history
 */
export const sampleConversationHistory = [
	{
		id: 'msg-1',
		role: 'user' as const,
		content: 'What was our revenue last year?',
		timestamp: '2024-01-01T10:00:00.000Z'
	},
	{
		id: 'msg-2',
		role: 'assistant' as const,
		content: 'According to your documents, your annual revenue reached $10M in 2023.',
		timestamp: '2024-01-01T10:00:05.000Z'
	},
	{
		id: 'msg-3',
		role: 'user' as const,
		content: 'Why did we decide to pivot to B2C?',
		timestamp: '2024-01-01T10:01:00.000Z'
	}
];

/**
 * Sample streaming context
 */
export const sampleStreamingContext = {
	conversationId: 'conv-123',
	userId: 'test-user-id',
	messages: sampleConversationHistory,
	context: sampleBuiltContext.systemPrompt,
	model: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
	stream: true
};
