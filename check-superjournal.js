import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hsxjcowijclwdxcmhbhs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzeGpjb3dpamNsd2R4Y21oYmhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1MjA3NDksImV4cCI6MjA3ODA5Njc0OX0.j7vqsRPUpEXdKhOcxPoII3tWLM_6SJl6nNeSvfRrq7s';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const { data, error } = await supabase
  .from('superjournal')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(3);

if (error) {
  console.error('Error:', error);
} else {
  console.log('Superjournal entries:', data.length);
  data.forEach((entry, i) => {
    console.log(`\n--- Entry ${i + 1} ---`);
    console.log('ID:', entry.id);
    console.log('User message:', entry.user_message?.substring(0, 100));
    console.log('AI response:', entry.ai_response?.substring(0, 100));
    console.log('Created:', entry.created_at);
  });
}
