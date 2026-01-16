/**
 * Message Test Fixtures
 *
 * Sample chat messages and conversations for testing.
 */

export interface SuperjournalEntry {
	id: string;
	user_id: string;
	persona_name: string;
	user_message: string;
	ai_response: string;
	model_identifier: string;
	created_at: string;
}

export interface JournalEntry {
	id: string;
	superjournal_id: string;
	user_id: string;
	turn_essence: string;
	participants: string[];
	conversation_arc: string;
	salience_score: number;
	is_starred: boolean;
	embedding: string | null;
	created_at: string;
}

// Sample superjournal entries
export const testSuperjournal1: SuperjournalEntry = {
	id: 'sj-1-test',
	user_id: 'user-1-test-uuid-12345',
	persona_name: 'gunnar',
	user_message: 'What are the key principles of software architecture?',
	ai_response:
		'Software architecture encompasses several key principles: separation of concerns, modularity, abstraction, and encapsulation. These principles help create maintainable and scalable systems.',
	model_identifier: 'claude-sonnet-4-5-20250929',
	created_at: '2024-11-20T10:00:00.000Z'
};

export const testSuperjournal2: SuperjournalEntry = {
	id: 'sj-2-test',
	user_id: 'user-1-test-uuid-12345',
	persona_name: 'kirby',
	user_message: 'Help me brainstorm ideas for a creative writing project.',
	ai_response:
		'How exciting! Let me spark some creative ideas for you. Consider exploring themes of transformation, unexpected connections, or hidden worlds within the mundane.',
	model_identifier: 'claude-sonnet-4-5-20250929',
	created_at: '2024-11-20T11:00:00.000Z'
};

// Sample journal entries (compressed)
export const testJournal1: JournalEntry = {
	id: 'j-1-test',
	superjournal_id: 'sj-1-test',
	user_id: 'user-1-test-uuid-12345',
	turn_essence: 'Boss asked about software architecture fundamentals; Gunnar explained core principles: separation of concerns, modularity, abstraction, encapsulation.',
	participants: ['boss', 'gunnar'],
	conversation_arc: 'Architecture fundamentals inquiry; structured explanation of core principles',
	salience_score: 7,
	is_starred: false,
	embedding: null,
	created_at: '2024-11-20T10:01:00.000Z'
};

// Sample orphan entry (superjournal without journal compression)
export const testOrphanEntry: SuperjournalEntry = {
	id: 'sj-orphan-test',
	user_id: 'user-1-test-uuid-12345',
	persona_name: 'gunnar',
	user_message: 'This message failed to compress',
	ai_response: 'Response that was never compressed to journal',
	model_identifier: 'claude-sonnet-4-5-20250929',
	created_at: '2024-11-19T10:00:00.000Z'
};

// User settings
export interface UserSettings {
	user_id: string;
	selected_conversation_model: string;
	selected_compression_model: string;
	selected_reader_model: string;
	selected_embedding_model: string;
	selected_persona: string;
	active_reader_article_id: string | null;
	created_at: string;
	updated_at: string;
}

export const testUserSettings: UserSettings = {
	user_id: 'user-1-test-uuid-12345',
	selected_conversation_model: 'claude-sonnet-4-5-20250929',
	selected_compression_model: 'claude-haiku-3-5-20241022',
	selected_reader_model: 'claude-sonnet-4-5-20250929',
	selected_embedding_model: 'voyage-3',
	selected_persona: 'gunnar',
	active_reader_article_id: null,
	created_at: '2024-11-01T00:00:00.000Z',
	updated_at: '2024-11-20T00:00:00.000Z'
};
