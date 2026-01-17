/**
 * Felix Daily Check - Supabase Edge Function (Cron)
 *
 * Runs at 9am Berlin time every day.
 * Sets a flag that tells Aether "time to check starred emails".
 *
 * Aether (running locally) sees this flag, does the actual email scanning
 * (since it has access to Gmail tokens), and shows the Stage Manager flash
 * if there's something Boss should know about.
 *
 * Cron schedule: 0 8 * * * (8am UTC = 9am Berlin in winter, adjust for DST)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') {
		return new Response('ok', { headers: corsHeaders });
	}

	try {
		// Connect to hosted Supabase (same project as this Edge Function)
		const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
		const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
		const supabase = createClient(supabaseUrl, supabaseKey);

		// Insert a trigger for Aether to pick up
		const { error } = await supabase.from('felix_cron_triggers').insert({
			trigger_type: 'daily_email_check',
			triggered_at: new Date().toISOString()
		});

		if (error) {
			// Might be duplicate if already triggered today
			if (error.code === '23505') {
				console.log('Already triggered today, skipping');
				return new Response(JSON.stringify({ status: 'already_triggered' }), {
					headers: { ...corsHeaders, 'Content-Type': 'application/json' }
				});
			}
			throw error;
		}

		console.log('Daily check trigger set for:', new Date().toISOString());

		return new Response(JSON.stringify({ status: 'triggered' }), {
			headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Error:', error);
		return new Response(JSON.stringify({ error: String(error) }), {
			status: 500,
			headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		});
	}
});
