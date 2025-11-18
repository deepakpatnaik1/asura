import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://hsxjcowijclwdxcmhbhs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzeGpjb3dpamNsd2R4Y21oYmhzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUyMDc0OSwiZXhwIjoyMDc4MDk2NzQ5fQ.0emQ-XbFsGsMi7Ve1YWQZKowDlRrrYapBpSQp49jPlQ'
);

async function testCascadeDelete() {
  console.log('\n=== CASCADE DELETE TEST ===\n');

  try {
    // Step 1: Create test file
    console.log('Step 1: Creating test file...');
    const { data: file, error: fileError } = await supabase
      .from('files')
      .insert({
        filename: 'cascade-test.pdf',
        file_type: 'pdf',
        content_hash: 'test-hash-' + Date.now(),
        status: 'ready',
        progress: 100
      })
      .select('id')
      .single();

    if (fileError) throw fileError;
    console.log(`✅ Test file created: ${file.id}`);

    // Step 2: Create test chunks
    console.log('\nStep 2: Creating test chunks...');
    const { error: chunk0Error } = await supabase
      .from('file_chunks')
      .insert({
        file_id: file.id,
        chunk_index: 0,
        chunk_text: 'Test chunk 0 text',
        description: 'Test chunk 0 description',
        embedding: Array(1024).fill(0)
      });

    if (chunk0Error) throw chunk0Error;

    const { error: chunk1Error } = await supabase
      .from('file_chunks')
      .insert({
        file_id: file.id,
        chunk_index: 1,
        chunk_text: 'Test chunk 1 text',
        description: 'Test chunk 1 description',
        embedding: Array(1024).fill(0)
      });

    if (chunk1Error) throw chunk1Error;
    console.log(`✅ Created 2 test chunks for file ${file.id}`);

    // Step 3: Verify chunks exist
    console.log('\nStep 3: Verifying chunks exist...');
    const { data: chunksBefore, error: chunksBeforeError } = await supabase
      .from('file_chunks')
      .select('id, chunk_index')
      .eq('file_id', file.id);

    if (chunksBeforeError) throw chunksBeforeError;
    console.log(`✅ Found ${chunksBefore.length} chunks before delete:`, chunksBefore);

    // Step 4: Delete file (should CASCADE to chunks)
    console.log('\nStep 4: Deleting file (testing CASCADE)...');
    const { error: deleteError } = await supabase
      .from('files')
      .delete()
      .eq('id', file.id);

    if (deleteError) throw deleteError;
    console.log(`✅ File ${file.id} deleted`);

    // Step 5: Verify chunks are deleted (CASCADE worked)
    console.log('\nStep 5: Verifying chunks are deleted...');
    const { data: chunksAfter, error: chunksAfterError } = await supabase
      .from('file_chunks')
      .select('id')
      .eq('file_id', file.id);

    if (chunksAfterError) throw chunksAfterError;

    if (chunksAfter.length === 0) {
      console.log(`✅ CASCADE DELETE VERIFIED: 0 chunks remain (expected)`);
      console.log('\n=== TEST PASSED ===\n');
      return true;
    } else {
      console.log(`❌ CASCADE DELETE FAILED: ${chunksAfter.length} chunks still exist (expected 0)`);
      console.log('Remaining chunks:', chunksAfter);
      console.log('\n=== TEST FAILED ===\n');
      return false;
    }

  } catch (error) {
    console.error('\n❌ TEST ERROR:', error.message);
    console.log('\n=== TEST FAILED ===\n');
    return false;
  }
}

testCascadeDelete().then(success => {
  process.exit(success ? 0 : 1);
});
