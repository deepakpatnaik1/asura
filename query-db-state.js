import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://hsxjcowijclwdxcmhbhs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzeGpjb3dpamNsd2R4Y21oYmhzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUyMDc0OSwiZXhwIjoyMDc4MDk2NzQ5fQ.0emQ-XbFsGsMi7Ve1YWQZKowDlRrrYapBpSQp49jPlQ'
);

async function queryDatabaseState() {
  console.log('\n=== DATABASE STATE SNAPSHOT ===\n');

  try {
    // 1. Row counts
    console.log('1. ROW COUNTS:\n');

    const { count: superjournalCount } = await supabase
      .from('superjournal')
      .select('*', { count: 'exact', head: true });
    console.log(`   superjournal: ${superjournalCount} rows`);

    const { count: journalCount } = await supabase
      .from('journal')
      .select('*', { count: 'exact', head: true });
    console.log(`   journal: ${journalCount} rows`);

    const { count: filesCount } = await supabase
      .from('files')
      .select('*', { count: 'exact', head: true });
    console.log(`   files: ${filesCount} rows`);

    const { count: chunksCount } = await supabase
      .from('file_chunks')
      .select('*', { count: 'exact', head: true });
    console.log(`   file_chunks: ${chunksCount} rows`);

    const { count: settingsCount } = await supabase
      .from('user_settings')
      .select('*', { count: 'exact', head: true });
    console.log(`   user_settings: ${settingsCount} rows`);

    // 2. user_id NULL counts
    console.log('\n2. NULL user_id COUNTS:\n');

    const { count: superjournalNulls } = await supabase
      .from('superjournal')
      .select('*', { count: 'exact', head: true })
      .is('user_id', null);
    console.log(`   superjournal: ${superjournalNulls} NULL user_id rows`);

    const { count: journalNulls } = await supabase
      .from('journal')
      .select('*', { count: 'exact', head: true })
      .is('user_id', null);
    console.log(`   journal: ${journalNulls} NULL user_id rows`);

    const { count: filesNulls } = await supabase
      .from('files')
      .select('*', { count: 'exact', head: true })
      .is('user_id', null);
    console.log(`   files: ${filesNulls} NULL user_id rows`);

    const { count: chunksNulls } = await supabase
      .from('file_chunks')
      .select('*', { count: 'exact', head: true })
      .is('user_id', null);
    console.log(`   file_chunks: ${chunksNulls} NULL user_id rows`);

    const { count: settingsNulls } = await supabase
      .from('user_settings')
      .select('*', { count: 'exact', head: true })
      .is('user_id', null);
    console.log(`   user_settings: ${settingsNulls} NULL user_id rows`);

    // 3. Sample data from each table
    console.log('\n3. SAMPLE DATA (first row from each table):\n');

    const { data: superjournalSample } = await supabase
      .from('superjournal')
      .select('id, user_id, persona_name, created_at')
      .limit(1);
    console.log('   superjournal:', superjournalSample.length > 0 ? superjournalSample[0] : 'No rows');

    const { data: journalSample } = await supabase
      .from('journal')
      .select('id, user_id, salience_score, is_starred, created_at')
      .limit(1);
    console.log('   journal:', journalSample.length > 0 ? journalSample[0] : 'No rows');

    const { data: filesSample } = await supabase
      .from('files')
      .select('id, user_id, filename, status, uploaded_at')
      .limit(1);
    console.log('   files:', filesSample.length > 0 ? filesSample[0] : 'No rows');

    console.log('\n=== SNAPSHOT COMPLETE ===\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
  }
}

queryDatabaseState();
