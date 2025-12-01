/**
 * Tests for Zod validation schemas
 */
import { describe, it, expect } from 'vitest';
import {
	chatMessageSchema,
	compressSchema,
	settingsUpdateSchema,
	readerUploadSchema,
	processArticleSchema,
	readerChatSchema,
	extractImagesSchema,
	deleteArticleSchema,
	validateSchema
} from '$lib/schemas';

describe('chatMessageSchema', () => {
	it('accepts valid message with persona', () => {
		const result = chatMessageSchema.safeParse({
			message: 'Hello, how are you?',
			persona: 'gunnar'
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.message).toBe('Hello, how are you?');
			expect(result.data.persona).toBe('gunnar');
		}
	});

	it('accepts valid message without persona', () => {
		const result = chatMessageSchema.safeParse({
			message: 'Hello!'
		});
		expect(result.success).toBe(true);
	});

	it('rejects empty message', () => {
		const result = chatMessageSchema.safeParse({
			message: ''
		});
		expect(result.success).toBe(false);
	});

	it('rejects missing message', () => {
		const result = chatMessageSchema.safeParse({});
		expect(result.success).toBe(false);
	});

	it('rejects invalid persona', () => {
		const result = chatMessageSchema.safeParse({
			message: 'Hello',
			persona: 'invalid'
		});
		expect(result.success).toBe(false);
	});

	it('rejects message exceeding max length', () => {
		const result = chatMessageSchema.safeParse({
			message: 'a'.repeat(50001)
		});
		expect(result.success).toBe(false);
	});
});

describe('compressSchema', () => {
	const validUuid = '550e8400-e29b-41d4-a716-446655440000';

	it('accepts valid compression request', () => {
		const result = compressSchema.safeParse({
			superjournal_id: validUuid,
			user_message: 'Test message',
			ai_response: 'Test response',
			persona_name: 'gunnar'
		});
		expect(result.success).toBe(true);
	});

	it('rejects invalid UUID', () => {
		const result = compressSchema.safeParse({
			superjournal_id: 'invalid-uuid',
			user_message: 'Test message',
			ai_response: 'Test response',
			persona_name: 'gunnar'
		});
		expect(result.success).toBe(false);
	});

	it('rejects missing fields', () => {
		const result = compressSchema.safeParse({
			superjournal_id: validUuid
		});
		expect(result.success).toBe(false);
	});
});

describe('settingsUpdateSchema', () => {
	it('accepts valid settings update', () => {
		const result = settingsUpdateSchema.safeParse({
			selected_conversation_model: 'claude-3-opus'
		});
		expect(result.success).toBe(true);
	});

	it('accepts multiple fields', () => {
		const result = settingsUpdateSchema.safeParse({
			selected_conversation_model: 'claude-3-opus',
			selected_reader_model: 'claude-3-sonnet'
		});
		expect(result.success).toBe(true);
	});

	it('accepts null active_reader_article_id', () => {
		const result = settingsUpdateSchema.safeParse({
			active_reader_article_id: null
		});
		expect(result.success).toBe(true);
	});

	it('rejects empty object', () => {
		const result = settingsUpdateSchema.safeParse({});
		expect(result.success).toBe(false);
	});
});

describe('readerUploadSchema', () => {
	it('accepts valid HTML', () => {
		const result = readerUploadSchema.safeParse({
			html: '<html><body>Hello</body></html>'
		});
		expect(result.success).toBe(true);
	});

	it('rejects empty HTML', () => {
		const result = readerUploadSchema.safeParse({
			html: ''
		});
		expect(result.success).toBe(false);
	});

	it('rejects missing HTML', () => {
		const result = readerUploadSchema.safeParse({});
		expect(result.success).toBe(false);
	});
});

describe('processArticleSchema', () => {
	const validUuid = '550e8400-e29b-41d4-a716-446655440000';

	it('accepts valid article_id', () => {
		const result = processArticleSchema.safeParse({
			article_id: validUuid
		});
		expect(result.success).toBe(true);
	});

	it('rejects invalid UUID format', () => {
		const result = processArticleSchema.safeParse({
			article_id: 'not-a-uuid'
		});
		expect(result.success).toBe(false);
	});
});

describe('readerChatSchema', () => {
	const validUuid = '550e8400-e29b-41d4-a716-446655440000';

	it('accepts valid chat request', () => {
		const result = readerChatSchema.safeParse({
			article_id: validUuid,
			message: 'What is the article about?'
		});
		expect(result.success).toBe(true);
	});

	it('accepts chat with chart_index', () => {
		const result = readerChatSchema.safeParse({
			article_id: validUuid,
			message: 'Explain this chart',
			chart_index: 0
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.chart_index).toBe(0);
		}
	});

	it('accepts null chart_index', () => {
		const result = readerChatSchema.safeParse({
			article_id: validUuid,
			message: 'Question',
			chart_index: null
		});
		expect(result.success).toBe(true);
	});

	it('rejects negative chart_index', () => {
		const result = readerChatSchema.safeParse({
			article_id: validUuid,
			message: 'Question',
			chart_index: -1
		});
		expect(result.success).toBe(false);
	});

	it('rejects message exceeding max length', () => {
		const result = readerChatSchema.safeParse({
			article_id: validUuid,
			message: 'a'.repeat(10001)
		});
		expect(result.success).toBe(false);
	});
});

describe('extractImagesSchema', () => {
	const validUuid = '550e8400-e29b-41d4-a716-446655440000';

	it('accepts valid request', () => {
		const result = extractImagesSchema.safeParse({
			article_id: validUuid,
			html: '<html><img src="test.jpg" /></html>'
		});
		expect(result.success).toBe(true);
	});

	it('rejects missing article_id', () => {
		const result = extractImagesSchema.safeParse({
			html: '<html></html>'
		});
		expect(result.success).toBe(false);
	});
});

describe('deleteArticleSchema', () => {
	const validUuid = '550e8400-e29b-41d4-a716-446655440000';

	it('accepts valid article_id', () => {
		const result = deleteArticleSchema.safeParse({
			article_id: validUuid
		});
		expect(result.success).toBe(true);
	});
});

describe('validateSchema helper', () => {
	it('returns success with data for valid input', () => {
		const result = validateSchema(chatMessageSchema, { message: 'Hello' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.message).toBe('Hello');
		}
	});

	it('returns error response for invalid input', () => {
		const result = validateSchema(chatMessageSchema, { message: '' });
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBeDefined();
		}
	});
});
