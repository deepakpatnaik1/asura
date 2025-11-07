import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { processChatMessage } from '$lib/services/chat-orchestrator';
import { parseFireworksStream } from '$lib/services/fireworks';
import type { PersonaName } from '$lib/types/database.types';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { userQuery, personaName } = await request.json();

		// TODO: Get user ID from auth session
		// For now, using a fixed test UUID
		const userId = '00000000-0000-0000-0000-000000000001';

		if (!userQuery || !personaName) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		// Validate persona name
		const validPersonas: PersonaName[] = ['gunnar', 'vlad', 'kirby', 'stefan', 'ananya', 'samara'];
		if (!validPersonas.includes(personaName)) {
			return json({ error: 'Invalid persona name' }, { status: 400 });
		}

		// Process chat message and get streaming response
		const { stream, onComplete } = await processChatMessage(
			userId,
			personaName as PersonaName,
			userQuery
		);

		// Create readable stream that accumulates full response
		let fullResponse = '';
		const transformedStream = new ReadableStream({
			async start(controller) {
				try {
					for await (const chunk of parseFireworksStream(stream)) {
						fullResponse += chunk;
						controller.enqueue(new TextEncoder().encode(chunk));
					}
					controller.close();

					// After streaming completes, run Call 2 and save to database
					await onComplete(fullResponse);
				} catch (error) {
					console.error('Stream error:', error);
					controller.error(error);
				}
			}
		});

		return new Response(transformedStream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				'Connection': 'keep-alive'
			}
		});
	} catch (error) {
		console.error('Chat API error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
