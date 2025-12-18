/**
 * Export database schema to JSON for documentation
 *
 * Queries Supabase for:
 * - Tables and columns (from existing tables-and-columns.txt)
 * - Storage buckets (live query)
 *
 * Outputs to: /Users/d.patnaik/code/vault/docs/aether/schema.json
 * Deletes any older schema*.json files in that directory
 *
 * Usage: npx tsx scripts/export-schema.ts
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';

const DOCS_DIR = '/Users/d.patnaik/code/vault/docs/aether';
const OUTPUT_FILE = join(DOCS_DIR, 'schema.json');
const TABLES_FILE = join(DOCS_DIR, 'tables-and-columns.txt');

interface Column {
	name: string;
	type: string;
}

interface Table {
	name: string;
	columns: Column[];
}

interface SchemaExport {
	exported_at: string;
	tables: Table[];
	storage_buckets: string[];
}

async function exportSchema() {
	const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl || !serviceRoleKey) {
		console.error('Missing environment variables: PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
		process.exit(1);
	}

	const client = createClient(supabaseUrl, serviceRoleKey);

	console.log('Exporting schema...\n');

	// Delete older schema files
	try {
		const files = readdirSync(DOCS_DIR);
		for (const file of files) {
			if (file.startsWith('schema') && file.endsWith('.json')) {
				const filePath = join(DOCS_DIR, file);
				unlinkSync(filePath);
				console.log(`Deleted old: ${file}`);
			}
		}
	} catch (e) {
		// Directory might not exist
	}

	// Read tables from existing file (this is the source of truth from SQL query)
	let tables: Table[] = [];
	try {
		const existingContent = readFileSync(TABLES_FILE, 'utf8');
		const parsed = JSON.parse(existingContent) as Array<{ table_name: string; columns: string }>;

		tables = parsed.map((t) => ({
			name: t.table_name,
			columns: t.columns.split(', ').map((col) => {
				const match = col.match(/^(\w+)\s*\(([^)]+)\)$/);
				return match
					? { name: match[1], type: match[2] }
					: { name: col, type: 'unknown' };
			})
		}));
		console.log(`Read ${tables.length} tables from ${TABLES_FILE}`);
	} catch (e) {
		console.error('Could not read tables-and-columns.txt:', e);
	}

	// Query storage buckets (live)
	const { data: bucketsData, error: bucketsError } = await client.storage.listBuckets();
	const storage_buckets = bucketsError ? [] : (bucketsData || []).map(b => b.name);
	console.log(`Found ${storage_buckets.length} storage buckets: ${storage_buckets.join(', ')}`);

	// Build export object
	const schema: SchemaExport = {
		exported_at: new Date().toISOString(),
		tables,
		storage_buckets
	};

	// Write output
	writeFileSync(OUTPUT_FILE, JSON.stringify(schema, null, 2));
	console.log(`\nSchema exported to: ${OUTPUT_FILE}`);

	// Print summary
	console.log('\n=== Schema Summary ===');
	console.log(`Tables: ${schema.tables.length}`);
	for (const table of schema.tables) {
		console.log(`  - ${table.name} (${table.columns.length} columns)`);
	}
	console.log(`Storage buckets: ${schema.storage_buckets.join(', ') || 'none'}`);
}

exportSchema().catch(console.error);
