import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hsxjcowijclwdxcmhbhs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzeGpjb3dpamNsd2R4Y21oYmhzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUyMDc0OSwiZXhwIjoyMDc4MDk2NzQ5fQ.0emQ-XbFsGsMi7Ve1YWQZKowDlRrrYapBpSQp49jPlQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchChunks() {
  const fileId = '0aefb7db-064e-4334-b348-4fbd149ac95b';

  // Fetch all chunks for this file
  const { data: chunks, error } = await supabase
    .from('file_chunks')
    .select('chunk_index, chunk_text, description, created_at')
    .eq('file_id', fileId)
    .order('chunk_index', { ascending: true });

  if (error) {
    console.error('Error fetching chunks:', error);
    return;
  }

  console.log(JSON.stringify(chunks, null, 2));
}

fetchChunks();
