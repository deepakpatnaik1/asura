/**
 * Gmail Webhook - Supabase Edge Function
 *
 * Receives Pub/Sub push notifications from Gmail API watch.
 * Stores notifications in gmail_notifications table for Felix to process.
 *
 * Deployment: Hosted Supabase project (needs public URL)
 * Database: Hosted Supabase (same project as Edge Function)
 *
 * Flow:
 * 1. Gmail watch triggers → Pub/Sub → this Edge Function
 * 2. Edge Function stores email + historyId in hosted DB
 * 3. Felix (Aether) polls hosted DB for unprocessed notifications
 * 4. Felix processes notification using local gmail_accounts tokens
 *
 * Pub/Sub message format:
 * {
 *   "message": {
 *     "data": "base64-encoded-json",
 *     "messageId": "unique-id",
 *     "publishTime": "timestamp"
 *   },
 *   "subscription": "projects/PROJECT/subscriptions/SUB_NAME"
 * }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

interface PubSubMessage {
	message: {
		data: string;
		messageId: string;
		publishTime: string;
	};
	subscription: string;
}

interface GmailNotification {
	emailAddress: string;
	historyId: string;
}

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') {
		return new Response('ok', { headers: corsHeaders });
	}

	try {
		const pubsubMessage: PubSubMessage = await req.json();
		console.log('Received:', pubsubMessage.message.messageId);

		// Decode Gmail notification
		const dataString = atob(pubsubMessage.message.data);
		const notification: GmailNotification = JSON.parse(dataString);
		console.log('Email:', notification.emailAddress, 'History:', notification.historyId);

		// Connect to hosted Supabase (same project as this Edge Function)
		const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
		const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
		const supabase = createClient(supabaseUrl, supabaseKey);

		// Store notification (no account lookup - Felix will join locally)
		const { error } = await supabase.from('gmail_notifications').insert({
			email_address: notification.emailAddress,
			history_id: notification.historyId,
			pubsub_message_id: pubsubMessage.message.messageId,
			raw_payload: pubsubMessage
		});

		if (error) {
			if (error.code === '23505') {
				console.log('Duplicate, ignoring');
				return new Response(JSON.stringify({ status: 'duplicate' }), {
					headers: { ...corsHeaders, 'Content-Type': 'application/json' }
				});
			}
			throw error;
		}

		console.log('Stored notification for:', notification.emailAddress);

		return new Response(JSON.stringify({ status: 'ok' }), {
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
