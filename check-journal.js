import { createClient } from '@supabase/supabase-js';

// These should match your .env file
const SUPABASE_URL = 'https://hsxjcowijclwdxcmhbhs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzeGpjb3dpamNsd2R4Y21oYmhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1MjA3NDksImV4cCI6MjA3ODA5Njc0OX0.j7vqsRPUpEXdKhOcxPoII3tWLM_6SJl6nNeSvfRrq7s';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const { data, error } = await supabase
  .from('journal')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(2);

if (error) {
  console.error('Error:', error);
} else {
  console.log('Journal entries:');
  data.forEach((entry, i) => {
    console.log(`\n--- Entry ${i + 1} ---`);
    console.log('ID:', entry.id);
    console.log('Decision Arc:', entry.decision_arc_summary);
    console.log('Embedding:', entry.embedding ? `Present (${JSON.parse(entry.embedding).length} dimensions)` : 'NULL');
    console.log('Created:', entry.created_at);
  });
}
