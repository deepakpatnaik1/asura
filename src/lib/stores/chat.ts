import { writable } from 'svelte/store';

interface Message {
	id: string;
	boss: string;
	ai: string;
	timestamp: string;
}

export const currentMessage = writable<Message | null>(null);
export const isLoading = writable(false);

export async function sendMessage(userMessage: string): Promise<void> {
	const now = new Date();
	const timestamp = now.toLocaleString('en-US', {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	});

	// Show boss card immediately
	currentMessage.set({
		id: crypto.randomUUID(),
		boss: userMessage,
		ai: '',
		timestamp
	});

	isLoading.set(true);

	try {
		const response = await fetch('/api/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: userMessage })
		});

		if (!response.ok) {
			throw new Error('Failed to send message');
		}

		// Handle SSE streaming
		const reader = response.body?.getReader();
		const decoder = new TextDecoder();
		let aiResponse = '';

		if (!reader) {
			throw new Error('No response body');
		}

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			const chunk = decoder.decode(value);
			const lines = chunk.split('\n');

			for (const line of lines) {
				if (line.startsWith('data: ')) {
					const data = JSON.parse(line.slice(6));

					if (data.content) {
						aiResponse += data.content;
						// Update message with streaming content
						currentMessage.set({
							id: crypto.randomUUID(),
							boss: userMessage,
							ai: aiResponse,
							timestamp
						});
					}

					if (data.done) {
						isLoading.set(false);
					}
				}
			}
		}
	} catch (error) {
		console.error('Error sending message:', error);
		currentMessage.set(null);
		isLoading.set(false);
	}
}
