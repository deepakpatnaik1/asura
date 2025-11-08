import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import OpenAI from 'openai';
import { FIREWORKS_API_KEY } from '$env/static/private';

const fireworks = new OpenAI({
	baseURL: 'https://api.fireworks.ai/inference/v1',
	apiKey: FIREWORKS_API_KEY
});

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { message } = await request.json();

		if (!message) {
			return json({ error: 'Message is required' }, { status: 400 });
		}

		const completion = await fireworks.chat.completions.create({
			model: 'accounts/fireworks/models/qwen3-235b-a22b',
			messages: [{ role: 'user', content: message }],
			max_tokens: 4096,
			temperature: 0.7
		});

		const response = completion.choices[0]?.message?.content || 'No response generated';

		return json({ response });
	} catch (error) {
		console.error('Chat API error:', error);
		return json({ error: 'Failed to generate response' }, { status: 500 });
	}
};
