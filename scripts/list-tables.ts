/**
 * List all tables in Supabase database
 */

import { createClient } from '@supabase/supabase-js';

async function listTables() {
	const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl || !serviceRoleKey) {
		console.error('Missing environment variables');
		process.exit(1);
	}

	const client = createClient(supabaseUrl, serviceRoleKey);

	// Try to query information_schema to list tables
	const { data, error } = await client
		.rpc('exec_sql', {
			query: `
				SELECT table_name
				FROM information_schema.tables
				WHERE table_schema = 'public'
				AND table_type = 'BASE TABLE'
				ORDER BY table_name;
			`
		});

	if (error) {
		console.log('RPC method not available, trying alternative...\n');

		// Try known tables from the project
		const knownTables = ['models', 'conversations', 'messages', 'files', 'file_contents'];

		console.log('Testing known tables:');
		for (const tableName of knownTables) {
			const { data, error } = await client
				.from(tableName)
				.select('*')
				.limit(1);

			if (error) {
				console.log(`  ❌ ${tableName}: ${error.message}`);
			} else {
				console.log(`  ✅ ${tableName}: accessible`);
			}
		}
	} else {
		console.log('Tables in database:');
		console.log(data);
	}
}

listTables();
