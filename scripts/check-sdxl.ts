import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data, error } = await supabase
    .from('models')
    .select('model_name, model_identifier, provider, is_active')
    .eq('model_identifier', 'fal-ai/fast-sdxl')
    .single();

  if (error) {
    console.log('Not found:', error.message);
  } else {
    console.log('Found:', data);
  }
}

main();
