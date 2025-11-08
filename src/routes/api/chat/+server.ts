import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import OpenAI from 'openai';
import { FIREWORKS_API_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

const fireworks = new OpenAI({
	baseURL: 'https://api.fireworks.ai/inference/v1',
	apiKey: FIREWORKS_API_KEY
});

const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { message, persona = 'ananya' } = await request.json();

		if (!message) {
			return json({ error: 'Message is required' }, { status: 400 });
		}

		// Call 1A: Initial response (hidden from user)
		const call1A = await fireworks.chat.completions.create({
			model: 'accounts/fireworks/models/qwen3-235b-a22b',
			messages: [{ role: 'user', content: message }],
			max_tokens: 4096,
			temperature: 0.7
		});

		const call1AResponse = call1A.choices[0]?.message?.content || 'No response generated';

		// Call 1B: Refine response with critique prompt
		const call1B = await fireworks.chat.completions.create({
			model: 'accounts/fireworks/models/qwen3-235b-a22b',
			messages: [
				{ role: 'user', content: message },
				{ role: 'assistant', content: call1AResponse },
				{ role: 'user', content: 'Shorten this response.' }
			],
			max_tokens: 4096,
			temperature: 0.7
		});

		const call1BResponse = call1B.choices[0]?.message?.content || 'No response generated';

		// Save to Superjournal
		const { error: dbError } = await supabase.from('superjournal').insert({
			user_id: null, // Nullable for development, will use real user_id when auth is added
			persona_name: persona,
			user_message: message,
			ai_response: call1BResponse
		});

		if (dbError) {
			console.error('Database error:', dbError);
			// Don't fail the request if DB write fails
		}

		return json({ response: call1BResponse });
	} catch (error) {
		console.error('Chat API error:', error);
		return json({ error: 'Failed to generate response' }, { status: 500 });
	}
};
