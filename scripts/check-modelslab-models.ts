import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data, error } = await supabase
    .from('models')
    .select('model_name, model_identifier, provider, is_active')
    .eq('provider', 'modelslab');

  if (error) {
    console.log('Error:', error.message);
  } else {
    console.log('ModelsLab models in database:');
    data?.forEach(m => {
      console.log(`  ${m.model_name}: ${m.model_identifier} (active: ${m.is_active})`);
    });
  }
}

main();
