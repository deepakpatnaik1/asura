/**
 * Restore Gunnar data from hosted to local Supabase
 */
const { createClient } = require('@supabase/supabase-js');

// Hosted Supabase (source)
const hosted = createClient(
  'https://hsxjcowijclwdxcmhbhs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzeGpjb3dpamNsd2R4Y21oYmhzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUyMDc0OSwiZXhwIjoyMDc4MDk2NzQ5fQ.0emQ-XbFsGsMi7Ve1YWQZKowDlRrrYapBpSQp49jPlQ'
);

// Local Supabase (destination)
const local = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function restore() {
  console.log('Fetching Gunnar superjournal from hosted...');

  // 1. Get Gunnar superjournal entries
  const { data: superjournals, error: sjError } = await hosted
    .from('superjournal')
    .select('*')
    .eq('persona_name', 'gunnar')
    .order('created_at', { ascending: true });

  if (sjError) {
    console.error('Failed to fetch superjournal:', sjError.message);
    return;
  }

  console.log(`Found ${superjournals.length} Gunnar superjournal entries`);

  // 2. Get journal entries for those superjournals
  const sjIds = superjournals.map(s => s.id);
  const { data: journals, error: jError } = await hosted
    .from('journal')
    .select('*')
    .in('superjournal_id', sjIds)
    .order('created_at', { ascending: true });

  if (jError) {
    console.error('Failed to fetch journal:', jError.message);
    return;
  }

  console.log(`Found ${journals.length} Gunnar journal entries`);

  // 3. Insert superjournal to local (need user_settings first for FK)
  const userId = superjournals[0]?.user_id;
  if (userId) {
    // Ensure user_settings exists
    const { error: settingsError } = await local
      .from('user_settings')
      .upsert({ user_id: userId }, { onConflict: 'user_id' });

    if (settingsError) {
      console.error('Failed to create user_settings:', settingsError.message);
      return;
    }
  }

  // 4. Insert superjournals
  console.log('\nInserting superjournals to local...');
  const { error: sjInsertError } = await local
    .from('superjournal')
    .upsert(superjournals, { onConflict: 'id' });

  if (sjInsertError) {
    console.error('Failed to insert superjournal:', sjInsertError.message);
    return;
  }
  console.log(`Inserted ${superjournals.length} superjournal entries`);

  // 5. Insert journals (strip columns that may not exist locally)
  console.log('Inserting journals to local...');
  const cleanedJournals = journals.map(j => {
    const { instruction_scope, is_instruction, ...rest } = j;
    return rest;
  });

  const { error: jInsertError } = await local
    .from('journal')
    .upsert(cleanedJournals, { onConflict: 'id' });

  if (jInsertError) {
    console.error('Failed to insert journal:', jInsertError.message);
    return;
  }
  console.log(`Inserted ${journals.length} journal entries`);

  console.log('\n✅ Gunnar data restored!');
}

restore().catch(console.error);
