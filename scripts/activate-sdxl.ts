import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { error } = await supabase
    .from('models')
    .update({ is_active: true })
    .eq('model_identifier', 'fal-ai/fast-sdxl');

  if (error) {
    console.log('Error:', error.message);
  } else {
    console.log('Stable Diffusion XL activated');
  }
}

main();
