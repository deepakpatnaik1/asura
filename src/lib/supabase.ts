import { createClient } from '@supabase/supabase-js';

// Get credentials from environment (works in both SvelteKit and Node.js)
const PUBLIC_SUPABASE_URL = (typeof globalThis !== 'undefined' && globalThis.PUBLIC_SUPABASE_URL) ||
	process.env.PUBLIC_SUPABASE_URL ||
	'';

const PUBLIC_SUPABASE_ANON_KEY = (typeof globalThis !== 'undefined' && globalThis.PUBLIC_SUPABASE_ANON_KEY) ||
	process.env.PUBLIC_SUPABASE_ANON_KEY ||
	'';

export const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
