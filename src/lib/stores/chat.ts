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

		const data = await response.json();

		// Update with AI response
		currentMessage.set({
			id: crypto.randomUUID(),
			boss: userMessage,
			ai: data.response,
			timestamp
		});
	} catch (error) {
		console.error('Error sending message:', error);
		currentMessage.set(null);
	} finally {
		isLoading.set(false);
	}
}
