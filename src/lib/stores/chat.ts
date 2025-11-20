import { writable } from 'svelte/store';

interface Message {
	id: string;
	boss: string;
	ai: string;
	timestamp: string;
	model_identifier?: string;
}

export const currentMessage = writable<Message | null>(null);
export const isLoading = writable(false);

export async function sendMessage(userMessage: string, persona?: string): Promise<void> {
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
			body: JSON.stringify({ message: userMessage, persona })
		});

		if (!response.ok) {
			throw new Error('Failed to send message');
		}

		// Simple JSON response
		const data = await response.json();

		// Update with completed AI response
		currentMessage.set({
			id: crypto.randomUUID(),
			boss: userMessage,
			ai: data.message,
			timestamp,
			model_identifier: data.model_identifier
		});

		isLoading.set(false);
	} catch (error) {
		console.error('Error sending message:', error);

		// Don't clear the message - preserve UI state and show error
		currentMessage.update(msg => {
			if (msg) {
				return {
					...msg,
					ai: '❌ Failed to generate response. Please try again.'
				};
			}
			return msg;
		});

		isLoading.set(false);
	}
}
