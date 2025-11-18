import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://hsxjcowijclwdxcmhbhs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzeGpjb3dpamNsd2R4Y21oYmhzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUyMDc0OSwiZXhwIjoyMDc4MDk2NzQ5fQ.0emQ-XbFsGsMi7Ve1YWQZKowDlRrrYapBpSQp49jPlQ'
);

async function testVectorSearchIsolation() {
  console.log('\n=== VECTOR SEARCH ISOLATION TEST ===\n');
  console.log('Purpose: Prove that search_journal_by_embedding() leaks NULL user_id rows\n');

  try {
    // Step 1: Create test entries with different user IDs
    console.log('Step 1: Creating test journal entries...\n');

    const userA_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const userB_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    // User A's entry
    const { data: entryA, error: errorA } = await supabase
      .from('journal')
      .insert({
        user_id: userA_id,
        persona_name: 'gunnar',
        boss_essence: 'User A secret information',
        persona_essence: 'Response for User A',
        decision_arc_summary: 'User A owns this data exclusively',
        salience_score: 5,
        embedding: Array(1024).fill(0.1)
      })
      .select('id')
      .single();

    if (errorA) throw errorA;
    console.log(`✅ Created User A entry: ${entryA.id}`);

    // User B's entry
    const { data: entryB, error: errorB } = await supabase
      .from('journal')
      .insert({
        user_id: userB_id,
        persona_name: 'kirby',
        boss_essence: 'User B secret information',
        persona_essence: 'Response for User B',
        decision_arc_summary: 'User B owns this data exclusively',
        salience_score: 5,
        embedding: Array(1024).fill(0.2)
      })
      .select('id')
      .single();

    if (errorB) throw errorB;
    console.log(`✅ Created User B entry: ${entryB.id}`);

    // NULL user_id entry (simulates legacy data)
    const { data: entryNull, error: errorNull } = await supabase
      .from('journal')
      .insert({
        user_id: null,
        persona_name: 'gunnar',
        boss_essence: 'Legacy data with NULL user_id',
        persona_essence: 'This should NOT be visible to any user',
        decision_arc_summary: 'NULL user_id data leak test',
        salience_score: 5,
        embedding: Array(1024).fill(0.15)
      })
      .select('id')
      .single();

    if (errorNull) throw errorNull;
    console.log(`✅ Created NULL entry: ${entryNull.id}\n`);

    // Step 2: Search as User A
    console.log('Step 2: Searching as User A...\n');

    const { data: resultsA, error: searchErrorA } = await supabase
      .rpc('search_journal_by_embedding', {
        query_embedding: JSON.stringify(Array(1024).fill(0.15)),
        match_count: 50,
        exclude_ids: [],
        user_id_filter: userA_id
      });

    if (searchErrorA) throw searchErrorA;

    console.log(`User A search returned ${resultsA.length} results:`);
    resultsA.forEach(r => {
      console.log(`  - ${r.id}: user_id=${r.user_id || 'NULL'}, summary="${r.decision_arc_summary.substring(0, 40)}..."`);
    });

    // Check for leaks
    const userASeesUserB = resultsA.some(r => r.user_id === userB_id);
    const userASeesNull = resultsA.some(r => r.user_id === null);

    console.log(`\n🔍 User A sees User B data: ${userASeesUserB ? '❌ YES (LEAK!)' : '✅ NO (correct)'}`);
    console.log(`🔍 User A sees NULL data: ${userASeesNull ? '❌ YES (LEAK!)' : '✅ NO (correct)'}`);

    // Step 3: Search as User B
    console.log('\nStep 3: Searching as User B...\n');

    const { data: resultsB, error: searchErrorB } = await supabase
      .rpc('search_journal_by_embedding', {
        query_embedding: JSON.stringify(Array(1024).fill(0.15)),
        match_count: 50,
        exclude_ids: [],
        user_id_filter: userB_id
      });

    if (searchErrorB) throw searchErrorB;

    console.log(`User B search returned ${resultsB.length} results:`);
    resultsB.forEach(r => {
      console.log(`  - ${r.id}: user_id=${r.user_id || 'NULL'}, summary="${r.decision_arc_summary.substring(0, 40)}..."`);
    });

    const userBSeesUserA = resultsB.some(r => r.user_id === userA_id);
    const userBSeesNull = resultsB.some(r => r.user_id === null);

    console.log(`\n🔍 User B sees User A data: ${userBSeesUserA ? '❌ YES (LEAK!)' : '✅ NO (correct)'}`);
    console.log(`🔍 User B sees NULL data: ${userBSeesNull ? '❌ YES (LEAK!)' : '✅ NO (correct)'}`);

    // Step 4: Cleanup
    console.log('\nStep 4: Cleaning up test entries...\n');

    await supabase.from('journal').delete().eq('id', entryA.id);
    await supabase.from('journal').delete().eq('id', entryB.id);
    await supabase.from('journal').delete().eq('id', entryNull.id);

    console.log('✅ Test entries deleted\n');

    // Step 5: Results
    console.log('=== TEST RESULTS ===\n');

    const hasLeaks = userASeesUserB || userASeesNull || userBSeesUserA || userBSeesNull;

    if (hasLeaks) {
      console.log('❌ SECURITY VULNERABILITY CONFIRMED\n');
      console.log('The search_journal_by_embedding() function leaks data:');
      if (userASeesNull || userBSeesNull) {
        console.log('  - NULL user_id rows are visible to ALL users');
        console.log('  - This confirms the "OR j.user_id IS NULL" clause bug');
      }
      if (userASeesUserB || userBSeesUserA) {
        console.log('  - Users can see each other\'s data (cross-user leak)');
      }
      console.log('\nFix required: Remove "OR j.user_id IS NULL" from function (line 33)');
      return false;
    } else {
      console.log('✅ NO LEAKS DETECTED\n');
      console.log('Vector search correctly isolates users (unexpected - bug may be fixed)');
      return true;
    }

  } catch (error) {
    console.error('\n❌ TEST ERROR:', error.message);
    console.log('\n=== TEST FAILED ===\n');
    return false;
  }
}

testVectorSearchIsolation().then(success => {
  process.exit(success ? 0 : 1);
});
