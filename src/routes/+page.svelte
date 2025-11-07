<script lang="ts">
	import { onMount } from 'svelte';
	import type { PersonaName } from '$lib/types/database.types';

	let messages: Array<{ role: 'user' | 'assistant'; content: string; persona?: string }> = [];
	let userInput = '';
	let selectedPersona: PersonaName = 'gunnar';
	let isLoading = false;
	let messagesContainer: HTMLDivElement;

	const personas: Array<{ name: PersonaName; label: string; color: string }> = [
		{ name: 'gunnar', label: 'Gunnar', color: 'bg-blue-600' },
		{ name: 'vlad', label: 'Vlad', color: 'bg-purple-600' },
		{ name: 'kirby', label: 'Kirby', color: 'bg-orange-600' },
		{ name: 'stefan', label: 'Stefan', color: 'bg-green-600' },
		{ name: 'ananya', label: 'Ananya', color: 'bg-pink-600' },
		{ name: 'samara', label: 'Samara', color: 'bg-teal-600' }
	];

	async function sendMessage() {
		if (!userInput.trim() || isLoading) return;

		const query = userInput.trim();
		userInput = '';
		isLoading = true;

		// Add user message
		messages = [...messages, { role: 'user', content: query }];

		// Add placeholder for assistant message
		const assistantMessageIndex = messages.length;
		messages = [...messages, { role: 'assistant', content: '', persona: selectedPersona }];

		try {
			const response = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userQuery: query,
					personaName: selectedPersona
				})
			});

			if (!response.ok) {
				throw new Error('Failed to send message');
			}

			const reader = response.body?.getReader();
			const decoder = new TextDecoder();

			if (reader) {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					const chunk = decoder.decode(value);
					messages[assistantMessageIndex].content += chunk;
					messages = messages; // Trigger reactivity

					// Auto-scroll
					scrollToBottom();
				}
			}
		} catch (error) {
			console.error('Error sending message:', error);
			messages[assistantMessageIndex].content = 'Error: Failed to get response';
		} finally {
			isLoading = false;
		}
	}

	function scrollToBottom() {
		if (messagesContainer) {
			setTimeout(() => {
				messagesContainer.scrollTop = messagesContainer.scrollHeight;
			}, 0);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	onMount(() => {
		scrollToBottom();
	});

	$: if (messages.length) {
		scrollToBottom();
	}
</script>

<div class="flex h-screen flex-col">
	<!-- Header -->
	<header class="border-b border-slate-700 bg-slate-800 px-6 py-2">
		<div class="mx-auto flex max-w-4xl items-center justify-between">
			<h1 class="text-xl font-bold text-white">Asura</h1>
			<div class="flex gap-2">
				{#each personas as persona}
					<button
						class="rounded px-2 py-1 text-xs font-medium text-white transition-colors {selectedPersona ===
						persona.name
							? persona.color
							: 'bg-slate-700 hover:bg-slate-600'}"
						onclick={() => (selectedPersona = persona.name)}
					>
						{persona.label}
					</button>
				{/each}
			</div>
		</div>
	</header>

	<!-- Messages -->
	<div bind:this={messagesContainer} class="flex-1 overflow-y-auto px-6 py-4">
		<div class="mx-auto max-w-4xl space-y-6">
			{#each messages as message}
				<div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
					<div
						class="max-w-[80%] rounded-lg px-4 py-3 {message.role === 'user'
							? 'bg-blue-600 text-white'
							: 'bg-slate-700 text-slate-100'}"
					>
						{#if message.role === 'assistant' && message.persona}
							<div class="mb-1 text-xs font-semibold uppercase text-slate-400">
								{personas.find((p) => p.name === message.persona)?.label}
							</div>
						{/if}
						<div class="whitespace-pre-wrap">{message.content}</div>
					</div>
				</div>
			{/each}

			{#if isLoading && messages[messages.length - 1]?.content === ''}
				<div class="flex justify-start">
					<div class="max-w-[80%] rounded-lg bg-slate-700 px-4 py-3 text-slate-100">
						<div class="flex items-center gap-2">
							<div class="h-2 w-2 animate-bounce rounded-full bg-slate-400"></div>
							<div class="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:0.2s]">
							</div>
							<div class="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:0.4s]">
							</div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Input -->
	<div class="border-t border-slate-700 bg-slate-800 px-6 py-2">
		<div class="mx-auto flex max-w-4xl gap-2">
			<textarea
				bind:value={userInput}
				onkeydown={handleKeydown}
				placeholder="Ask {personas.find((p) => p.name === selectedPersona)?.label} anything..."
				class="flex-1 resize-none rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-slate-100 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				rows="1"
				disabled={isLoading}
			></textarea>
			<button
				onclick={sendMessage}
				disabled={isLoading || !userInput.trim()}
				class="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
			>
				Send
			</button>
		</div>
	</div>
</div>
