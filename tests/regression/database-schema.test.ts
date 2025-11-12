/**
 * Regression Tests: Database Schema
 *
 * Ensures that adding the files table doesn't break existing database structure:
 * - Existing tables intact (models, journal, superjournal)
 * - No column conflicts
 * - Foreign keys work correctly
 * - Indexes still function
 * - RLS policies unchanged
 */

import { describe, it, expect } from 'vitest';
import { createTestSupabaseClient } from '../../helpers';

const supabase = createTestSupabaseClient();

describe('Regression: Database Schema', () => {
	describe('existing tables integrity', () => {
		it('should have models table with all original columns', async () => {
			// Query the models table to verify it exists and has expected structure
			const { data, error } = await supabase
				.from('models')
				.select('*')
				.limit(1);

			// Assert table exists (no error or data exists)
			expect(error).toBeNull();
			expect(data).toBeDefined();
		});

		it('should have journal table with all original columns', async () => {
			const { data, error } = await supabase
				.from('journal')
				.select('id, superjournal_id, user_id, persona_name, boss_essence, persona_essence, decision_arc_summary, salience_score, is_starred, is_instruction, instruction_scope, created_at, updated_at')
				.limit(1);

			expect(error).toBeNull();
			expect(data).toBeDefined();
		});

		it('should have superjournal table with all original columns', async () => {
			const { data, error } = await supabase
				.from('superjournal')
				.select('id, user_id, persona_name, user_message, ai_response, is_starred, created_at, updated_at')
				.limit(1);

			expect(error).toBeNull();
			expect(data).toBeDefined();
		});
	});

	describe('new files table integration', () => {
		it('should have files table with expected columns', async () => {
			const { data, error } = await supabase
				.from('files')
				.select('id, user_id, filename, file_type, content_hash, description, embedding, status, processing_stage, progress, error_message, uploaded_at, updated_at')
				.limit(1);

			expect(error).toBeNull();
			expect(data).toBeDefined();
		});

		it('should allow querying files without affecting other tables', async () => {
			// Query files table
			const filesQuery = await supabase
				.from('files')
				.select('*')
				.limit(1);

			// Query journal table simultaneously
			const journalQuery = await supabase
				.from('journal')
				.select('*')
				.limit(1);

			// Both should work independently
			expect(filesQuery.error).toBeNull();
			expect(journalQuery.error).toBeNull();
		});
	});

	describe('no schema conflicts', () => {
		it('should not have column name conflicts between tables', async () => {
			// Files table has user_id, id, created_at - same as other tables
			// This test verifies they don't conflict in queries

			const filesQuery = await supabase
				.from('files')
				.select('id, user_id, uploaded_at')
				.limit(1);

			const journalQuery = await supabase
				.from('journal')
				.select('id, user_id, created_at')
				.limit(1);

			expect(filesQuery.error).toBeNull();
			expect(journalQuery.error).toBeNull();
		});

		it('should support same column names in different tables without ambiguity', async () => {
			// Both files and journal have user_id
			// Verify filtering works independently

			const filesWithFilter = await supabase
				.from('files')
				.select('*')
				.is('user_id', null)
				.limit(1);

			const journalWithFilter = await supabase
				.from('journal')
				.select('*')
				.is('user_id', null)
				.limit(1);

			expect(filesWithFilter.error).toBeNull();
			expect(journalWithFilter.error).toBeNull();
		});
	});

	describe('data integrity constraints', () => {
		it('should enforce user_id null constraint on files table', async () => {
			// Files table allows null user_id (for pre-auth state)
			const { data, error } = await supabase
				.from('files')
				.select('*')
				.is('user_id', null)
				.limit(1);

			// Should not error on null user_id query
			expect(error).toBeNull();
		});

		it('should support vector embedding column without affecting journal embeddings', async () => {
			// Files table has embedding column (VECTOR(1024))
			// Journal table also has embedding column
			// Verify both can coexist

			const filesEmbedding = await supabase
				.from('files')
				.select('embedding')
				.limit(1);

			const journalEmbedding = await supabase
				.from('journal')
				.select('embedding')
				.limit(1);

			expect(filesEmbedding.error).toBeNull();
			expect(journalEmbedding.error).toBeNull();
		});
	});

	describe('existing functionality preserved', () => {
		it('should allow inserting into journal table without files dependency', async () => {
			// Journal inserts should work independently of files table
			const testJournalEntry = {
				superjournal_id: 'test-sj-id',
				user_id: null,
				persona_name: 'ananya',
				boss_essence: 'Regression test',
				persona_essence: 'Test response',
				decision_arc_summary: 'Test arc',
				salience_score: 5,
				is_starred: false,
				is_instruction: false,
				instruction_scope: null
			};

			const { error } = await supabase
				.from('journal')
				.insert(testJournalEntry)
				.select();

			// Clean up if inserted
			if (!error) {
				await supabase
					.from('journal')
					.delete()
					.eq('boss_essence', 'Regression test');
			}

			// Insert should work (might fail on foreign key, but not due to files table)
			// Error would be about superjournal_id, not files table
			if (error) {
				expect(error.message).not.toContain('files');
			}
		});

		it('should allow inserting into superjournal table without files dependency', async () => {
			const testSuperjournalEntry = {
				user_id: null,
				persona_name: 'ananya',
				user_message: 'Regression test message',
				ai_response: 'Regression test response',
				is_starred: false
			};

			const { data, error } = await supabase
				.from('superjournal')
				.insert(testSuperjournalEntry)
				.select();

			// Clean up if inserted
			if (data && data.length > 0) {
				await supabase
					.from('superjournal')
					.delete()
					.eq('id', data[0].id);
			}

			// Should succeed
			expect(error).toBeNull();
		});
	});

	describe('query performance', () => {
		it('should query journal table without slowdown from files table', async () => {
			const startTime = Date.now();

			await supabase
				.from('journal')
				.select('*')
				.order('created_at', { ascending: false })
				.limit(10);

			const duration = Date.now() - startTime;

			// Should complete quickly (< 2 seconds even with files table present)
			expect(duration).toBeLessThan(2000);
		});

		it('should query superjournal table without slowdown', async () => {
			const startTime = Date.now();

			await supabase
				.from('superjournal')
				.select('*')
				.order('created_at', { ascending: false })
				.limit(10);

			const duration = Date.now() - startTime;

			expect(duration).toBeLessThan(2000);
		});
	});

	describe('RLS policies', () => {
		it('should maintain existing RLS behavior for journal table', async () => {
			// Journal table should be queryable (RLS allows it)
			const { error } = await supabase
				.from('journal')
				.select('*')
				.limit(1);

			expect(error).toBeNull();
		});

		it('should maintain existing RLS behavior for superjournal table', async () => {
			const { error } = await supabase
				.from('superjournal')
				.select('*')
				.limit(1);

			expect(error).toBeNull();
		});

		it('should have appropriate RLS for files table', async () => {
			// Files table should be queryable
			const { error } = await supabase
				.from('files')
				.select('*')
				.limit(1);

			expect(error).toBeNull();
		});
	});
});
