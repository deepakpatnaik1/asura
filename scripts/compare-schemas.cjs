const { createClient } = require('@supabase/supabase-js');

const hosted = createClient(
  'https://hsxjcowijclwdxcmhbhs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzeGpjb3dpamNsd2R4Y21oYmhzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUyMDc0OSwiZXhwIjoyMDc4MDk2NzQ5fQ.0emQ-XbFsGsMi7Ve1YWQZKowDlRrrYapBpSQp49jPlQ'
);

const local = createClient(
  process.env.PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function compareSchemas() {
  // Get one row from each to see columns
  const [hostedSJ, localSJ, hostedJ, localJ] = await Promise.all([
    hosted.from('superjournal').select('*').limit(1),
    local.from('superjournal').select('*').limit(1),
    hosted.from('journal').select('*').limit(1),
    local.from('journal').select('*').limit(1)
  ]);

  const hostedSJCols = hostedSJ.data?.[0] ? Object.keys(hostedSJ.data[0]).sort() : [];
  const localSJCols = localSJ.error ? ['ERROR: ' + localSJ.error.message] : (localSJ.data?.[0] ? Object.keys(localSJ.data[0]).sort() : ['(empty table - checking via insert)']);

  const hostedJCols = hostedJ.data?.[0] ? Object.keys(hostedJ.data[0]).sort() : [];
  const localJCols = localJ.error ? ['ERROR: ' + localJ.error.message] : (localJ.data?.[0] ? Object.keys(localJ.data[0]).sort() : ['(empty table - checking via insert)']);

  console.log('=== SUPERJOURNAL ===');
  console.log('Hosted columns:', hostedSJCols.join(', '));
  console.log('Local columns:', Array.isArray(localSJCols) ? localSJCols.join(', ') : localSJCols);

  // Find differences
  if (Array.isArray(localSJCols) && !localSJCols[0]?.startsWith('(')) {
    const onlyHosted = hostedSJCols.filter(c => !localSJCols.includes(c));
    const onlyLocal = localSJCols.filter(c => !hostedSJCols.includes(c));
    if (onlyHosted.length) console.log('Only in hosted:', onlyHosted.join(', '));
    if (onlyLocal.length) console.log('Only in local:', onlyLocal.join(', '));
  }

  console.log('\n=== JOURNAL ===');
  console.log('Hosted columns:', hostedJCols.join(', '));
  console.log('Local columns:', Array.isArray(localJCols) ? localJCols.join(', ') : localJCols);

  // Find differences
  if (Array.isArray(localJCols) && !localJCols[0]?.startsWith('(')) {
    const onlyHosted = hostedJCols.filter(c => !localJCols.includes(c));
    const onlyLocal = localJCols.filter(c => !hostedJCols.includes(c));
    if (onlyHosted.length) console.log('Only in hosted:', onlyHosted.join(', '));
    if (onlyLocal.length) console.log('Only in local:', onlyLocal.join(', '));
  }
}

compareSchemas().catch(console.error);
